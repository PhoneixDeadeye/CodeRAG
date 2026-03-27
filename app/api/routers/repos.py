from fastapi import APIRouter, Depends, HTTPException, UploadFile, File
from sqlalchemy.ext.asyncio import AsyncSession
from app.core.database import Repository, User, get_db
from app.tasks.ingest_task import ingest_repository_task
from app.services.auth import get_optional_user, get_current_user, get_guest_session_id
from pydantic import BaseModel, HttpUrl, field_validator
from typing import Optional
import uuid
import os
import shutil
import logging
import re
import json
import zipfile
import tempfile
from app.core.config import settings
from app.core.security import validate_repo_url

import app.services.rag_engine as rag_engine
from app.api.rate_limiter import check_ingest_limit

router = APIRouter(prefix="/api/v1", tags=["repos"])
logger = logging.getLogger("CodeRAG")

logger = logging.getLogger("CodeRAG")

def _start_background_ingestion(
    repo_id: str, url: str, local_path: str, force_reindex: bool
):
    """Fire-and-forget ingestion using Celery task queue."""
    ingest_repository_task.delay(
        repo_id=repo_id,
        url=url,
        local_path=local_path,
        force_reindex=force_reindex,
    )


# -- Models --
class IngestRequest(BaseModel):
    repo_url: HttpUrl
    repo_name: Optional[str] = None
    force_reindex: bool = False

    @field_validator("repo_url")
    @classmethod
    def validate_github_url(cls, v):
        """Ensure only safe allowlisted repository URLs are accepted."""
        url_str = str(v)
        validate_repo_url(url_str)
        return v


# -- Helpers --
def get_user_repo_path(user_id: str, repo_id: str) -> str:
    return os.path.join(settings.DATA_DIR, "users", user_id, "repos", repo_id, "source")


def get_user_vector_path(user_id: str, repo_id: str) -> str:
    return os.path.join(
        settings.DATA_DIR, "users", user_id, "repos", repo_id, "vectors"
    )


def get_guest_repo_path(guest_id: str, repo_id: str) -> str:
    """Guest repos are stored in a separate directory."""
    return os.path.join(
        settings.DATA_DIR, "guests", guest_id, "repos", repo_id, "source"
    )


def get_guest_vector_path(guest_id: str, repo_id: str) -> str:
    return os.path.join(
        settings.DATA_DIR, "guests", guest_id, "repos", repo_id, "vectors"
    )


# -- Endpoints --
@router.get("/config")
async def get_config(
    db: AsyncSession = Depends(get_db),
    user: Optional[User] = Depends(get_optional_user),
):
    """Returns SaaS configuration and active repo."""
    from sqlalchemy import select, desc

    if user:
        result = await db.execute(
            select(Repository)
            .where(Repository.user_id == user.id)
            .order_by(desc(Repository.updated_at))
        )
        active_repo = result.scalars().first()
    else:
        active_repo = None

    return {
        "current_repo": active_repo.id if active_repo else None,
        "is_guest": user is None,
        "use_local_llm": False,
    }


def _get_repo_chunk_count(repo: Repository) -> int:
    """Helper to get chunk count from stats file."""
    try:
        if not repo.local_path:
            return 0
        stats_path = os.path.join(os.path.dirname(repo.local_path), "stats.json")
        if os.path.exists(stats_path):
            with open(stats_path, "r") as f:
                return json.load(f).get("chunk_count", 0)
    except Exception:
        return 0
    return 0


