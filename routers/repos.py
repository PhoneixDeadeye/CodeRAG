from fastapi import APIRouter, Depends, HTTPException, BackgroundTasks
from sqlalchemy.orm import Session
from database import get_db, User, Repository
from auth import get_optional_user, get_current_user, get_guest_session_id
from pydantic import BaseModel, HttpUrl, field_validator
from typing import Optional, List, Dict
from datetime import datetime
import uuid
import os
import shutil
import logging
import re
from config import settings

import ingest
import rag_engine
from rate_limiter import check_ingest_limit
import json

router = APIRouter(prefix="/api/v1", tags=["repos"])
logger = logging.getLogger("CodeRAG")

# -- Models --
class IngestRequest(BaseModel):
    repo_url: HttpUrl
    repo_name: Optional[str] = None
    force_reindex: bool = False
    
    @field_validator('repo_url')
    @classmethod
    def validate_github_url(cls, v):
        """Ensure only GitHub URLs are accepted to prevent SSRF attacks."""
        url_str = str(v)
        if not url_str.startswith(('https://github.com/', 'http://github.com/')):
            raise ValueError('Only GitHub repository URLs are supported for security reasons')
        return v

# -- Helpers --
def get_user_repo_path(user_id: str, repo_id: str) -> str:
    return os.path.join(settings.DATA_DIR, "users", user_id, "repos", repo_id, "source")

def get_user_vector_path(user_id: str, repo_id: str) -> str:
    return os.path.join(settings.DATA_DIR, "users", user_id, "repos", repo_id, "vectors")

def get_guest_repo_path(guest_id: str, repo_id: str) -> str:
    """Guest repos are stored in a separate directory."""
    return os.path.join(settings.DATA_DIR, "guests", guest_id, "repos", repo_id, "source")

def get_guest_vector_path(guest_id: str, repo_id: str) -> str:
    return os.path.join(settings.DATA_DIR, "guests", guest_id, "repos", repo_id, "vectors")

def process_ingestion(user_id: str, repo_id: str, url: str, force_reindex: bool) -> None:
    """Background task for repository ingestion - creates its own DB session."""
    from database import SessionLocal
    local_db = SessionLocal()
    
    try:
        repo = local_db.query(Repository).filter(Repository.id == repo_id).first()
        if not repo:
            logger.error(f"Repository {repo_id} not found in database")
            return
        
        # Paths
        repo_path = repo.local_path
        vector_path = repo.vector_db_path
        cache_path = os.path.join(os.path.dirname(vector_path), "cache.json")
        
        # Update status
        repo.status = "indexing"
        local_db.commit()
        
        # Ingest
        chunks = ingest.load_and_index_repo(url, repo_path, cache_path, force_reindex)
        
        if chunks is None:
             repo.status = "ready"
             local_db.commit()
             logger.info(f"Repository {repo.name} already up-to-date")
             return

        if not chunks:
             repo.status = "failed"
             local_db.commit()
             logger.error(f"Failed to extract chunks from {repo.name}")
             return

        # Commit docs
        commit_docs = ingest.get_recent_commits(repo_path, num_commits=20)
        chunks.extend(commit_docs)
        
        # Vector DB
        rag_engine.create_vector_db(chunks, vector_path)
        
        # Save Stats
        stats_path = os.path.join(os.path.dirname(vector_path), "stats.json")
        with open(stats_path, "w") as f:
            json.dump({"chunk_count": len(chunks)}, f)
        
        repo.status = "ready"
        local_db.commit()
        logger.info(f"Successfully ingested repository {repo.name} with {len(chunks)} chunks")
        
    except Exception as e:
        logger.error(f"Ingest Error for repo {repo_id}: {e}", exc_info=True)
        repo = local_db.query(Repository).filter(Repository.id == repo_id).first()
        if repo:
            repo.status = "failed"
            local_db.commit()
    finally:
        local_db.close()

# -- Endpoints --
@router.get("/config")
async def get_config(
    db: Session = Depends(get_db), 
    user: Optional[User] = Depends(get_optional_user)
):
    """
    Returns SaaS configuration and active repo.
    Works for both authenticated users and guests.
    """
    if user:
        # Authenticated: Find user's active repo
        active_repo = db.query(Repository).filter(
            Repository.user_id == user.id
        ).order_by(Repository.updated_at.desc()).first()
    else:
        # Guest: No active repo (they need to log in first)
        active_repo = None
    
    return {
        "current_repo": active_repo.id if active_repo else None,
        "is_guest": user is None,
        "use_local_llm": False
    }

def _get_repo_chunk_count(repo: Repository) -> int:
    """Helper to get chunk count from stats file."""
    try:
        if not repo.vector_db_path:
            return 0
        stats_path = os.path.join(os.path.dirname(repo.vector_db_path), "stats.json")
        if os.path.exists(stats_path):
            with open(stats_path, 'r') as f:
                return json.load(f).get("chunk_count", 0)
    except Exception:
        return 0
    return 0

