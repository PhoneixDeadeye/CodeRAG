from typing import Optional
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from app.core.database import User, Repository


async def resolve_chat_repo(
    db: AsyncSession,
    user: Optional[User],
    guest_session_id: Optional[str],
    repo_id: Optional[str],
) -> Optional[Repository]:
    """
    Resolve the repository to use for a chat session.

    Priority:
    1. Explicit repo_id (if owned by user or guest, or valid public/ready)
    2. Most recently updated repo for the user/guest
    3. Any ready repo (fallback/demo mode)
    """
    # 1. Explicit Repo ID
    if repo_id:
        if user:
            # User must own the repo
            result = await db.execute(
                select(Repository).filter(
                    Repository.id == repo_id, Repository.user_id == user.id
                )
            )
            repo = result.scalars().first()
            if repo:
                return repo

        elif guest_session_id:
            # Guest must own the repo OR it must be a "public" ready repo?
            # Existing logic was strict on ownership for guest if created by guest,
            # but allowed finding *any* ready repo if not found?
            # Let's check logic from streaming.py:
            # - Check ownership
            # - If not found, check if it's "ready" (implies public/demo repo access?)

            result = await db.execute(
                select(Repository).filter(
                    Repository.id == repo_id, Repository.user_id == guest_session_id
                )
            )
            repo = result.scalars().first()
            if repo:
                return repo

            # Fallback: Allow guest to access any 'ready' repo by ID?
            # The streaming.py logic allowed this.
            result = await db.execute(
                select(Repository).filter(
                    Repository.id == repo_id, Repository.status == "ready"
                )
            )
            repo = result.scalars().first()
            if repo:
                return repo

        else:
            # Anonymous/Public Access by ID
            result = await db.execute(
                select(Repository).filter(
                    Repository.id == repo_id, Repository.status == "ready"
                )
            )
            repo = result.scalars().first()
            if repo:
                return repo

    # 2. Auto-select User's Latest Repo
    if user:
        result = await db.execute(
            select(Repository)
            .filter(Repository.user_id == user.id, Repository.status == "ready")
            .order_by(Repository.updated_at.desc())
        )
        repo = result.scalars().first()
        if repo:
            return repo

    # 3. Auto-select Guest's Latest Repo
    if guest_session_id:
        result = await db.execute(
            select(Repository)
            .filter(
                Repository.user_id == guest_session_id, Repository.status == "ready"
            )
            .order_by(Repository.updated_at.desc())
        )
        repo = result.scalars().first()
        if repo:
            return repo

    # 4. Fallback: Any Ready Repo (Demo Mode)
    result = await db.execute(
        select(Repository)
        .filter(Repository.status == "ready")
        .order_by(Repository.updated_at.desc())
    )
    return result.scalars().first()
