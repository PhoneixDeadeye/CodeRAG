# Jobs Router - Background Job Management API
# Provides endpoints for monitoring and managing background jobs

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from database import get_db, User
from auth import get_current_user, get_optional_user
from typing import Optional, List
from pydantic import BaseModel
import logging

router = APIRouter(prefix="/api/v1/jobs", tags=["jobs"])
logger = logging.getLogger("CodeRAG.Jobs")


class JobStatusResponse(BaseModel):
    """Job status response model."""
    id: str
    func_name: str
    status: str
    error: Optional[str] = None
    created_at: str
    started_at: Optional[str] = None
    completed_at: Optional[str] = None


class JobListResponse(BaseModel):
    """List of jobs response."""
    jobs: List[JobStatusResponse]
    total: int
    pending: int
    running: int
    completed: int
    failed: int


@router.get("/{job_id}", response_model=JobStatusResponse)
async def get_job_status(
    job_id: str,
    user: Optional[User] = Depends(get_optional_user)
):
    """
    Get the status of a background job.
    
    Returns the current status, timing information, and any errors.
    """
    from worker import get_worker
    
    worker = get_worker()
    job_info = worker.get_job_status(job_id)
    
    if not job_info:
        raise HTTPException(status_code=404, detail="Job not found")
    
    return JobStatusResponse(**job_info)


@router.get("/", response_model=JobListResponse)
async def list_jobs(
    status: Optional[str] = None,
    limit: int = 50,
    user: User = Depends(get_current_user)
):
    """
    List background jobs.
    
    Optionally filter by status (pending, running, completed, failed).
    """
    from worker import get_worker, JobStatus
    
    worker = get_worker()
    
    # Get all jobs (in a real app, you'd filter by user)
    all_jobs = list(worker._jobs.values())
    
    # Filter by status if specified
    if status:
        try:
            filter_status = JobStatus(status)
            all_jobs = [j for j in all_jobs if j.status == filter_status]
        except ValueError:
            raise HTTPException(status_code=400, detail=f"Invalid status: {status}")
    
    # Sort by created_at descending
    all_jobs.sort(key=lambda j: j.created_at, reverse=True)
    
    # Count by status
    status_counts = {
        "pending": sum(1 for j in worker._jobs.values() if j.status == JobStatus.PENDING),
        "running": sum(1 for j in worker._jobs.values() if j.status == JobStatus.RUNNING),
        "completed": sum(1 for j in worker._jobs.values() if j.status == JobStatus.COMPLETED),
        "failed": sum(1 for j in worker._jobs.values() if j.status == JobStatus.FAILED),
    }
    
    return JobListResponse(
        jobs=[JobStatusResponse(**j.to_dict()) for j in all_jobs[:limit]],
        total=len(all_jobs),
        **status_counts
    )


@router.post("/{job_id}/retry")
async def retry_job(
    job_id: str,
    user: User = Depends(get_current_user)
):
    """
    Retry a failed job.
    
    Creates a new job with the same parameters.
    """
    from worker import get_worker, JobStatus
    
    worker = get_worker()
    job = worker.get_job(job_id)
    
    if not job:
        raise HTTPException(status_code=404, detail="Job not found")
    
    if job.status != JobStatus.FAILED:
        raise HTTPException(
            status_code=400, 
            detail=f"Can only retry failed jobs. Current status: {job.status.value}"
        )
    
    # Create a new job with same parameters
    new_job = worker.enqueue(job.func_name, *job.args, **job.kwargs)
    
    logger.info(f"🔄 Retrying job {job_id} as {new_job.id}")
    
    return {
        "message": "Job retry scheduled",
        "original_job_id": job_id,
        "new_job_id": new_job.id
    }
