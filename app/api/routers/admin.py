"""Admin API Router — Analytics, User Management, System Overview.

Requires admin or owner role for all endpoints.
"""

import logging
from datetime import datetime, timezone, timedelta
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel, Field
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import (
    get_db,
    User,
    Repository,
    ChatSession,
    ChatMessage,
    UsageLog,
    Feedback,
)
from app.services.rbac import require_role

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/api/v1/admin", tags=["Admin"])


# ──────────────────────────────────────────────────────────────
# Response Models
# ──────────────────────────────────────────────────────────────


class AnalyticsOverview(BaseModel):
    total_users: int = 0
    total_repos: int = 0
    total_sessions: int = 0
    total_messages: int = 0
    active_repos: int = 0
    queries_today: int = 0
    queries_this_week: int = 0
    average_rating: float = 0.0


class UsageDataPoint(BaseModel):
    date: str
    queries: int = 0
    ingestions: int = 0
    messages: int = 0


class UserInfo(BaseModel):
    id: str
    email: str
    role: str
    is_active: bool
    github_id: Optional[str] = None
    avatar_url: Optional[str] = None
    preferred_llm_provider: str = "gemini"
    created_at: Optional[str] = None
    repo_count: int = 0
    session_count: int = 0


class UserListResponse(BaseModel):
    users: list[UserInfo]
    total: int
    page: int
    limit: int


class RoleUpdateRequest(BaseModel):
    role: str = Field(..., pattern="^(owner|admin|member|viewer)$")


# ──────────────────────────────────────────────────────────────
# Analytics Endpoints
# ──────────────────────────────────────────────────────────────


@router.get("/analytics/overview", response_model=AnalyticsOverview)
async def get_analytics_overview(
    admin_user: User = Depends(require_role("admin", "owner")),
    db: AsyncSession = Depends(get_db),
):
    """Get high-level analytics for the admin dashboard."""
    now = datetime.now(timezone.utc)
    today_start = now.replace(hour=0, minute=0, second=0, microsecond=0)
    week_start = today_start - timedelta(days=7)

    total_users = await db.scalar(select(func.count(User.id))) or 0
    total_repos = await db.scalar(select(func.count(Repository.id))) or 0
    active_repos = await db.scalar(
        select(func.count(Repository.id)).where(Repository.status == "ready")
    ) or 0
    total_sessions = await db.scalar(select(func.count(ChatSession.id))) or 0
    total_messages = await db.scalar(select(func.count(ChatMessage.id))) or 0

    queries_today = await db.scalar(
        select(func.count(UsageLog.id)).where(
            UsageLog.event_type == "chat",
            UsageLog.created_at >= today_start,
        )
    ) or 0

    queries_this_week = await db.scalar(
        select(func.count(UsageLog.id)).where(
            UsageLog.event_type == "chat",
            UsageLog.created_at >= week_start,
        )
    ) or 0

    avg_rating = await db.scalar(
        select(func.avg(Feedback.rating)).where(Feedback.rating.isnot(None))
    ) or 0.0

    return AnalyticsOverview(
        total_users=total_users,
        total_repos=total_repos,
        total_sessions=total_sessions,
        total_messages=total_messages,
        active_repos=active_repos,
        queries_today=queries_today,
        queries_this_week=queries_this_week,
        average_rating=round(float(avg_rating), 2),
    )


@router.get("/analytics/usage", response_model=list[UsageDataPoint])
async def get_usage_data(
    period: str = Query("7d", pattern="^(7d|30d|90d)$"),
    admin_user: User = Depends(require_role("admin", "owner")),
    db: AsyncSession = Depends(get_db),
):
    """Get time-series usage data for charts."""
    days = {"7d": 7, "30d": 30, "90d": 90}[period]
    now = datetime.now(timezone.utc)
    start_date = now - timedelta(days=days)

    data_points = []
    for i in range(days):
        day = start_date + timedelta(days=i)
        day_start = day.replace(hour=0, minute=0, second=0, microsecond=0)
        day_end = day_start + timedelta(days=1)

        queries = await db.scalar(
            select(func.count(UsageLog.id)).where(
                UsageLog.event_type == "chat",
                UsageLog.created_at >= day_start,
                UsageLog.created_at < day_end,
            )
        ) or 0

        ingestions = await db.scalar(
            select(func.count(UsageLog.id)).where(
                UsageLog.event_type == "ingest",
                UsageLog.created_at >= day_start,
                UsageLog.created_at < day_end,
            )
        ) or 0

        messages = await db.scalar(
            select(func.count(ChatMessage.id)).where(
                ChatMessage.created_at >= day_start,
                ChatMessage.created_at < day_end,
            )
        ) or 0

        data_points.append(
            UsageDataPoint(
                date=day_start.strftime("%Y-%m-%d"),
                queries=queries,
                ingestions=ingestions,
                messages=messages,
            )
        )

    return data_points


