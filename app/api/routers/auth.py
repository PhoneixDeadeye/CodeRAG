from fastapi import APIRouter, Depends, HTTPException, status, Request
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from app.core.database import get_db, User, Organization, APIKey, RefreshToken
from app.services.auth import (
    get_current_user,
    create_access_token,
    create_refresh_token,
    get_refresh_token_claims,
    hash_refresh_token,
    get_password_hash,
    verify_password,
    ACCESS_TOKEN_EXPIRE_MINUTES,
)
from app.services.permissions import require_role
from app.api.rate_limiter import check_login_limit
from pydantic import BaseModel, field_validator, EmailStr
from datetime import timedelta, datetime, timezone
from fastapi.security import OAuth2PasswordRequestForm
import logging
import secrets

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/api/v1/auth", tags=["auth"])


# -- Models --
class UserCreate(BaseModel):
    email: EmailStr
    password: str

    @field_validator("password")
    @classmethod
    def validate_password(cls, v):
        if len(v) < 6:
            raise ValueError("Password must be at least 6 characters")
        if len(v) > 100:
            raise ValueError("Password too long")
        return v


class Token(BaseModel):
    access_token: str
    refresh_token: str
    token_type: str


class RefreshTokenRequest(BaseModel):
    refresh_token: str


class APIKeyCreate(BaseModel):
    name: str

class APIKeyResponse(BaseModel):
    id: str
    key: str | None = None  # Only returned on creation
    name: str
    is_revoked: bool
    created_at: str

    class Config:
        from_attributes = True


async def _persist_refresh_token(
    db: AsyncSession,
    user: User,
    refresh_token: str,
    request: Request,
) -> None:
    claims = get_refresh_token_claims(refresh_token)
    if not claims:
        raise HTTPException(status_code=500, detail="Failed to issue refresh token")

    exp_ts = claims.get("exp")
    jti = claims.get("jti")
    if not exp_ts or not jti:
        raise HTTPException(status_code=500, detail="Invalid refresh token claims")

    token_row = RefreshToken(
        user_id=user.id,
        token_hash=hash_refresh_token(refresh_token),
        jti=str(jti),
        expires_at=datetime.fromtimestamp(exp_ts, tz=timezone.utc),
        user_agent=request.headers.get("user-agent"),
        ip_address=request.client.host if request.client else None,
    )
    db.add(token_row)
    await db.commit()

# -- Endpoints --
@router.post("/register", response_model=Token)
async def register(
    request: Request, user: UserCreate, db: AsyncSession = Depends(get_db)
):
    """Register a new user account."""
    # Rate limit registration by IP to prevent mass account creation
    client_ip = request.client.host if request.client else "unknown"
    check_login_limit(client_ip)

    # Async query
    result = await db.execute(select(User).filter(User.email == user.email))
    db_user = result.scalars().first()

    if db_user:
        logger.warning(f"Registration attempt with existing email: {user.email}")
        raise HTTPException(status_code=400, detail="Email already registered")

    hashed_pwd = get_password_hash(user.password)
    
    # Auto-create a default workspace organization
    org_name = f"{user.email.split('@')[0]}'s Workspace"
    new_org = Organization(name=org_name)
    new_user = User(email=user.email, hashed_password=hashed_pwd, organization=new_org)

    try:
        db.add(new_org)
        db.add(new_user)
        await db.commit()
        await db.refresh(new_user)
        logger.info(f"New user registered: {user.email} with workspace {org_name}")
    except Exception as e:
        await db.rollback()
        logger.error(f"Registration failed for {user.email}: {e}")
        raise HTTPException(status_code=500, detail="Registration failed. Please try again.")

    access_token = create_access_token(data={"sub": new_user.email})
    refresh_token = create_refresh_token(data={"sub": new_user.email})
    await _persist_refresh_token(db, new_user, refresh_token, request)
    return {
        "access_token": access_token,
        "refresh_token": refresh_token,
        "token_type": "bearer",
    }


