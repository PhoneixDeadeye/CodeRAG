# ARQ Worker Configuration for Background Job Processing
# This module sets up ARQ (Async Redis Queue alternative using asyncio)
# without Redis dependency - uses in-memory queue for development

import asyncio
import logging
from typing import Any, Dict, Optional, Callable, Awaitable
from dataclasses import dataclass, field
from datetime import datetime, timezone
from enum import Enum
from collections import deque
import threading
import uuid

logger = logging.getLogger("CodeRAG.Worker")


class JobStatus(str, Enum):
    """Job status enum."""
    PENDING = "pending"
    RUNNING = "running"
    COMPLETED = "completed"
    FAILED = "failed"


@dataclass
class Job:
    """Represents a background job."""
    id: str
    func_name: str
    args: tuple = field(default_factory=tuple)
    kwargs: Dict[str, Any] = field(default_factory=dict)
    status: JobStatus = JobStatus.PENDING
    result: Any = None
    error: Optional[str] = None
    created_at: datetime = field(default_factory=lambda: datetime.now(timezone.utc))
    started_at: Optional[datetime] = None
    completed_at: Optional[datetime] = None
    
    def to_dict(self) -> Dict[str, Any]:
        """Convert job to dictionary for API responses."""
        return {
            "id": self.id,
            "func_name": self.func_name,
            "status": self.status.value,
            "error": self.error,
            "created_at": self.created_at.isoformat(),
            "started_at": self.started_at.isoformat() if self.started_at else None,
            "completed_at": self.completed_at.isoformat() if self.completed_at else None,
        }


class BackgroundWorker:
    """
    In-memory background job worker.
    
    This provides async background job processing without external dependencies.
    For production with multiple workers, replace with Celery or ARQ with Redis.
    """
    
    def __init__(self, max_workers: int = 3):
        self._queue: deque[Job] = deque()
        self._jobs: Dict[str, Job] = {}
        self._handlers: Dict[str, Callable[..., Awaitable[Any]]] = {}
        self._running = False
        self._lock = threading.Lock()
        self._max_workers = max_workers
        self._active_workers = 0
        self._worker_tasks: list[asyncio.Task] = []
        
    def register(self, name: str):
        """Decorator to register a job handler."""
        def decorator(func: Callable[..., Awaitable[Any]]):
            self._handlers[name] = func
            logger.info(f"📋 Registered job handler: {name}")
            return func
        return decorator
    
    def enqueue(self, func_name: str, *args, **kwargs) -> Job:
        """Add a job to the queue."""
        if func_name not in self._handlers:
            raise ValueError(f"Unknown job handler: {func_name}")
        
        job = Job(
            id=str(uuid.uuid4()),
            func_name=func_name,
            args=args,
            kwargs=kwargs,
        )
        
        with self._lock:
            self._queue.append(job)
            self._jobs[job.id] = job
        
        logger.info(f"📥 Enqueued job {job.id}: {func_name}")
        return job
    
    def get_job(self, job_id: str) -> Optional[Job]:
        """Get a job by ID."""
        return self._jobs.get(job_id)
    
    def get_job_status(self, job_id: str) -> Optional[Dict[str, Any]]:
        """Get job status as dictionary."""
        job = self.get_job(job_id)
        return job.to_dict() if job else None
    
    async def _process_job(self, job: Job):
        """Process a single job."""
        job.status = JobStatus.RUNNING
        job.started_at = datetime.now(timezone.utc)
        
        try:
            handler = self._handlers[job.func_name]
            job.result = await handler(*job.args, **job.kwargs)
            job.status = JobStatus.COMPLETED
            logger.info(f"✅ Job {job.id} completed: {job.func_name}")
        except Exception as e:
            job.status = JobStatus.FAILED
            job.error = str(e)
            logger.error(f"❌ Job {job.id} failed: {job.func_name} - {e}")
        finally:
            job.completed_at = datetime.now(timezone.utc)
            with self._lock:
                self._active_workers -= 1
    
    async def _worker_loop(self):
        """Main worker loop."""
        while self._running:
            job = None
            
            with self._lock:
                if self._queue and self._active_workers < self._max_workers:
                    job = self._queue.popleft()
                    self._active_workers += 1
            
            if job:
                await self._process_job(job)
            else:
                await asyncio.sleep(0.1)  # Small delay when idle
    
    async def start(self):
        """Start the background worker."""
        if self._running:
            return
            
        self._running = True
        logger.info(f"🚀 Background worker starting with {self._max_workers} workers")
        
        # Create worker tasks
        for i in range(self._max_workers):
            task = asyncio.create_task(self._worker_loop())
            self._worker_tasks.append(task)
    
    async def stop(self):
        """Stop the background worker."""
        self._running = False
        
        # Wait for all workers to finish
        if self._worker_tasks:
            await asyncio.gather(*self._worker_tasks, return_exceptions=True)
            self._worker_tasks.clear()
        
        logger.info("🛑 Background worker stopped")
    
    def cleanup_old_jobs(self, max_age_hours: int = 24):
        """Remove completed/failed jobs older than max_age_hours."""
        now = datetime.now(timezone.utc)
        with self._lock:
            to_remove = []
            for job_id, job in self._jobs.items():
                if job.status in (JobStatus.COMPLETED, JobStatus.FAILED):
                    if job.completed_at:
                        age = (now - job.completed_at).total_seconds() / 3600
                        if age > max_age_hours:
                            to_remove.append(job_id)
            
            for job_id in to_remove:
                del self._jobs[job_id]
            
            if to_remove:
                logger.info(f"🧹 Cleaned up {len(to_remove)} old jobs")


