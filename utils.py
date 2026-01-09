import os
from fastapi import HTTPException
import logging

logger = logging.getLogger("CodeRAG")

def validate_safe_path(base_path: str, requested_path: str) -> str:
    """Validate that requested path is within base directory (prevent path traversal)."""
    base_real = os.path.realpath(base_path)
    # Ensure requested path doesn't have leading slashes that might reset join point
    safe_req = requested_path.lstrip("/\\")
    requested_real = os.path.realpath(os.path.join(base_path, safe_req))
    
    if not requested_real.startswith(base_real):
        logger.warning(f"🚨 Path traversal attempt detected: {requested_path}")
        raise HTTPException(status_code=403, detail="Access denied: Path traversal detected")
    
    return requested_real

def generate_github_link(repo_url: str, file_path: str, start_line: int = 0, end_line: int = 0) -> str:
    """Generate a valid GitHub deep link for a file and line range."""
    if not repo_url or "github.com" not in repo_url:
        return ""
    
    # Standardize repo URL
    base_url = repo_url.rstrip("/")
    if base_url.endswith(".git"):
        base_url = base_url[:-4]
        
    clean_path = file_path.lstrip("/\\").replace("\\", "/")
    branch = "main" # Default branch assumption
    
    link = f"{base_url}/blob/{branch}/{clean_path}"
    if start_line > 0:
        link += f"#L{start_line}"
        if end_line > start_line:
            link += f"-L{end_line}"
    return link
