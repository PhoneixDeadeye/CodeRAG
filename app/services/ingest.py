import os
import shutil
import git
import re
import json
import logging
import stat
from typing import List, Optional, Dict
from langchain_core.documents import Document
from langchain_community.document_loaders.generic import GenericLoader
from langchain_community.document_loaders.parsers import LanguageParser
from langchain_text_splitters import RecursiveCharacterTextSplitter
from app.core.security import validate_repo_url

# Use central logging configuration
logger = logging.getLogger(__name__)

# --- Secret Scanning Patterns ---
SECRET_PATTERNS = [
    (
        r"(?i)(api[_-]?key|secret[_-]?key|auth[_-]?token|access[_-]?token)\s*[=:]\s*['\"]([a-zA-Z0-9_\-]{20,})['\"]",
        r"\1 = 'REDACTED_SECRET'",
    ),
    (r"AKIA[0-9A-Z]{16}", "REDACTED_AWS_KEY"),  # AWS Access Key ID
    (
        r"(?i)(password|passwd|pwd)\s*[=:]\s*['\"]([^'\"]{8,})['\"]",
        r"\1 = 'REDACTED_PASSWORD'",
    ),
    (r"ghp_[a-zA-Z0-9]{36}", "REDACTED_GITHUB_TOKEN"),  # GitHub Personal Access Token
    (r"sk-[a-zA-Z0-9]{32,}", "REDACTED_OPENAI_KEY"),  # OpenAI API Key
]


def redact_secrets(content: str) -> str:
    """Redact sensitive information from code content."""
    for pattern, replacement in SECRET_PATTERNS:
        content = re.sub(pattern, replacement, content)
    return content


def get_latest_commit_hash(repo_path: str) -> str:
    """Get the latest commit hash from a git repository."""
    try:
        repo = git.Repo(repo_path)
        return repo.head.commit.hexsha
    except Exception as e:
        logger.warning(f"Could not get commit hash: {e}")
        return ""


def check_cache(url: str, current_hash: str, cache_file_path: str) -> bool:
    """Check if repo needs re-indexing. Returns True if update needed."""
    if not os.path.exists(cache_file_path):
        return True

    try:
        with open(cache_file_path, "r") as f:
            data = json.load(f)
            if data.get("url") == url and data.get("hash") == current_hash:
                logger.info("[CACHED] Repo unchanged. Using cached index.")
                return False
    except Exception as e:
        logger.warning(f"Error reading cache: {e}")

    return True


def save_cache(url: str, commit_hash: str, cache_file_path: str) -> None:
    """Save repo state to cache."""
    os.makedirs(os.path.dirname(cache_file_path), exist_ok=True)
    with open(cache_file_path, "w") as f:
        json.dump({"url": url, "hash": commit_hash}, f)