@router.post("/login", response_model=Token)
async def login(
    request: Request,
    form_data: OAuth2PasswordRequestForm = Depends(),
    db: AsyncSession = Depends(get_db),
):
    """Authenticate user and return access token."""
    # Check rate limit using client IP
    client_ip = request.client.host if request.client else "unknown"
    check_login_limit(client_ip)

    # Async query
    result = await db.execute(select(User).filter(User.email == form_data.username))
    user = result.scalars().first()

    if not user or not verify_password(form_data.password, user.hashed_password):
        logger.warning(f"Failed login attempt for: {form_data.username}")
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Incorrect username or password",
            headers={"WWW-Authenticate": "Bearer"},
        )

    access_token_expires = timedelta(minutes=ACCESS_TOKEN_EXPIRE_MINUTES)
    access_token = create_access_token(
        data={"sub": user.email}, expires_delta=access_token_expires
    )
    refresh_token = create_refresh_token(data={"sub": user.email})
    await _persist_refresh_token(db, user, refresh_token, request)

    logger.info(f"User logged in: {user.email}")
    return {
        "access_token": access_token,
        "refresh_token": refresh_token,
        "token_type": "bearer",
    }


@router.post("/refresh", response_model=Token)
async def refresh_token(
    request: Request,
    payload: RefreshTokenRequest,
    db: AsyncSession = Depends(get_db),
):
    """
    Refresh access token using a valid refresh token.
    Rotates the refresh token as well for security (Reuse Detection).
    """
    claims = get_refresh_token_claims(payload.refresh_token)
    if not claims:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid or expired refresh token",
            headers={"WWW-Authenticate": "Bearer"},
        )

    email = claims.get("sub")
    old_jti = claims.get("jti")
    token_hash = hash_refresh_token(payload.refresh_token)

    # Check if user still exists
    result = await db.execute(select(User).filter(User.email == email))
    user = result.scalars().first()
    if not user:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="User no longer exists",
            headers={"WWW-Authenticate": "Bearer"},
        )

    token_result = await db.execute(
        select(RefreshToken).where(RefreshToken.token_hash == token_hash)
    )
    token_row = token_result.scalar_one_or_none()
    if not token_row:
        logger.warning("Refresh token reuse or unknown token for user %s", user.email)
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Refresh token is not recognized",
            headers={"WWW-Authenticate": "Bearer"},
        )

    now = datetime.now(timezone.utc)
    expires_at = token_row.expires_at
    if expires_at.tzinfo is None:
        expires_at = expires_at.replace(tzinfo=timezone.utc)

    if token_row.revoked_at is not None or expires_at <= now:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Refresh token is no longer valid",
            headers={"WWW-Authenticate": "Bearer"},
        )

    access_token_expires = timedelta(minutes=ACCESS_TOKEN_EXPIRE_MINUTES)
    access_token = create_access_token(
        data={"sub": user.email}, expires_delta=access_token_expires
    )
    # Rotate refresh token
    new_refresh_token = create_refresh_token(data={"sub": user.email})

    new_claims = get_refresh_token_claims(new_refresh_token)
    if not new_claims:
        raise HTTPException(status_code=500, detail="Failed to rotate refresh token")

    new_jti = str(new_claims.get("jti"))
    new_exp_ts = new_claims.get("exp")
    if not new_exp_ts:
        raise HTTPException(status_code=500, detail="Failed to rotate refresh token")

    token_row.revoked_at = now
    token_row.replaced_by_jti = new_jti
    db.add(
        RefreshToken(
            user_id=user.id,
            token_hash=hash_refresh_token(new_refresh_token),
            jti=new_jti,
            expires_at=datetime.fromtimestamp(new_exp_ts, tz=timezone.utc),
            user_agent=request.headers.get("user-agent"),
            ip_address=request.client.host if request.client else None,
        )
    )
    await db.commit()

    if old_jti and token_row.jti != old_jti:
        logger.warning(
            "Refresh token claim mismatch detected for user %s", user.email
        )

    return {
        "access_token": access_token,
        "refresh_token": new_refresh_token,
        "token_type": "bearer",
    }


