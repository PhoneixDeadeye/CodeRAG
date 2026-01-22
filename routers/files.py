from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from database import get_db, User, Repository
from auth import get_optional_user
from pydantic import BaseModel, field_validator
from typing import Optional, List, Dict, Any, Tuple
import os
import re
import time
from functools import lru_cache
from config import settings
import logging
from utils import validate_safe_path, generate_github_link

router = APIRouter(prefix="/api/v1", tags=["files"])
logger = logging.getLogger("CodeRAG")

# --- File Tree Cache ---
# Cache file trees with 5-minute TTL to avoid repeated filesystem traversals
_file_tree_cache: Dict[str, Tuple[List[Dict], float]] = {}
FILE_TREE_CACHE_TTL = 300  # 5 minutes

# -- Models --
class FileNode(BaseModel):
    name: str
    path: str
    type: str
    children: Optional[List['FileNode']] = None

class SearchRequest(BaseModel):
    query: str
    is_regex: bool = False
    case_sensitive: bool = False
    repo_id: Optional[str] = None
    
    @field_validator('query')
    @classmethod
    def validate_query(cls, v: str) -> str:
        if not v or not v.strip():
            raise ValueError('Search query cannot be empty')
        if len(v) > 1000:
            raise ValueError('Query too long (max 1000 characters)')
        return v

class SearchResult(BaseModel):
    file_path: str
    line_number: int
    line_content: str
    match_start: int
    match_end: int

class SearchResponse(BaseModel):
    results: List[SearchResult]

class DiffRequest(BaseModel):
    file1: str
    file2: str
    repo_id: str

class DepRequest(BaseModel):
    file_path: str
    repo_id: Optional[str] = None

FileNode.model_rebuild()

# -- Helpers --
def detect_language(file_path: str) -> str:
    ext_map = {
        '.py': 'python', '.js': 'javascript', '.ts': 'typescript',
        '.tsx': 'typescriptreact', '.jsx': 'javascriptreact', '.java': 'java',
        '.go': 'go', '.rs': 'rust', '.cpp': 'cpp', '.c': 'c',
        '.h': 'c', '.hpp': 'cpp', '.md': 'markdown', '.json': 'json',
        '.css': 'css', '.scss': 'scss', '.html': 'html', '.xml': 'xml',
        '.yml': 'yaml', '.yaml': 'yaml', '.sh': 'shell', '.bash': 'shell',
        '.sql': 'sql', '.graphql': 'graphql', '.dockerfile': 'dockerfile',
        '.rb': 'ruby', '.php': 'php', '.swift': 'swift', '.kt': 'kotlin',
    }
    ext = os.path.splitext(file_path)[1].lower()
    basename = os.path.basename(file_path).lower()
    if basename == 'dockerfile': return 'dockerfile'
    if basename == 'makefile': return 'makefile'
    return ext_map.get(ext, 'plaintext')

@lru_cache(maxsize=32)
def scan_repo_symbols(repo_path: str) -> Dict[str, Any]:
    """Scans repository for symbols with caching for performance."""
    files = []
    symbols = []
    
    if not os.path.exists(repo_path):
        return {"files": [], "symbols": []}
        
    patterns = settings.LANGUAGE_PATTERNS
    
    for root, _, filess in os.walk(repo_path):
        if '.git' in root or 'node_modules' in root or '__pycache__' in root:
            continue
            
        for file in filess:
            if file.startswith('.'): continue
            
            full_path = os.path.join(root, file)
            rel_path = os.path.relpath(full_path, repo_path).replace("\\", "/")
            files.append(rel_path)
            
            # Simple heuristic for language
            lang = 'plaintext'
            if file.endswith('.py'): lang = 'python'
            elif file.endswith('.ts') or file.endswith('.tsx'): lang = 'typescript'
            elif file.endswith('.js') or file.endswith('.jsx'): lang = 'javascript'
            
            if lang in patterns:
                try:
                    with open(full_path, 'r', encoding='utf-8', errors='ignore') as f:
                        content = f.read()
                        for pattern in patterns[lang]:
                            for match in re.finditer(pattern, content):
                                symbols.append({
                                    "name": match.group(1),
                                    "type": "class" if "class" in pattern else "function",
                                    "file": rel_path
                                })
                except Exception as e:
                    logger.debug(f"Failed to scan symbols in {file}: {e}")
                    
    return {"files": files, "symbols": symbols}

# -- Helpers for Guest Access --
def get_repo_for_user_or_guest(
    repo_id: Optional[str], 
    user: Optional[User], 
    db: Session
) -> Optional[Repository]:
    """
    Get repository based on user context.
    - Authenticated: User's repos only
    - Guest: Any ready repository
    """
    if user:
        # Authenticated user - their repos only
        if repo_id:
            return db.query(Repository).filter(
                Repository.id == repo_id, 
                Repository.user_id == user.id
            ).first()
        return db.query(Repository).filter(
            Repository.user_id == user.id
        ).order_by(Repository.updated_at.desc()).first()
    else:
        # Guest - any ready repository
        if repo_id:
            return db.query(Repository).filter(
                Repository.id == repo_id,
                Repository.status == "ready"
            ).first()
        return db.query(Repository).filter(
            Repository.status == "ready"
        ).order_by(Repository.updated_at.desc()).first()


