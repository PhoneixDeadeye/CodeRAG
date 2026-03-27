"""GitHub OAuth Router — Login and Callback for GitHub authentication.

Enables users to connect their GitHub account for private repo access.
"""

import logging
import secrets
from datetime import datetime, timezone
from typing import Optional
from urllib.parse import urlencode

import httpx
from fastapi import APIRouter, Depends, HTTPException, Query
from fastapi.responses import RedirectResponse
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import settings
from app.core.database import (
    get_db,
    User,
    GitHubToken,
    generate_uuid,
)
from app.services.auth import get_current_user, create_access_token

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/api/v1/auth/github", tags=["GitHub OAuth"])

# In-memory state store for CSRF protection (use Redis in production)
_oauth_states: dict[str, dict] = {}

GITHUB_AUTHORIZE_URL = "https://github.com/login/oauth/authorize"
GITHUB_TOKEN_URL = "https://github.com/login/oauth/access_token"
GITHUB_USER_URL = "https://api.github.com/user"


@router.get("/login")
async def github_login(
    current_user: Optional[User] = Depends(get_current_user),
):
    """Redirect to GitHub OAuth authorization page."""
    if not settings.GITHUB_CLIENT_ID:
        raise HTTPException(
            status_code=501,
            detail="GitHub OAuth is not configured. Set GITHUB_CLIENT_ID and GITHUB_CLIENT_SECRET.",
        )

    state = secrets.token_urlsafe(32)
    _oauth_states[state] = {
        "user_id": current_user.id if current_user else None,
        "created_at": datetime.now(timezone.utc).isoformat(),
    }

    params = {
        "client_id": settings.GITHUB_CLIENT_ID,
        "redirect_uri": settings.GITHUB_REDIRECT_URI,
        "scope": "repo read:user user:email",
        "state": state,
    }

    return RedirectResponse(url=f"{GITHUB_AUTHORIZE_URL}?{urlencode(params)}")


@router.get("/callback")
async def github_callback(
    code: str = Query(...),
    state: str = Query(...),
    db: AsyncSession = Depends(get_db),
):
    """Handle GitHub OAuth callback."""
    if not settings.GITHUB_CLIENT_ID or not settings.GITHUB_CLIENT_SECRET:
        raise HTTPException(status_code=501, detail="GitHub OAuth is not configured.")

    # Verify state for CSRF protection
    state_data = _oauth_states.pop(state, None)
    if not state_data:
        raise HTTPException(status_code=400, detail="Invalid or expired OAuth state")

    # Exchange code for token
    async with httpx.AsyncClient() as client:
        token_response = await client.post(
            GITHUB_TOKEN_URL,
            data={
                "client_id": settings.GITHUB_CLIENT_ID,
                "client_secret": settings.GITHUB_CLIENT_SECRET,
                "code": code,
                "redirect_uri": settings.GITHUB_REDIRECT_URI,
            },
            headers={"Accept": "application/json"},
        )

        if token_response.status_code != 200:
            raise HTTPException(
                status_code=502,
                detail="Failed to exchange code for GitHub access token",
            )

        token_data = token_response.json()
        access_token = token_data.get("access_token")
        if not access_token:
            raise HTTPException(
                status_code=502,
                detail=f"GitHub OAuth error: {token_data.get('error_description', 'Unknown error')}",
            )

        # Get GitHub user info
        user_response = await client.get(
            GITHUB_USER_URL,
            headers={
                "Authorization": f"token {access_token}",
                "Accept": "application/json",
            },
        )

        if user_response.status_code != 200:
            raise HTTPException(
                status_code=502,
                detail="Failed to fetch GitHub user info",
            )

        github_user = user_response.json()

    github_id = str(github_user.get("id"))
    github_username = github_user.get("login")
    avatar_url = github_user.get("avatar_url")
    email = github_user.get("email") or f"{github_username}@github.coderag"

    # Find or create user
    user_id = state_data.get("user_id")
    if user_id:
        # Link GitHub to existing user
        result = await db.execute(select(User).where(User.id == user_id))
        user = result.scalar_one_or_none()
        if user:
            user.github_id = github_id
            user.avatar_url = avatar_url
    else:
        # Check if user exists by GitHub ID
        result = await db.execute(select(User).where(User.github_id == github_id))
        user = result.scalar_one_or_none()

        if not user:
            # Check by email
            result = await db.execute(select(User).where(User.email == email))
            user = result.scalar_one_or_none()

            if user:
                user.github_id = github_id
                user.avatar_url = avatar_url
            else:
                # Create new user
                from passlib.context import CryptContext
                pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")

                user = User(
                    id=generate_uuid(),
                    email=email,
                    hashed_password=pwd_context.hash(secrets.token_urlsafe(32)),
                    github_id=github_id,
                    avatar_url=avatar_url,
                    role="User",
                )
                db.add(user)

    # Store GitHub token
    github_token = GitHubToken(
        id=generate_uuid(),
        user_id=user.id,
        encrypted_access_token=access_token,  # In production, encrypt with Fernet
        github_username=github_username,
        scopes=token_data.get("scope", ""),
    )
    db.add(github_token)
    await db.commit()

    # Generate JWT for the user
    jwt_token = create_access_token(data={"sub": user.email})

    logger.info(f"GitHub OAuth completed for user {user.id} ({github_username})")

    # Redirect to frontend with token
    frontend_url = settings.CORS_ORIGINS[0] if settings.CORS_ORIGINS else "http://localhost:5173"
    return RedirectResponse(
        url=f"{frontend_url}/auth/callback?token={jwt_token}&github=true"
    )


@router.get("/status")
async def github_connection_status(
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Check if the current user has a linked GitHub account."""
    result = await db.execute(
        select(GitHubToken)
        .where(GitHubToken.user_id == current_user.id)
        .order_by(GitHubToken.created_at.desc())
        .limit(1)
    )
    token = result.scalar_one_or_none()

    return {
        "connected": current_user.github_id is not None,
        "github_id": current_user.github_id,
        "github_username": token.github_username if token else None,
        "avatar_url": current_user.avatar_url,
    }


@router.delete("/disconnect")
async def disconnect_github(
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Disconnect GitHub account from user."""
    current_user.github_id = None
    current_user.avatar_url = None

    # Remove stored tokens
    result = await db.execute(
        select(GitHubToken).where(GitHubToken.user_id == current_user.id)
    )
    tokens = result.scalars().all()
    for token in tokens:
        await db.delete(token)

    await db.commit()

    logger.info(f"GitHub disconnected for user {current_user.id}")
    return {"message": "GitHub account disconnected"}
