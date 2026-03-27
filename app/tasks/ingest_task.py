"""Celery task for repository ingestion."""

import json
import logging
import os
from datetime import datetime, timezone

from app.tasks import celery_app

logger = logging.getLogger(__name__)


@celery_app.task(
    bind=True,
    name="app.tasks.ingest_task.ingest_repository_task",
    max_retries=3,
    default_retry_delay=60,
    acks_late=True,
)
def ingest_repository_task(
    self,
    repo_id: str,
    url: str,
    local_path: str,
    force_reindex: bool = False,
):
    """Ingest repository and index chunks in Qdrant."""
    import asyncio

    try:
        self.update_state(
            state="PROGRESS",
            meta={"step": "cloning", "progress": 10, "message": "Cloning repository..."},
        )

        loop = asyncio.new_event_loop()
        asyncio.set_event_loop(loop)

        try:
            result = loop.run_until_complete(
                _run_ingestion(
                    repo_id=repo_id,
                    url=url,
                    local_path=local_path,
                    force_reindex=force_reindex,
                    task=self,
                )
            )
            return result
        finally:
            loop.close()

    except Exception as exc:
        logger.error(f"Ingestion task failed for repo {repo_id}: {exc}", exc_info=True)
        self.update_state(
            state="FAILURE",
            meta={"step": "error", "progress": 0, "message": str(exc)},
        )
        raise self.retry(exc=exc)


async def _run_ingestion(
    repo_id: str,
    url: str,
    local_path: str,
    force_reindex: bool,
    task,
):
    """Run the actual ingestion pipeline."""
    from app.services.ingest import load_and_index_repo
    from app.services.rag_engine import create_vector_db
    from app.core.database import AsyncSessionLocal, Repository
    from sqlalchemy import update

    async with AsyncSessionLocal() as session:
        # Update status to cloning
        await session.execute(
            update(Repository)
            .where(Repository.id == repo_id)
            .values(status="cloning")
        )
        await session.commit()

    try:
        task.update_state(
            state="PROGRESS",
            meta={"step": "cloning", "progress": 20, "message": "Cloning repository..."},
        )

        task.update_state(
            state="PROGRESS",
            meta={"step": "chunking", "progress": 50, "message": "Parsing and chunking code..."},
        )

        async with AsyncSessionLocal() as session:
            await session.execute(
                update(Repository)
                .where(Repository.id == repo_id)
                .values(status="indexing")
            )
            await session.commit()

        cache_path = os.path.join(os.path.dirname(local_path), "cache.json")
        stats_path = os.path.join(os.path.dirname(local_path), "stats.json")
        os.makedirs(os.path.dirname(local_path), exist_ok=True)

        texts = load_and_index_repo(url, local_path, cache_path, force_reindex)
        if texts is None:
            async with AsyncSessionLocal() as session:
                await session.execute(
                    update(Repository)
                    .where(Repository.id == repo_id)
                    .values(status="ready", updated_at=datetime.now(timezone.utc))
                )
                await session.commit()
            return {
                "repo_id": repo_id,
                "status": "ready",
                "chunks": 0,
                "collection": repo_id,
                "cached": True,
            }

        if not texts:
            raise ValueError("No code chunks extracted from repository")

        # Create vector DB
        task.update_state(
            state="PROGRESS",
            meta={
                "step": "embedding",
                "progress": 70,
                "message": f"Generating embeddings for {len(texts)} chunks...",
            },
        )

        create_vector_db(texts, repo_id)

        with open(stats_path, "w", encoding="utf-8") as stats_file:
            json.dump({"chunk_count": len(texts)}, stats_file)

        # Mark as ready
        async with AsyncSessionLocal() as session:
            await session.execute(
                update(Repository)
                .where(Repository.id == repo_id)
                .values(
                    status="ready",
                    vector_collection_name=repo_id,
                    updated_at=datetime.now(timezone.utc),
                )
            )
            await session.commit()

        task.update_state(
            state="PROGRESS",
            meta={"step": "complete", "progress": 100, "message": "Ingestion complete!"},
        )

        return {
            "repo_id": repo_id,
            "status": "ready",
            "chunks": len(texts),
            "collection": repo_id,
        }

    except Exception:
        # Mark as failed
        async with AsyncSessionLocal() as session:
            await session.execute(
                update(Repository)
                .where(Repository.id == repo_id)
                .values(status="failed")
            )
            await session.commit()
        raise


@celery_app.task(name="app.tasks.ingest_task.cleanup_stale_repos_task")
def cleanup_stale_repos_task():
    """Periodic task to clean up stale repositories."""
    import asyncio

    loop = asyncio.new_event_loop()
    asyncio.set_event_loop(loop)
    try:
        from app.core.database import recover_stale_repos_async
        loop.run_until_complete(recover_stale_repos_async())
        logger.info("Stale repos cleanup completed.")
        return {"status": "ok"}
    finally:
        loop.close()
