import os
import shutil
import git
import re
import json
import logging
import stat
from typing import List, Tuple, Optional
from langchain.schema import Document
from langchain_community.document_loaders.generic import GenericLoader
from langchain_community.document_loaders.parsers import LanguageParser
from langchain_text_splitters import RecursiveCharacterTextSplitter

# Use central logging configuration
logger = logging.getLogger(__name__)

# --- Secret Scanning Patterns ---
SECRET_PATTERNS = [
    (r"(?i)(api[_-]?key|secret[_-]?key|auth[_-]?token|access[_-]?token)\s*[=:]\s*['\"]([a-zA-Z0-9_\-]{20,})['\"]", r"\1 = 'REDACTED_SECRET'"),
    (r"AKIA[0-9A-Z]{16}", "REDACTED_AWS_KEY"),  # AWS Access Key ID
    (r"(?i)(password|passwd|pwd)\s*[=:]\s*['\"]([^'\"]{8,})['\"]", r"\1 = 'REDACTED_PASSWORD'"),
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
        with open(cache_file_path, 'r') as f:
            data = json.load(f)
            if data.get('url') == url and data.get('hash') == current_hash:
                logger.info("✅ Repo unchanged. Using cached index.")
                return False
    except Exception as e:
        logger.warning(f"Error reading cache: {e}")
    
    return True

def save_cache(url: str, commit_hash: str, cache_file_path: str) -> None:
    """Save repo state to cache."""
    os.makedirs(os.path.dirname(cache_file_path), exist_ok=True)
    with open(cache_file_path, 'w') as f:
        json.dump({'url': url, 'hash': commit_hash}, f)

def _process_repo_files(repo_path: str, repo_url: str) -> List[Document]:
    """Internal helper to load, split, and clean files from a directory."""
    # 3. Load the Documents
    logger.info(f"📂 Loading code files from {repo_path}...")
    
    loader = GenericLoader.from_filesystem(
        repo_path,
        glob="**/*",
        suffixes=[".py", ".js", ".ts", ".java", ".tsx", ".jsx", ".go", ".rs", ".cpp", ".c", ".h"],
        parser=LanguageParser(),
        show_progress=True
    )
    
    documents = loader.load()
    logger.info(f"📄 Loaded {len(documents)} raw documents.")

    # 4. Context-Aware Chunking
    logger.info("✂️ Splitting code into chunks...")
    
    splitter = RecursiveCharacterTextSplitter(
        chunk_size=2000,
        chunk_overlap=200,
        separators=["\n\n", "\n", " ", ""]
    )
    
    texts = splitter.split_documents(documents)
    logger.info(f"🧩 Created {len(texts)} code chunks.")
    
    # Language detection mapping
    EXTENSION_TO_LANGUAGE = {
        ".py": "python",
        ".js": "javascript",
        ".ts": "typescript",
        ".tsx": "typescript-react",
        ".jsx": "javascript-react",
        ".java": "java",
        ".go": "go",
        ".rs": "rust",
        ".cpp": "cpp",
        ".c": "c",
        ".h": "c-header",
        ".cs": "csharp",
        ".rb": "ruby",
        ".php": "php",
        ".swift": "swift",
        ".kt": "kotlin",
        ".scala": "scala",
        ".vue": "vue",
        ".svelte": "svelte",
    }
    
    # 5. Clean Metadata, Enhance with Language Info & Redact Secrets
    logger.info("🔒 Scanning for secrets and enhancing metadata...")
    secrets_found = 0
    
    for i, text in enumerate(texts):
        source = text.metadata.get("source", "")
        
        # Clean source path
        if source:
            text.metadata["source"] = source.replace(repo_path, "").lstrip("/\\")
            text.metadata["repo_url"] = repo_url
            
            # Extract file extension and detect language
            ext = os.path.splitext(source)[1].lower()
            text.metadata["file_extension"] = ext
            text.metadata["language"] = EXTENSION_TO_LANGUAGE.get(ext, "unknown")
            
            # Extract filename
            text.metadata["filename"] = os.path.basename(source)
        
        # Add chunk index for tracking
        text.metadata["chunk_index"] = i
        
        # Estimate line numbers (rough approximation based on newline count)
        content = text.page_content
        line_count = content.count("\n") + 1
        text.metadata["estimated_lines"] = line_count
        
        # Try to extract function/class names from the chunk
        if text.metadata.get("language") == "python":
            # Extract Python function/class definitions
            func_matches = re.findall(r'^(?:async\s+)?def\s+(\w+)', content, re.MULTILINE)
            class_matches = re.findall(r'^class\s+(\w+)', content, re.MULTILINE)
            if func_matches:
                text.metadata["functions"] = func_matches[:5]  # Limit to 5
            if class_matches:
                text.metadata["classes"] = class_matches[:5]
        elif text.metadata.get("language") in ("javascript", "typescript", "typescript-react", "javascript-react"):
            # Extract JS/TS function definitions
            func_matches = re.findall(r'(?:function|const|let|var)\s+(\w+)\s*[=\(]', content)
            class_matches = re.findall(r'class\s+(\w+)', content)
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
        logger.warning(f"🔐 Redacted secrets in {secrets_found} chunks.")
        
    return texts

def load_and_index_repo(url: str, repo_path: str, cache_file_path: str, force_reindex: bool = False) -> Optional[List[Document]]:
    """
    1. Clones the repo to repo_path.
    2. Loads only code files.
    3. Splits them.
    4. Redacts secrets.
    """
    
    # 1. Clean previous runs (only if cloning fresh, not for persistent user repos ideally, 
    # but for now we clone afresh or pull. Better to clean for simplicity vs merge conflicts)
    # Strategy: If it exists, try to pull? Or just wipe?
    # SaaS safe: Wipe and Clone is safest for consistent state, though slower.
    # Optimization: 'git pull' if exists.
    
    if os.path.exists(repo_path):
        try:
            repo = git.Repo(repo_path)
            logger.info(f"🔄 updating existing repo at {repo_path}...")
            repo.remotes.origin.pull()
        except Exception as e:
            logger.warning(f"⚠️ Could not pull, cleaning and re-cloning: {e}")
            if os.path.exists(repo_path):
                # Git uses read-only files sometimes, causing rmtree to fail on Windows
                # We need an onerror handler to clear read-only flag
                def on_rm_error(func, path, exc_info):
                    os.chmod(path, stat.S_IWRITE)
                    func(path)
                    
                shutil.rmtree(repo_path, onerror=on_rm_error)

    if not os.path.exists(repo_path):
        logger.info(f"🔄 Cloning {url} to {repo_path}...")
        try:
            git.Repo.clone_from(url, repo_path, depth=1)
            logger.info("✅ Clone successful.")
        except Exception as e:
            logger.error(f"❌ Error cloning repo: {e}")
            return []

    # 2. Check if we can skip re-indexing (Smart Caching)
    commit_hash = get_latest_commit_hash(repo_path)
    if not force_reindex and not check_cache(url, commit_hash, cache_file_path):
        logger.info("✅ Repo unchanged. Skipping processing.")
        return None  # Return None to indicate no update needed
    
    # 3. Process files
    texts = _process_repo_files(repo_path, url)
    
    # 4. Save cache
    save_cache(url, commit_hash, cache_file_path)
    logger.info(f"💾 Cache updated for {url}")

    return texts

def load_and_index_repo_from_path(path: str) -> List[Document]:
    """Load and index a repository already present at the given path (e.g. uploaded zip)."""
    return _process_repo_files(path, "local-upload")

def get_recent_commits(repo_path: str, num_commits: int = 10) -> List[Document]:
    """Extract recent commits and their diffs for RAG indexing."""
    from langchain.schema import Document
    
    try:
        repo = git.Repo(repo_path)
    except Exception as e:
        logger.error(f"⚠️ Could not access git repo: {e}")
        return []
    
    commit_documents = []
    try:
        commits = list(repo.iter_commits(max_count=num_commits))
    except Exception as e:
         logger.error(f"Error exploring commits: {e}")
         return []
    
    logger.info(f"📜 Indexing {len(commits)} recent commits...")
    
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
                        diff_text += d.diff.decode('utf-8', errors='ignore')[:2000]  # Limit size
                
                full_content = commit_info + "\nChanges:\n" + diff_text[:4000]
            except Exception as e:
                logger.warning(f"Could not get diff for commit {commit.hexsha}: {e}")
                full_content = commit_info + "\n(Diff unavailable)"
        else:
            full_content = commit_info + "\n(Initial commit)"
        
        commit_documents.append(Document(
            page_content=full_content,
            metadata={
                "type": "commit",
                "commit_hash": commit.hexsha,
                "author": commit.author.name,
                "date": commit.committed_datetime.isoformat(),
                "message": commit.message.strip()[:100],
                "source": f"git:commit:{commit.hexsha[:8]}"
            }
        ))
    
    return commit_documents