# -- Endpoints --
@router.get("/files")
async def get_file_tree(
    repo_id: Optional[str] = None, 
    db: Session = Depends(get_db), 
    user: Optional[User] = Depends(get_optional_user)
):
    """
    Retrieve the file tree structure for a repository.
    Works for both authenticated users and guests.
    Uses caching for improved performance.
    """
    repo = get_repo_for_user_or_guest(repo_id, user, db)
    
    if not repo:
        # For guests, return empty tree if no repo exists yet
        if user is None:
            return {"tree": [], "repo_url": None, "message": "No repository available. Please ingest one first."}
        raise HTTPException(status_code=404, detail="Repo not found")
    
    repo_path = repo.local_path
    if not os.path.exists(repo_path):
        return {"tree": [], "repo_url": repo.url}

    # Check cache first
    current_time = time.time()
    cache_key = repo_path
    
    if cache_key in _file_tree_cache:
        cached_tree, cached_at = _file_tree_cache[cache_key]
        if current_time - cached_at < FILE_TREE_CACHE_TTL:
            logger.debug(f"File tree cache hit for {repo_path}")
            return {"tree": cached_tree, "repo_url": repo.url, "cached": True}
        else:
            # Cache expired, remove it
            del _file_tree_cache[cache_key]

    def build_tree(path: str) -> List[FileNode]:
        nodes = []
        try:
            for item in sorted(os.listdir(path)):
                if item.startswith('.'): continue
                item_path = os.path.join(path, item)
                rel_path = item_path.replace(repo_path, "").lstrip("/\\")
                
                if os.path.isdir(item_path):
                    nodes.append(FileNode(
                        name=item, path=rel_path, type="directory",
                        children=build_tree(item_path)
                    ))
                else:
                    nodes.append(FileNode(name=item, path=rel_path, type="file"))
        except PermissionError as e:
            logger.warning(f"Permission denied accessing {path}: {e}")
        return nodes
    
    # Build tree and cache it
    tree = build_tree(repo_path)
    # Convert to dict for caching (Pydantic models aren't directly cacheable)
    tree_dicts = [node.model_dump() for node in tree]
    _file_tree_cache[cache_key] = (tree_dicts, current_time)
    logger.debug(f"File tree cached for {repo_path}")
    
    return {"tree": tree, "repo_url": repo.url}

@router.get("/file/{file_path:path}")
async def get_file_content(
    file_path: str, 
    repo_id: Optional[str] = None, 
    db: Session = Depends(get_db), 
    user: Optional[User] = Depends(get_optional_user)
):
    """
    Retrieve the content of a specific file.
    Works for both authenticated users and guests.
    """
    repo = get_repo_for_user_or_guest(repo_id, user, db)
    
    if not repo:
        raise HTTPException(status_code=404, detail="Repo not found")

    full_path = validate_safe_path(repo.local_path, file_path)
    
    if not os.path.exists(full_path):
        raise HTTPException(status_code=404, detail="File not found")
    
    file_size = os.path.getsize(full_path)
    if file_size > settings.MAX_FILE_SIZE:
        raise HTTPException(status_code=413, detail=f"File too large. Max size {settings.MAX_FILE_SIZE/1024/1024}MB")
    
    try:
        with open(full_path, 'r', encoding='utf-8', errors='replace') as f:
            content = f.read()
    except UnicodeDecodeError:
        raise HTTPException(status_code=400, detail="Binary data")
    
    return {
        "path": file_path,
        "content": content,
        "language": detect_language(file_path),
        "github_link": generate_github_link(repo.url, file_path)
    }

@router.post("/diff")
async def get_diff(
    request: DiffRequest, 
    db: Session = Depends(get_db), 
    user: Optional[User] = Depends(get_optional_user)
):
    """Compute difference between two files or versions."""
    repo = get_repo_for_user_or_guest(request.repo_id, user, db)
    if not repo:
        raise HTTPException(status_code=404, detail="Repo not found")

    path1 = validate_safe_path(repo.local_path, request.file1)
    path2 = validate_safe_path(repo.local_path, request.file2)

    content1 = ""
    content2 = ""

    if os.path.exists(path1):
        with open(path1, 'r', encoding='utf-8') as f: content1 = f.read()
    if os.path.exists(path2):
        with open(path2, 'r', encoding='utf-8') as f: content2 = f.read()
    
    return {
        "file1": {"path": request.file1, "content": content1},
        "file2": {"path": request.file2, "content": content2}
    }

