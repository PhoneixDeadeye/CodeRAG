"""
Guest session management endpoints.

This module handles guest session data, including merging guest sessions
into authenticated user accounts when a user logs in.
"""
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from database import get_db, User, ChatSession, ChatMessage
from auth import get_current_user
from pydantic import BaseModel
from typing import List, Optional
from datetime import datetime, timezone
import logging

router = APIRouter(prefix="/api/guest", tags=["guest"])
logger = logging.getLogger("CodeRAG")


# -- Models --
class GuestMessage(BaseModel):
    """A message from a guest session to be merged."""
    role: str  # 'user' or 'assistant'
    content: str
    timestamp: Optional[int] = None  # Unix timestamp from client


class GuestMergeRequest(BaseModel):
    """Request to merge guest session data into user account."""
    guest_session_id: str
    messages: List[GuestMessage]
    repo_id: Optional[str] = None


class GuestMergeResponse(BaseModel):
    """Response after merging guest data."""
    status: str
    session_id: str
    messages_imported: int


# -- Endpoints --
@router.post("/merge", response_model=GuestMergeResponse)
async def merge_guest_session(
    request: GuestMergeRequest,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user)
):
    """
    Merge guest session data into authenticated user account.
    
    This endpoint is called when a guest user logs in and wants to
    preserve their current chat session. The guest messages are
    imported into a new server-side session.
    
    Only the current session is merged (per user requirements).
    """
    if not request.messages:
        raise HTTPException(status_code=400, detail="No messages to merge")
    
    # Create a new chat session for the merged data
    new_session = ChatSession(
        user_id=user.id,
        repo_id=request.repo_id,
        name=f"Imported from Guest - {datetime.now().strftime('%Y-%m-%d %H:%M')}"
    )
    
    try:
        db.add(new_session)
        db.commit()
        db.refresh(new_session)
        
        # Import messages
        messages_imported = 0
        for msg in request.messages:
            if msg.role not in ['user', 'assistant']:
                continue  # Skip invalid roles
            
            if not msg.content or not msg.content.strip():
                continue  # Skip empty messages
            
            chat_msg = ChatMessage(
                session_id=new_session.id,
                role=msg.role,
                content=msg.content.strip()
            )
            db.add(chat_msg)
            messages_imported += 1
        
        db.commit()
        
        logger.info(
            f"Merged guest session {request.guest_session_id} into user {user.email} "
            f"with {messages_imported} messages"
        )
        
        return GuestMergeResponse(
            status="success",
            session_id=new_session.id,
            messages_imported=messages_imported
        )
        
    except Exception as e:
        db.rollback()
        logger.error(f"Failed to merge guest session: {e}")
        raise HTTPException(status_code=500, detail=f"Failed to merge session: {str(e)}")


@router.get("/status")
async def guest_status():
    """
    Check guest mode status.
    
    This is a simple endpoint that confirms the API is accessible
    without authentication. Useful for frontend to verify guest mode.
    """
    return {
        "status": "guest_mode_available",
        "features": [
            "chat",
            "file_browse",
            "search",
            "repo_ingest"
        ],
        "persistence": False,
        "message": "Log in to save your work and access history"
    }