def _process_repo_files(repo_path: str, repo_url: str) -> List[Document]:
    """Internal helper to load, split, and clean files from a directory."""
    from langchain_text_splitters import Language

    # 3. Load the Documents
    logger.info(f"[LOADING] Loading code files from {repo_path}...")

    loader = GenericLoader.from_filesystem(
        repo_path,
        glob="**/*",
        suffixes=[
            ".py",
            ".js",
            ".ts",
            ".java",
            ".tsx",
            ".jsx",
            ".go",
            ".rs",
            ".cpp",
            ".c",
            ".h",
            ".cs",
            ".php",
            ".rb",
            ".swift",
            ".kt",
            ".scala",
        ],
        parser=LanguageParser(),
        show_progress=True,
    )

    documents = loader.load()
    logger.info(f"[LOADED] Loaded {len(documents)} raw documents.")

    # Map extensions to LangChain Languages
    EXTENSION_MAP = {
        ".py": Language.PYTHON,
        ".js": Language.JS,
        ".jsx": Language.JS,
        ".ts": Language.TS,
        ".tsx": Language.TS,
        ".java": Language.JAVA,
        ".go": Language.GO,
        ".rs": Language.RUST,
        ".cpp": Language.CPP,
        ".c": Language.CPP,
        ".h": Language.CPP,
        ".cs": Language.CSHARP,
        ".php": Language.PHP,
        ".rb": Language.RUBY,
        ".swift": Language.SWIFT,
        ".kt": Language.KOTLIN,
        ".scala": Language.SCALA,
    }

    # 3.5. Pre-process: Detect Language and Tag
    docs_by_lang: Dict[Optional[Language], List[Document]] = {}

    for doc in documents:
        source = doc.metadata.get("source", "")
        # Add basic metadata now (refined later)
        doc.metadata["source"] = source.replace(repo_path, "").lstrip("/\\")
        doc.metadata["repo_url"] = repo_url

        ext = os.path.splitext(source)[1].lower()
        doc.metadata["file_extension"] = ext

        lang = EXTENSION_MAP.get(ext)
        if lang:
            doc.metadata["language"] = lang.value
        else:
            doc.metadata["language"] = "unknown"

        if lang not in docs_by_lang:
            docs_by_lang[lang] = []
        docs_by_lang[lang].append(doc)

    # 4. Context-Aware Chunking
    logger.info("[SPLITTING] Splitting code into chunks with syntax awareness...")

    texts: List[Document] = []

    for lang, lang_docs in docs_by_lang.items():
        if lang:
            splitter = RecursiveCharacterTextSplitter.from_language(
                language=lang, chunk_size=2000, chunk_overlap=200
            )
        else:
            # Fallback for unknown extensions
            splitter = RecursiveCharacterTextSplitter(
                chunk_size=2000, chunk_overlap=200, separators=["\n\n", "\n", " ", ""]
            )

        split_texts = splitter.split_documents(lang_docs)
        texts.extend(split_texts)

    logger.info(
        f"[CHUNKED] Created {len(texts)} code chunks from {len(docs_by_lang)} language groups."
    )

    # 5. Clean Metadata, Enhance with Language Info & Redact Secrets
    logger.info("[SECURITY] Scanning for secrets and enhancing metadata...")
    secrets_found = 0

    for i, text in enumerate(texts):
        # Metadata already partially set above, just refine
        source = text.metadata.get("source", "")
        # Extract filename
        text.metadata["filename"] = os.path.basename(source)

        # Add chunk index for tracking
        text.metadata["chunk_index"] = i

        # Estimate line numbers
        content = text.page_content
        line_count = content.count("\n") + 1
        text.metadata["estimated_lines"] = line_count

        # Try to extract function/class names from the chunk (Regex based)
        lang_str = text.metadata.get("language", "unknown")

        if lang_str == "python":
            func_matches = re.findall(
                r"^(?:async\s+)?def\s+(\w+)", content, re.MULTILINE
            )
            class_matches = re.findall(r"^class\s+(\w+)", content, re.MULTILINE)
            if func_matches:
                text.metadata["functions"] = func_matches[:5]
            if class_matches:
                text.metadata["classes"] = class_matches[:5]

        elif lang_str in ("javascript", "typescript", "js", "ts", "jsx", "tsx"):
            func_matches = re.findall(
                r"(?:function|const|let|var)\s+(\w+)\s*[=\(]", content
            )
            class_matches = re.findall(r"class\s+(\w+)", content)
            if func_matches:
                text.metadata["functions"] = func_matches[:5]
            if class_matches:
                text.metadata["classes"] = class_matches[:5]

        # Redact secrets
        original_content = text.page_content
        text.page_content = redact_secrets(text.page_content)
        if original_content != text.page_content:
            secrets_found += 1

    if secrets_found > 0:
        logger.warning(f"[REDACTED] Redacted secrets in {secrets_found} chunks.")

    return texts