@router.get("/symbols")
async def get_symbols(
    repo_id: Optional[str] = None, 
    db: Session = Depends(get_db), 
    user: Optional[User] = Depends(get_optional_user)
):
    """Extract and list code symbols (classes, functions) from the repository."""
    repo = get_repo_for_user_or_guest(repo_id, user, db)
    if not repo:
        return {"files": [], "symbols": []}

    repo_path = repo.local_path
    try:
        data = scan_repo_symbols(repo_path)
        files = data.get("files", [])
        symbols = data.get("symbols", [])
    except Exception as e:
        logger.error(f"Error scanning symbols for {repo_path}: {e}")
        files = []
        symbols = []
                    
    return {"files": files, "symbols": symbols}

@router.post("/search", response_model=SearchResponse)
async def global_search(
    request: SearchRequest, 
    db: Session = Depends(get_db), 
    user: Optional[User] = Depends(get_optional_user)
):
    """Perform a global text or regex search across the repository."""
    repo = get_repo_for_user_or_guest(request.repo_id, user, db)

    if not repo or not repo.local_path or not os.path.exists(repo.local_path):
        return {"results": []}

    results = []
    repo_path = repo.local_path
    
    try:
        flags = 0 if request.case_sensitive else re.IGNORECASE
        pattern = request.query if request.is_regex else re.escape(request.query)
        
        if request.is_regex and len(pattern) > 500:
            raise HTTPException(status_code=400, detail="Regex too complex")
        
        try:
            regex = re.compile(pattern, flags)
        except re.error:
            raise HTTPException(status_code=400, detail="Invalid regex")
        
        match_count = 0
        
        for root, _, files in os.walk(repo_path):
            if '.git' in root or 'node_modules' in root or '__pycache__' in root:
                continue
                
            for file in files:
                if match_count >= 100: break
                
                # Filter extensions
                if not any(file.endswith(ext) for ext in [".py", ".js", ".ts", ".tsx", ".jsx", ".java", ".go"]):
                     continue
                
                file_path = os.path.join(root, file)
                try:
                    with open(file_path, 'r', encoding='utf-8', errors='ignore') as f:
                        lines = f.readlines()
                        
                    for i, line in enumerate(lines):
                        if match_count >= 100: break
                        
                        for match in regex.finditer(line):
                            rel_path = os.path.relpath(file_path, repo_path).replace("\\", "/")
                            results.append(SearchResult(
                                file_path=rel_path,
                                line_number=i+1,
                                line_content=line.strip()[:200], 
                                match_start=match.start(),
                                match_end=match.end()
                            ))
                            match_count += 1
                            break 
                except Exception as e:
                    logger.debug(f"Failed to read file {file_path} for search: {e}")
                    continue
    except Exception as e:
        logger.error(f"Search error: {e}")
        raise HTTPException(status_code=500, detail="Search failed")

    return {"results": results}

@router.post("/analyze-dependencies")
async def analyze_dependencies(
    request: DepRequest, 
    db: Session = Depends(get_db), 
    user: Optional[User] = Depends(get_optional_user)
):
    """Analyze imports and dependencies for a specific file."""
    repo = get_repo_for_user_or_guest(request.repo_id, user, db)
    
    if not repo:
         raise HTTPException(status_code=404, detail="Repo not found")
    
    full_path = validate_safe_path(repo.local_path, request.file_path)
    if not os.path.exists(full_path):
         raise HTTPException(status_code=404, detail="File not found")

    if os.path.getsize(full_path) > settings.MAX_DEP_FILE_SIZE:
        return {"current_file": request.file_path, "imports": [], "imported_by": []}
         
    imports = []
    try:
        with open(full_path, 'r', encoding='utf-8', errors='ignore') as f:
            content = f.read()
        
        py_matches = re.findall(r'^(?:from|import)\s+([a-zA-Z0-9_\.]+)', content, re.MULTILINE)
        js_matches = re.findall(r'import\s+.*?from\s+[\'"](.*?)[\'"]', content)
        js_req_matches = re.findall(r'require\([\'"](.*?)[\'"]\)', content)
        
        raw_imports = py_matches + js_matches + js_req_matches
        imports = sorted(list(set(raw_imports)))
    except Exception as e:
        logger.error(f"Error parsing deps: {e}")
        
    imported_by = []
    target_name = os.path.splitext(os.path.basename(request.file_path))[0]
    
    if os.path.exists(repo.local_path):
        for root, _, files in os.walk(repo.local_path):
            if '.git' in root or 'node_modules' in root: continue
            for file in files:
                if file == os.path.basename(request.file_path): continue
                fpath = os.path.join(root, file)
                try:
                    with open(fpath, 'r', encoding='utf-8', errors='ignore') as f:
                        if target_name in f.read():
                            rel_path = os.path.relpath(fpath, repo.local_path).replace("\\", "/")
                            imported_by.append(rel_path)
                except Exception as e:
                    logger.debug(f"Failed to read file {fpath} for dependency analysis: {e}")
                    continue

    return {
        "current_file": request.file_path,
        "imports": imports,
        "imported_by": imported_by
    }