@router.post("/logout")
async def logout(
    payload: RefreshTokenRequest,
    db: AsyncSession = Depends(get_db),
):
    """Revoke a refresh token for the current user."""
    token_hash = hash_refresh_token(payload.refresh_token)
    result = await db.execute(
        select(RefreshToken).where(
            RefreshToken.token_hash == token_hash,
            RefreshToken.revoked_at.is_(None),
        )
    )
    row = result.scalar_one_or_none()
    if row:
        row.revoked_at = datetime.now(timezone.utc)
        await db.commit()

    return {"status": "success"}


@router.get("/me")
async def read_users_me(current_user: User = Depends(get_current_user)):
    """Get current authenticated user information."""
    return {
        "id": current_user.id,
        "email": current_user.email,
        "organization_id": current_user.organization_id,
        "role": current_user.role
    }

# --- API Key Endpoints ---

@router.post("/api-keys", response_model=APIKeyResponse)
async def create_api_key(
    request: APIKeyCreate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_role(["admin", "member"]))
):
    """
    Generate a new API key for the current user's organization.
    Requires at least 'member' privileges.
    """
    # Generate a secure key with the 'cr_' prefix (CodeRAG)
    key_value = "cr_" + secrets.token_urlsafe(32)
    
    new_api_key = APIKey(
        key=key_value,
        name=request.name,
        user_id=current_user.id,
        organization_id=current_user.organization_id,
        # API Keys do not expire automatically per requested behavior
    )
    
    try:
        db.add(new_api_key)
        await db.commit()
        await db.refresh(new_api_key)
        logger.info(f"API Key '{request.name}' generated by user {current_user.id}")
        
        # We manually format the response because we want to include the key.
        # Future calls to list API keys should NOT return the plain text key.
        return {
            "id": new_api_key.id,
            "key": key_value,
            "name": new_api_key.name,
            "is_revoked": new_api_key.is_revoked,
            "created_at": new_api_key.created_at.isoformat()
        }
    except Exception as e:
        await db.rollback()
        logger.error(f"Failed to generate API Key: {e}")
        raise HTTPException(status_code=500, detail="Failed to generate API Key.")


@router.get("/api-keys")
async def list_api_keys(
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_role(["admin", "member", "viewer"]))
):
    """
    List all API keys belonging to the user's organization.
    Returns the keys with their secret values hidden.
    """
    result = await db.execute(
        select(APIKey).where(APIKey.organization_id == current_user.organization_id)
    )
    api_keys = result.scalars().all()
    
    return [
        {
            "id": key.id,
            "name": key.name,
            "is_revoked": key.is_revoked,
            "created_at": key.created_at.isoformat()
            # Intentionally omitting the raw 'key' value for security
        }
        for key in api_keys
    ]

@router.delete("/api-keys/{key_id}", status_code=status.HTTP_204_NO_CONTENT)
async def revoke_api_key(
    key_id: str,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_role(["admin", "member"]))
):
    """
    Revoke an API Key. Once revoked, it cannot be used again.
    Requires 'admin' or 'member' privileges.
    """
    result = await db.execute(
        select(APIKey).where(
            APIKey.id == key_id,
            APIKey.organization_id == current_user.organization_id
        )
    )
    api_key = result.scalar_one_or_none()
    
    if not api_key:
        raise HTTPException(status_code=404, detail="API Key not found")
        
    api_key.is_revoked = True
    try:
        await db.commit()
        logger.info(f"API Key {key_id} revoked by user {current_user.id}")
    except Exception as e:
        await db.rollback()
        logger.error(f"Failed to revoke API Key: {e}")
        raise HTTPException(status_code=500, detail="Failed to revoke API Key.")