# Global worker instance
worker = BackgroundWorker(max_workers=3)


# ============================================
# Job Handlers - Register your jobs here
# ============================================

@worker.register("ingest_repository")
async def ingest_repository_job(
    user_id: str,
    repo_id: str,
    url: str,
    force_reindex: bool = False
):
    """
    Background job for repository ingestion.
    
    This runs the full ingestion pipeline asynchronously:
    1. Clone repository
    2. Process and chunk files
    3. Create vector embeddings
    4. Store in FAISS index
    """
    import asyncio
    from database import SessionLocal, Repository
    from datetime import datetime, timezone
    
    logger.info(f"🔄 Starting ingestion job for repo {repo_id}")
    
    db = SessionLocal()
    try:
        repo = db.query(Repository).filter(Repository.id == repo_id).first()
        if not repo:
            raise ValueError(f"Repository {repo_id} not found")
        
        # Update status to cloning
        repo.status = "cloning"
        db.commit()
        
        # Determine paths based on user type
        if user_id.startswith("guest_"):
            base_dir = f"data/guests/{user_id}/repos/{repo_id}"
        else:
            base_dir = f"data/users/{user_id}/repos/{repo_id}"
        
        repo_path = f"{base_dir}/source"
        vector_path = f"{base_dir}/vectorstore"
        cache_path = f"{base_dir}/cache.json"
        
        # Import and run ingestion in thread pool (blocking I/O)
        import ingest
        import rag_engine
        
        # Update status to indexing
        repo.status = "indexing"
        repo.local_path = repo_path
        repo.vector_db_path = vector_path
        db.commit()
        
        # Run blocking ingestion in executor
        loop = asyncio.get_event_loop()
        chunks = await loop.run_in_executor(
            None,
            lambda: ingest.load_and_index_repo(url, repo_path, cache_path, force_reindex)
        )
        
        if chunks is None:
            logger.info(f"📦 Repository {repo_id} already indexed, skipping")
            repo.status = "ready"
            db.commit()
            return {"status": "skipped", "message": "Already indexed"}
        
        # Create vector database
        await loop.run_in_executor(
            None,
            lambda: rag_engine.create_vector_db(chunks, vector_path)
        )
        
        # Update repo status
        repo.status = "ready"
        repo.updated_at = datetime.now(timezone.utc)
        db.commit()
        
        logger.info(f"✅ Ingestion complete for repo {repo_id}: {len(chunks)} chunks")
        return {"status": "success", "chunks": len(chunks)}
        
    except Exception as e:
        logger.error(f"❌ Ingestion failed for repo {repo_id}: {e}")
        try:
            if repo:
                repo.status = "failed"
                db.commit()
        except Exception:
            pass
        raise
    finally:
        db.close()


@worker.register("reindex_repository")
async def reindex_repository_job(repo_id: str, user_id: str):
    """Re-index an existing repository."""
    from database import SessionLocal, Repository
    
    db = SessionLocal()
    try:
        repo = db.query(Repository).filter(Repository.id == repo_id).first()
        if not repo:
            raise ValueError(f"Repository {repo_id} not found")
        
        url = repo.url
        return await ingest_repository_job(user_id, repo_id, url, force_reindex=True)
    finally:
        db.close()


# ============================================
# Utility Functions
# ============================================

def get_worker() -> BackgroundWorker:
    """Get the global worker instance."""
    return worker


async def startup_worker():
    """Start background worker on application startup."""
    await worker.start()


async def shutdown_worker():
    """Stop background worker on application shutdown."""
    await worker.stop()
