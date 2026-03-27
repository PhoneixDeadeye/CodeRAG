"""User feedback endpoint."""

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession
from pydantic import BaseModel
from typing import Optional
from app.core.database import get_db, User, Feedback
from app.services.auth import get_optional_user
import logging

router = APIRouter(prefix="/api/v1", tags=["feedback"])
logger = logging.getLogger("CodeRAG")


class FeedbackRequest(BaseModel):
    question: str
    answer: str
    rating: int
    comment: Optional[str] = None


@router.post("/feedback")
async def submit_feedback(
    feedback: FeedbackRequest,
    db: AsyncSession = Depends(get_db),
    user: Optional[User] = Depends(get_optional_user),
):
    """Submit user feedback for a chat response.

    Works for both authenticated users and guests.
    Guest feedback is stored without user association.
    """
    new_feedback = Feedback(
        user_id=user.id if user else None,
        question=feedback.question,
        answer=feedback.answer,
        rating=feedback.rating,
        comment=feedback.comment,
    )
    try:
        db.add(new_feedback)
        await db.commit()
    except Exception:
        await db.rollback()
        raise HTTPException(
            status_code=500, detail="Failed to save feedback. Please try again."
        )
    return {"status": "success"}