@router.get("/repos")
async def list_repos(
    db: Session = Depends(get_db), 
    user: Optional[User] = Depends(get_optional_user),
    guest_id: Optional[str] = Depends(get_guest_session_id)
):
    """
    List repositories.
    - Authenticated: User's own repos
    - Guest: Repos associated with guest session ID (ephemeral)
    """
    if user:
        repos = db.query(Repository).filter(Repository.user_id == user.id).all()
        active_repo = db.query(Repository).filter(
            Repository.user_id == user.id
        ).order_by(Repository.updated_at.desc()).first()
    else:
        # Guests see repos by their guest session ID
        if guest_id:
            repos = db.query(Repository).filter(Repository.user_id == guest_id).all()
            active_repo = db.query(Repository).filter(
                Repository.user_id == guest_id
            ).order_by(Repository.updated_at.desc()).first()
        else:
            repos = []
            active_repo = None
    
    return {
        "repos": [
            {
                "id": r.id,
                "name": r.name,
                "url": r.url,
                "status": r.status,
                "created_at": r.created_at,
                "updated_at": r.updated_at,
                "chunk_count": _get_repo_chunk_count(r)
            }
            for r in repos
        ],
        "active": {
            "id": active_repo.id,
            "name": active_repo.name,
            "url": active_repo.url,
            "status": active_repo.status,
            "created_at": active_repo.created_at,
            "updated_at": active_repo.updated_at,
            "chunk_count": _get_repo_chunk_count(active_repo)
        } if active_repo else None,
        "is_guest": user is None
    }

@router.post("/ingest")
async def ingest_repo(
    request: IngestRequest, 
    background_tasks: BackgroundTasks,
    db: Session = Depends(get_db), 
    user: Optional[User] = Depends(get_optional_user),
    guest_id: Optional[str] = Depends(get_guest_session_id)
):
    """
    Start ingestion process for a new repository or re-index an existing one.
    Works for both authenticated users and guests.
    - Authenticated users: repos are persisted to their account
    - Guests: repos are stored with guest session ID (ephemeral)
    """
    # Determine owner ID (user ID or guest session ID)
    owner_id = user.id if user else guest_id
    if not owner_id:
        owner_id = f"guest_{uuid.uuid4().hex[:12]}"
    
    # Rate Limit (use owner_id for rate limiting)
    check_ingest_limit(owner_id)
    
    # Check if repo exists for this owner
    if user:
        existing_repo = db.query(Repository).filter(
            Repository.user_id == user.id, 
            Repository.url == str(request.repo_url)
        ).first()
    else:
        # For guests, check by guest_id stored in a field or just proceed
        existing_repo = None  # Guests always get fresh ingestion
    
    if existing_repo and not request.force_reindex:
        return {"status": "success", "message": "Repo already exists", "repo_id": existing_repo.id}

    repo_id = str(uuid.uuid4())
    # Sanitize repo name
    raw_name = request.repo_name or str(request.repo_url).split("/")[-1]
    repo_name = re.sub(r'[^a-zA-Z0-9_\-\.]', '_', raw_name)
    
    # Define paths based on user type
    if user:
        local_path = get_user_repo_path(user.id, repo_id)
        vector_db_path = get_user_vector_path(user.id, repo_id)
        repo_user_id = user.id
    else:
        local_path = get_guest_repo_path(owner_id, repo_id)
        vector_db_path = get_guest_vector_path(owner_id, repo_id)
        repo_user_id = owner_id  # Store guest ID as user_id for tracking
    
    new_repo = Repository(
        id=repo_id,
        user_id=repo_user_id,
        name=repo_name,
        url=str(request.repo_url),
        local_path=local_path,
        vector_db_path=vector_db_path,
        status="cloning"
    )
    db.add(new_repo)
    db.commit()

    # Create Background Task
    background_tasks.add_task(process_ingestion, repo_user_id, repo_id, str(request.repo_url), request.force_reindex)
    
    return {"status": "success", "message": "Ingestion started", "repo_id": repo_id, "is_guest": user is None}

@router.delete("/repos/{repo_id}")
async def delete_repo(repo_id: str, db: Session = Depends(get_db), user: User = Depends(get_current_user)):
    """Delete a repository and all associated data."""
    repo = db.query(Repository).filter(Repository.user_id == user.id, Repository.id == repo_id).first()
    if not repo:
        raise HTTPException(status_code=404, detail="Repo not found")
    
    # Delete files
    if repo.local_path and os.path.exists(os.path.dirname(repo.local_path)):
         repo_dir = os.path.dirname(repo.local_path) 
         shutil.rmtree(repo_dir, ignore_errors=True)
    
    db.delete(repo)
    db.commit()
    return {"status": "success"}