@router.get("/repos")
async def list_repos(
    db: AsyncSession = Depends(get_db),
    user: Optional[User] = Depends(get_optional_user),
    guest_id: Optional[str] = Depends(get_guest_session_id),
):
    """List repositories."""
    from sqlalchemy import select, desc

    repos = []
    active_repo = None

    if user:
        result = await db.execute(
            select(Repository).where(Repository.user_id == user.id)
        )
        repos = result.scalars().all()

        result_active = await db.execute(
            select(Repository)
            .where(Repository.user_id == user.id)
            .order_by(desc(Repository.updated_at))
        )
        active_repo = result_active.scalars().first()
    else:
        if guest_id:
            result = await db.execute(
                select(Repository).where(Repository.user_id == guest_id)
            )
            repos = result.scalars().all()

            result_active = await db.execute(
                select(Repository)
                .where(Repository.user_id == guest_id)
                .order_by(desc(Repository.updated_at))
            )
            active_repo = result_active.scalars().first()

    return {
        "repos": [
            {
                "id": r.id,
                "name": r.name,
                "url": r.url,
                "status": r.status,
                "created_at": r.created_at,
                "updated_at": r.updated_at,
                "chunk_count": _get_repo_chunk_count(r),
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
            "chunk_count": _get_repo_chunk_count(active_repo),
        }
        if active_repo
        else None,
        "is_guest": user is None,
    }


@router.post("/ingest")
async def ingest_repo(
    request: IngestRequest,
    db: AsyncSession = Depends(get_db),
    user: Optional[User] = Depends(get_optional_user),
    guest_id: Optional[str] = Depends(get_guest_session_id),
):
    """Start ingestion process for a new repository or re-index an existing one."""
    from sqlalchemy import select

    owner_id = user.id if user else guest_id
    if not owner_id:
        owner_id = f"guest_{uuid.uuid4().hex[:12]}"

    tenant_id = user.organization_id if user else owner_id
    check_ingest_limit(tenant_id)

    existing_repo = None
    if user:
        result = await db.execute(
            select(Repository).where(
                Repository.user_id == user.id, Repository.url == str(request.repo_url)
            )
        )
        existing_repo = result.scalars().first()

    if existing_repo and not request.force_reindex:
        return {
            "status": "success",
            "message": "Repo already exists",
            "repo_id": existing_repo.id,
        }

    repo_id = str(uuid.uuid4())
    raw_name = request.repo_name or str(request.repo_url).split("/")[-1]
    repo_name = re.sub(r"[^a-zA-Z0-9_\-\.]", "_", raw_name)

    if user:
        local_path = get_user_repo_path(user.id, repo_id)
        repo_user_id = user.id
    else:
        local_path = get_guest_repo_path(owner_id, repo_id)
        repo_user_id = owner_id

    vector_collection_name = repo_id

    new_repo = Repository(
        id=repo_id,
        user_id=repo_user_id,
        name=repo_name,
        url=str(request.repo_url),
        local_path=local_path,
        vector_collection_name=vector_collection_name,
        status="cloning",
    )
    db.add(new_repo)
    await db.commit()

    # Fire-and-forget background ingestion (no Celery/Redis required)
    _start_background_ingestion(
        repo_id, str(request.repo_url), local_path, request.force_reindex
    )

    return {
        "status": "success",
        "message": "Ingestion started",
        "repo_id": repo_id,
        "is_guest": user is None,
    }


@router.delete("/repos/{repo_id}")
async def delete_repo(
    repo_id: str,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    """Delete a repository and all associated data."""
    from sqlalchemy import select

    result = await db.execute(
        select(Repository).where(
            Repository.user_id == user.id, Repository.id == repo_id
        )
    )
    repo = result.scalars().first()

    if not repo:
        raise HTTPException(status_code=404, detail="Repo not found")

    # Delete local files
    if repo.local_path and os.path.exists(os.path.dirname(repo.local_path)):
        repo_dir = os.path.dirname(repo.local_path)
        shutil.rmtree(repo_dir, ignore_errors=True)

    # Delete Qdrant collection
    if repo.vector_collection_name:
        try:
            client = rag_engine.get_qdrant_client()
            client.delete_collection(repo.vector_collection_name)
            logger.info(f"Deleted Qdrant collection: {repo.vector_collection_name}")
        except Exception as e:
            logger.warning(
                f"Could not delete Qdrant collection {repo.vector_collection_name}: {e}"
            )

    # Clear QA chain cache for this collection
    rag_engine.clear_qa_chain_cache(repo.vector_collection_name)

    await db.delete(repo)
    await db.commit()
    return {"status": "success"}


MAX_ZIP_SIZE = 100 * 1024 * 1024  # 100 MB limit


@router.post("/repos/upload")
async def upload_repo_zip(
    file: UploadFile = File(...),
    repo_name: Optional[str] = None,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    """Upload a ZIP file containing a repository."""
    if not file.filename or not file.filename.endswith(".zip"):
        raise HTTPException(status_code=400, detail="Only ZIP files are accepted")

    repo_id = str(uuid.uuid4())
    raw_name = repo_name or file.filename.replace(".zip", "")
    safe_name = re.sub(r"[^a-zA-Z0-9_\-\.]", "_", raw_name)

    local_path = get_user_repo_path(user.id, repo_id)
    vector_collection_name = repo_id

    new_repo = Repository(
        id=repo_id,
        user_id=user.id,
        name=safe_name,
        url=f"upload://{safe_name}",
        local_path=local_path,
        vector_collection_name=vector_collection_name,
        status="extracting",
    )
    db.add(new_repo)
    await db.commit()

    try:
        os.makedirs(local_path, exist_ok=True)

        with tempfile.NamedTemporaryFile(delete=False, suffix=".zip") as tmp:
            tmp_path = tmp.name
            while content := await file.read(1024 * 1024):
                tmp.write(content)

        with zipfile.ZipFile(tmp_path, "r") as zip_ref:
            for member in zip_ref.namelist():
                if member.startswith("/") or ".." in member:
                    raise HTTPException(status_code=400, detail="Invalid ZIP paths")
            zip_ref.extractall(local_path)

        os.unlink(tmp_path)

        new_repo.status = "indexing"
        await db.commit()

        # Fire-and-forget background ingestion (upload:// URL handled by ingest.py)
        _start_background_ingestion(repo_id, new_repo.url, local_path, True)

        return {
            "status": "success",
            "message": "ZIP uploaded and indexing started",
            "repo_id": repo_id,
            "repo_name": safe_name,
        }

    except HTTPException:
        raise
    except Exception as e:
        new_repo.status = "failed"
        await db.commit()
        logger.error(f"ZIP upload error: {e}")
        raise HTTPException(status_code=500, detail="Failed to process ZIP file. Please try again.")