def load_and_index_repo(
    url: str, repo_path: str, cache_file_path: str, force_reindex: bool = False
) -> Optional[List[Document]]:
    """
    1. Clones the repo to repo_path.
    2. Loads only code files.
    3. Splits them.
    4. Redacts secrets.
    """

    # 1. Clean previous runs (only if cloning fresh, not for persistent user repos ideally,
    # but for now we clone afresh or pull. Better to clean for simplicity vs merge conflicts)

    is_upload = url.startswith("upload://")

    # Security: Validate URL to prevent SSRF
    if not is_upload:
        validate_repo_url(url)

    if is_upload:
        # For uploads, the files are already placed there by the API
        if not os.path.exists(repo_path):
            logger.error(f"[ERROR] Uploaded repo path {repo_path} does not exist")
            return None
        logger.info(f"[UPLOAD] Processing uploaded repo at {repo_path}")
    else:
        # Git Workflow
        if os.path.exists(repo_path):
            try:
                repo = git.Repo(repo_path)
                logger.info(f"[UPDATING] Updating existing repo at {repo_path}...")
                repo.remotes.origin.pull()
            except Exception as e:
                logger.warning(
                    f"[WARNING] Could not pull, cleaning and re-cloning: {e}"
                )
                if os.path.exists(repo_path):
                    # Git uses read-only files sometimes, causing rmtree to fail on Windows
                    # We need an onerror handler to clear read-only flag
                    def on_rm_error(func, path, exc_info):
                        os.chmod(path, stat.S_IWRITE)
                        func(path)

                    shutil.rmtree(repo_path, onerror=on_rm_error)

        if not os.path.exists(repo_path):
            logger.info(f"[CLONING] Cloning {url} to {repo_path}...")
            try:
                git.Repo.clone_from(url, repo_path, depth=1)
                logger.info("[OK] Clone successful.")
            except Exception as e:
                logger.error(f"[FAILED] Error cloning repo: {e}", exc_info=True)
                raise ValueError(f"Failed to clone repository: {str(e)}")

    # 3. Process and return texts
    texts = _process_repo_files(repo_path, url)
    return texts


def load_and_index_repo_from_path(path: str) -> List[Document]:
    """Load and index a repository already present at the given path (e.g. uploaded zip)."""
    return _process_repo_files(path, "local-upload")


def get_recent_commits(repo_path: str, num_commits: int = 10) -> List[Document]:
    """Extract recent commits and their diffs for RAG indexing."""

    try:
        repo = git.Repo(repo_path)
    except Exception as e:
        logger.error(f"[WARNING] Could not access git repo: {e}")
        return []

    commit_documents = []
    try:
        commits = list(repo.iter_commits(max_count=num_commits))
    except Exception as e:
        logger.error(f"Error exploring commits: {e}")
        return []

    logger.info(f"[COMMITS] Indexing {len(commits)} recent commits...")

    for commit in commits:
        # Get commit metadata
        commit_info = f"""
Commit: {commit.hexsha[:8]}
Author: {commit.author.name} <{commit.author.email}>
Date: {commit.committed_datetime.isoformat()}
Message: {commit.message.strip()}
"""

        # Get diff for this commit (compare with parent)
        if commit.parents:
            try:
                diff = commit.parents[0].diff(commit, create_patch=True)
                diff_text = ""
                for d in diff:
                    if d.a_path:
                        diff_text += f"\n--- {d.a_path}\n"
                    if d.b_path:
                        diff_text += f"+++ {d.b_path}\n"
                    if d.diff:
                        diff_text += d.diff.decode("utf-8", errors="ignore")[
                            :2000
                        ]  # Limit size

                full_content = commit_info + "\nChanges:\n" + diff_text[:4000]
            except Exception as e:
                logger.warning(f"Could not get diff for commit {commit.hexsha}: {e}")
                full_content = commit_info + "\n(Diff unavailable)"
        else:
            full_content = commit_info + "\n(Initial commit)"

        commit_documents.append(
            Document(
                page_content=full_content,
                metadata={
                    "type": "commit",
                    "commit_hash": commit.hexsha,
                    "author": commit.author.name,
                    "date": commit.committed_datetime.isoformat(),
                    "message": commit.message.strip()[:100],
                    "source": f"git:commit:{commit.hexsha[:8]}",
                },
            )
        )

    return commit_documents
