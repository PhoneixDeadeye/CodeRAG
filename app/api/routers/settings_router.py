"""Settings API Router — User Profile, Preferences, API Keys."""

import logging
import secrets
from datetime import datetime, timezone, timedelta
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import (
    get_db,
    User,
    APIKey,
    generate_uuid,
)
from app.services.auth import get_current_user

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/api/v1/settings", tags=["Settings"])


# ──────────────────────────────────────────────────────────────
# Models
# ──────────────────────────────────────────────────────────────


class ProfileResponse(BaseModel):
    id: str
    email: str
    role: str
    is_active: bool
    github_id: Optional[str] = None
    avatar_url: Optional[str] = None
    preferred_llm_provider: str = "gemini"
    created_at: Optional[str] = None


class ProfileUpdateRequest(BaseModel):
    email: Optional[str] = None
    avatar_url: Optional[str] = None


class PreferencesUpdateRequest(BaseModel):
    preferred_llm_provider: Optional[str] = None  # gemini, openai, anthropic


class APIKeyCreateRequest(BaseModel):
    name: str
    expires_in_days: Optional[int] = 90  # Default 90 days


class APIKeyResponse(BaseModel):
    id: str
    name: str
    key_preview: str  # first 8 + last 4 chars
    is_revoked: bool
    created_at: Optional[str] = None
    expires_at: Optional[str] = None


class APIKeyCreatedResponse(BaseModel):
    id: str
    name: str
    key: str  # Full key — shown only once
    expires_at: Optional[str] = None


# ──────────────────────────────────────────────────────────────
# Profile Endpoints
# ──────────────────────────────────────────────────────────────


@router.get("/profile", response_model=ProfileResponse)
async def get_profile(
    current_user: User = Depends(get_current_user),
):
    """Get current user profile."""
    return ProfileResponse(
        id=current_user.id,
        email=current_user.email,
        role=current_user.role or "member",
        is_active=current_user.is_active,
        github_id=current_user.github_id,
        avatar_url=current_user.avatar_url,
        preferred_llm_provider=current_user.preferred_llm_provider or "gemini",
        created_at=current_user.created_at.isoformat() if current_user.created_at else None,
    )


@router.patch("/profile", response_model=ProfileResponse)
async def update_profile(
    body: ProfileUpdateRequest,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Update user profile."""
    if body.email is not None:
        # Check if email is already taken
        existing = await db.scalar(
            select(User.id).where(User.email == body.email, User.id != current_user.id)
        )
        if existing:
            raise HTTPException(status_code=400, detail="Email already in use")
        current_user.email = body.email

    if body.avatar_url is not None:
        current_user.avatar_url = body.avatar_url

    await db.commit()
    await db.refresh(current_user)

    return ProfileResponse(
        id=current_user.id,
        email=current_user.email,
        role=current_user.role or "member",
        is_active=current_user.is_active,
        github_id=current_user.github_id,
        avatar_url=current_user.avatar_url,
        preferred_llm_provider=current_user.preferred_llm_provider or "gemini",
        created_at=current_user.created_at.isoformat() if current_user.created_at else None,
    )


@router.patch("/preferences")
async def update_preferences(
    body: PreferencesUpdateRequest,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Update user preferences (LLM provider, etc.)."""
    valid_providers = ["gemini", "openai", "anthropic"]

    if body.preferred_llm_provider is not None:
        if body.preferred_llm_provider not in valid_providers:
            raise HTTPException(
                status_code=400,
                detail=f"Invalid LLM provider. Choose from: {', '.join(valid_providers)}",
            )
        current_user.preferred_llm_provider = body.preferred_llm_provider

    await db.commit()

    return {
        "message": "Preferences updated",
        "preferred_llm_provider": current_user.preferred_llm_provider,
    }


# ──────────────────────────────────────────────────────────────
# API Key Endpoints
# ──────────────────────────────────────────────────────────────


@router.get("/api-keys", response_model=list[APIKeyResponse])
async def list_api_keys(
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """List all API keys for the current user."""
    result = await db.execute(
        select(APIKey)
        .where(APIKey.user_id == current_user.id)
        .order_by(APIKey.created_at.desc())
    )
    keys = result.scalars().all()

    return [
        APIKeyResponse(
            id=k.id,
            name=k.name,
            key_preview=f"{k.key[:8]}...{k.key[-4:]}" if len(k.key) > 12 else "****",
            is_revoked=k.is_revoked,
            created_at=k.created_at.isoformat() if k.created_at else None,
            expires_at=k.expires_at.isoformat() if k.expires_at else None,
        )
        for k in keys
    ]


@router.post("/api-keys", response_model=APIKeyCreatedResponse, status_code=201)
async def create_api_key(
    body: APIKeyCreateRequest,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Create a new API key. The full key is only shown once."""
    raw_key = f"cr_{secrets.token_urlsafe(32)}"
    expires_at = None
    if body.expires_in_days:
        expires_at = datetime.now(timezone.utc) + timedelta(days=body.expires_in_days)

    api_key = APIKey(
        id=generate_uuid(),
        key=raw_key,
        user_id=current_user.id,
        organization_id=current_user.organization_id,
        name=body.name,
        expires_at=expires_at,
    )
    db.add(api_key)
    await db.commit()

    logger.info(f"API key created: name={body.name} user={current_user.id}")

    return APIKeyCreatedResponse(
        id=api_key.id,
        name=api_key.name,
        key=raw_key,
        expires_at=expires_at.isoformat() if expires_at else None,
    )


@router.delete("/api-keys/{key_id}")
async def revoke_api_key(
    key_id: str,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Revoke an API key."""
    result = await db.execute(
        select(APIKey).where(
            APIKey.id == key_id,
            APIKey.user_id == current_user.id,
        )
    )
    key = result.scalar_one_or_none()

    if not key:
        raise HTTPException(status_code=404, detail="API key not found")

    key.is_revoked = True
    await db.commit()

    logger.info(f"API key revoked: id={key_id} user={current_user.id}")
    return {"message": "API key revoked", "key_id": key_id}
