from fastapi import APIRouter, Depends, HTTPException
from fastapi.responses import Response, JSONResponse
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from sqlalchemy.orm import joinedload
from app.core.database import get_db, User, ChatSession, ChatMessage, Repository
from app.services.auth import get_current_user
from pydantic import BaseModel, field_validator
from typing import Optional, List, Dict
from datetime import datetime, timezone
import logging

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/api/v1/sessions", tags=["sessions"])


# -- Models --
class SessionDTO(BaseModel):
    id: str
    name: str
    repo_url: Optional[str]
    created_at: Optional[str]
    updated_at: Optional[str]


class SessionCreate(BaseModel):
    name: str
    repo_url: Optional[str] = None

    @field_validator("name")
    @classmethod
    def validate_name(cls, v):
        if not v or not v.strip():
            raise ValueError("Session name cannot be empty")
        if len(v) > 200:
            raise ValueError("Session name too long")
        return v.strip()


class MessageCreate(BaseModel):
    role: str
    content: str
    sources: Optional[List[Dict]] = None

    @field_validator("role")
    @classmethod
    def validate_role(cls, v):
        if v not in ["user", "assistant"]:
            raise ValueError("Role must be user or assistant")
        return v

    @field_validator("content")
    @classmethod
    def validate_content(cls, v):
        if not v or not v.strip():
            raise ValueError("Message content cannot be empty")
        return v


# -- Endpoints --
@router.get("")
async def list_sessions(
    db: AsyncSession = Depends(get_db), user: User = Depends(get_current_user)
):
    """List all chat sessions for the current user."""
    # Eager load repositories to avoid N+1 query problem
    result = await db.execute(
        select(ChatSession)
        .options(joinedload(ChatSession.repo))
        .filter(ChatSession.user_id == user.id)
        .order_by(ChatSession.updated_at.desc())
    )
    sessions = result.scalars().all()

    logger.debug(f"Retrieved {len(sessions)} sessions for user {user.email}")

    # Transform to include repo_url for frontend compatibility
    result = []
    for s in sessions:
        repo_url = s.repo.url if s.repo else None
        result.append(
            {
                "id": s.id,
                "name": s.name,
                "repo_url": repo_url,
                "created_at": s.created_at.isoformat() if s.created_at else None,
                "updated_at": s.updated_at.isoformat() if s.updated_at else None,
            }
        )
    return {"sessions": result}


@router.post("", response_model=Dict[str, str])
async def create_session(
    session: SessionCreate,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    """Create a new chat session."""
    # If repo_url provided, find repo_id
    repo_id = None
    if session.repo_url:
        result = await db.execute(
            select(Repository).filter(
                Repository.user_id == user.id, Repository.url == session.repo_url
            )
        )
        repo = result.scalars().first()
        if repo:
            repo_id = repo.id

    new_session = ChatSession(user_id=user.id, repo_id=repo_id, name=session.name)
    try:
        db.add(new_session)
        await db.commit()
        await db.refresh(new_session)
        logger.info(f"Created session '{session.name}' for user {user.email}")
    except Exception as e:
        await db.rollback()
        logger.error(f"Failed to create session: {e}")
        raise HTTPException(
            status_code=500, detail="Failed to create session. Please try again."
        )
    return {"session_id": new_session.id}


@router.get("/{session_id}")
async def get_session(
    session_id: str,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    """Get a specific session with all its messages."""
    result = await db.execute(
        select(ChatSession).filter(
            ChatSession.id == session_id, ChatSession.user_id == user.id
        )
    )
    session = result.scalars().first()
    if not session:
        logger.warning(f"Session {session_id} not found for user {user.email}")
        raise HTTPException(status_code=404, detail="Session not found")

    result = await db.execute(
        select(ChatMessage)
        .filter(ChatMessage.session_id == session_id)
        .order_by(ChatMessage.created_at)
    )
    messages = result.scalars().all()

    return {"session": session, "messages": messages}


@router.delete("/{session_id}")
async def delete_session(
    session_id: str,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    """Delete a chat session and all its messages."""
    result = await db.execute(
        select(ChatSession).filter(
            ChatSession.id == session_id, ChatSession.user_id == user.id
        )
    )
    session = result.scalars().first()
    if not session:
        raise HTTPException(status_code=404, detail="Session not found")

    try:
        await db.delete(session)
        await db.commit()
        logger.info(f"Deleted session {session_id} for user {user.email}")
    except Exception as e:
        await db.rollback()
        logger.error(f"Failed to delete session {session_id}: {e}")
        raise HTTPException(
            status_code=500, detail="Failed to delete session. Please try again."
        )
    return {"status": "success"}


@router.post("/{session_id}/messages")
async def add_session_message(
    session_id: str,
    message: MessageCreate,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    """Add a message to an existing chat session."""
    result = await db.execute(
        select(ChatSession).filter(
            ChatSession.id == session_id, ChatSession.user_id == user.id
        )
    )
    session = result.scalars().first()
    if not session:
        raise HTTPException(status_code=404, detail="Session not found")

    new_msg = ChatMessage(
        session_id=session_id, role=message.role, content=message.content
    )
    try:
        db.add(new_msg)

        # Update session updated_at
        session.updated_at = datetime.now(timezone.utc)

        await db.commit()
    except Exception:
        await db.rollback()
        raise HTTPException(status_code=500, detail="Failed to save message. Please try again.")
    return {"status": "success"}


@router.get("/{session_id}/export")
async def export_session(
    session_id: str,
    format: str = "json",
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    """Export chat session history as JSON or Markdown."""
    result = await db.execute(
        select(ChatSession).filter(
            ChatSession.id == session_id, ChatSession.user_id == user.id
        )
    )
    session = result.scalars().first()
    if not session:
        raise HTTPException(status_code=404, detail="Session not found")

    result = await db.execute(
        select(ChatMessage)
        .filter(ChatMessage.session_id == session_id)
        .order_by(ChatMessage.created_at)
    )
    messages = result.scalars().all()

    if format.lower() == "json":
        data = {
            "session": {
                "id": session.id,
                "name": session.name,
                "created_at": session.created_at.isoformat()
                if session.created_at
                else None,
                "repo_id": session.repo_id,
            },
            "messages": [
                {
                    "role": m.role,
                    "content": m.content,
                    "created_at": m.created_at.isoformat() if m.created_at else None,
                }
                for m in messages
            ],
        }
        return JSONResponse(
            content=data,
            headers={
                "Content-Disposition": f"attachment; filename=chat_export_{session_id}.json"
            },
        )

    elif format.lower() == "markdown":
        created_str = (
            session.created_at.strftime("%Y-%m-%d %H:%M:%S")
            if session.created_at
            else "Unknown"
        )
        md_content = f"# Chat Export: {session.name}\n\n"
        md_content += f"**Date:** {created_str}\n\n"
        md_content += "---\n\n"

        for m in messages:
            role_title = "User" if m.role == "user" else "AI Assistant"
            md_content += f"### {role_title}\n\n{m.content}\n\n"

        return Response(
            content=md_content,
            media_type="text/markdown",
            headers={
                "Content-Disposition": f"attachment; filename=chat_export_{session_id}.md"
            },
        )

    else:
        raise HTTPException(
            status_code=400, detail="Invalid format. Supported: json, markdown"
        )
