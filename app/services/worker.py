import os
import json
import logging
from datetime import datetime, timezone
import asyncio
from celery import Celery

from app.core.database import AsyncSessionLocal, Repository
from sqlalchemy import select
import app.services.ingest as ingest
import app.services.rag_engine as rag_engine

logger = logging.getLogger("CodeRAG.Celery")

redis_url = os.getenv("REDIS_URL", "redis://localhost:6379/0")

celery_app = Celery(
    "coderag_worker",
    broker=redis_url,
    backend=redis_url
)

celery_app.conf.update(
    task_serializer="json",
    accept_content=["json"],
    result_serializer="json",
    timezone="UTC",
    enable_utc=True,
)

def run_async(coro):
    loop = asyncio.new_event_loop()
    try:
        return loop.run_until_complete(coro)
    finally:
        loop.close()

async def _update_status(repo_id: str, status: str):
    async with AsyncSessionLocal() as db:
        try:
            result = await db.execute(select(Repository).where(Repository.id == repo_id))
            repo = result.scalar_one_or_none()
            if repo:
                repo.status = status
                repo.updated_at = datetime.now(timezone.utc)
                await db.commit()
        except Exception as e:
            logger.error(f"Failed to update repo {repo_id} status to {status}: {e}")
            await db.rollback()

@celery_app.task(bind=True)
def ingest_repo_task(self, repo_id: str, url: str, local_path: str, force_reindex: bool):
    """
    Celery task to ingest a repository asynchronously.
    """
    logger.info(f"[CELERY INGEST] Starting ingestion for repo {repo_id} from {url}")
    
    try:
        run_async(_update_status(repo_id, "cloning"))
        
        cache_path = os.path.join(os.path.dirname(local_path), "cache.json")
        stats_path = os.path.join(os.path.dirname(local_path), "stats.json")
        os.makedirs(os.path.dirname(local_path), exist_ok=True)

        run_async(_update_status(repo_id, "indexing"))
        
        chunks = ingest.load_and_index_repo(url, local_path, cache_path, force_reindex)

        if chunks is None:
            logger.info(f"[CELERY INGEST] Repo {repo_id} already up to date")
            run_async(_update_status(repo_id, "ready"))
            return True

        if not chunks:
            raise ValueError("No code chunks extracted from repository")

        # Create vector database
        rag_engine.create_vector_db(chunks, repo_id)

        # Save stats
        os.makedirs(os.path.dirname(stats_path), exist_ok=True)
        with open(stats_path, "w") as f:
            json.dump({"chunk_count": len(chunks)}, f)

        run_async(_update_status(repo_id, "ready"))
        logger.info(f"[CELERY INGEST] Completed for repo {repo_id}")
        return True

    except Exception as e:
        logger.error(f"[CELERY INGEST] Failed for repo {repo_id}: {e}", exc_info=True)
        run_async(_update_status(repo_id, "failed"))
        return False