# ──────────────────────────────────────────────────────────────
# User Management Endpoints
# ──────────────────────────────────────────────────────────────


@router.get("/users", response_model=UserListResponse)
async def list_users(
    page: int = Query(1, ge=1),
    limit: int = Query(20, ge=1, le=100),
    search: Optional[str] = Query(None),
    role: Optional[str] = Query(None),
    admin_user: User = Depends(require_role("admin", "owner")),
    db: AsyncSession = Depends(get_db),
):
    """List all users with pagination and filters."""
    stmt = select(User)

    if search:
        stmt = stmt.where(User.email.ilike(f"%{search}%"))
    if role:
        stmt = stmt.where(User.role == role)

    # Count total
    count_stmt = select(func.count()).select_from(stmt.subquery())
    total = await db.scalar(count_stmt) or 0

    # Paginate
    offset = (page - 1) * limit
    stmt = stmt.offset(offset).limit(limit).order_by(User.created_at.desc())
    result = await db.execute(stmt)
    users = result.scalars().all()

    # Build response with counts
    user_infos = []
    for user in users:
        repo_count = await db.scalar(
            select(func.count(Repository.id)).where(Repository.user_id == user.id)
        ) or 0
        session_count = await db.scalar(
            select(func.count(ChatSession.id)).where(ChatSession.user_id == user.id)
        ) or 0

        user_infos.append(
            UserInfo(
                id=user.id,
                email=user.email,
                role=user.role or "member",
                is_active=user.is_active,
                github_id=user.github_id,
                avatar_url=user.avatar_url,
                preferred_llm_provider=user.preferred_llm_provider or "gemini",
                created_at=user.created_at.isoformat() if user.created_at else None,
                repo_count=repo_count,
                session_count=session_count,
            )
        )

    return UserListResponse(
        users=user_infos,
        total=total,
        page=page,
        limit=limit,
    )


@router.patch("/users/{user_id}/role")
async def update_user_role(
    user_id: str,
    body: RoleUpdateRequest,
    admin_user: User = Depends(require_role("admin", "owner")),
    db: AsyncSession = Depends(get_db),
):
    """Update a user's organization role."""
    result = await db.execute(select(User).where(User.id == user_id))
    user = result.scalar_one_or_none()

    if not user:
        raise HTTPException(status_code=404, detail="User not found")

    if user.id == admin_user.id:
        raise HTTPException(status_code=400, detail="Cannot change your own role")

    # Owner cannot be demoted by non-owner
    if user.role == "owner" and admin_user.role != "owner":
        raise HTTPException(status_code=403, detail="Only owners can change owner roles")

    user.role = body.role
    await db.commit()

    logger.info(f"User {user_id} role updated to {body.role} by {admin_user.id}")
    return {"message": f"User role updated to {body.role}", "user_id": user_id}


@router.delete("/users/{user_id}")
async def delete_user(
    user_id: str,
    admin_user: User = Depends(require_role("owner")),
    db: AsyncSession = Depends(get_db),
):
    """Delete a user (owner only)."""
    result = await db.execute(select(User).where(User.id == user_id))
    user = result.scalar_one_or_none()

    if not user:
        raise HTTPException(status_code=404, detail="User not found")

    if user.id == admin_user.id:
        raise HTTPException(status_code=400, detail="Cannot delete yourself")

    await db.delete(user)
    await db.commit()

    logger.info(f"User {user_id} deleted by {admin_user.id}")
    return {"message": "User deleted", "user_id": user_id}
