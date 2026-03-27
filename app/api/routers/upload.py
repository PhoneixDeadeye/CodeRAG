"""File upload endpoint for chat context."""

from fastapi import APIRouter, Depends, HTTPException, UploadFile, File
from pydantic import BaseModel
from typing import Optional
from app.core.database import User
from app.services.auth import get_optional_user
import logging

router = APIRouter(prefix="/api/v1", tags=["upload"])
logger = logging.getLogger("CodeRAG")


class FileUploadResponse(BaseModel):
    filename: str
    content: str
    file_type: str


ALLOWED_EXTENSIONS = {
    ".txt",
    ".md",
    ".py",
    ".js",
    ".ts",
    ".tsx",
    ".jsx",
    ".java",
    ".c",
    ".cpp",
    ".h",
    ".hpp",
    ".cs",
    ".go",
    ".rs",
    ".php",
    ".rb",
    ".sh",
    ".yaml",
    ".yml",
    ".json",
    ".html",
    ".css",
    ".sql",
    ".xml",
}

MAX_FILE_SIZE = 2 * 1024 * 1024  # 2MB


@router.post("/chat/upload", response_model=FileUploadResponse)
async def upload_file(
    file: UploadFile = File(...), user: Optional[User] = Depends(get_optional_user)
):
    """Upload a file to include as context in chat."""
    filename = file.filename
    ext = "." + filename.split(".")[-1].lower() if "." in filename else ""

    if ext not in ALLOWED_EXTENSIONS:
        raise HTTPException(
            status_code=400,
            detail=f"File type not supported. Allowed: {', '.join(sorted(ALLOWED_EXTENSIONS))}",
        )

    if file.size and file.size > MAX_FILE_SIZE:
        raise HTTPException(status_code=400, detail="File too large (max 2MB)")

    try:
        content = bytearray()
        chunk_size = 1024 * 1024 # 1MB chunks
        total_size = 0
        
        while chunk := await file.read(chunk_size):
            total_size += len(chunk)
            if total_size > MAX_FILE_SIZE:
                raise HTTPException(status_code=400, detail=f"File too large (max {MAX_FILE_SIZE // 1024 // 1024}MB)")
            content.extend(chunk)

        try:
            text_content = content.decode("utf-8")
        except UnicodeDecodeError:
            try:
                text_content = content.decode("latin-1")
            except UnicodeDecodeError:
                raise HTTPException(
                    status_code=400,
                    detail="Could not decode file content (must be text)",
                )

        return FileUploadResponse(
            filename=filename, content=text_content, file_type=ext
        )

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error processing file upload: {e}")
        raise HTTPException(status_code=500, detail="Failed to process file")
