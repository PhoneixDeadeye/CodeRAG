from fastapi import Depends, HTTPException, status, Request
from typing import List, Optional
from app.core.database import User, APIKey, AsyncSessionLocal
from sqlalchemy import select
from datetime import datetime, timezone
from app.api.routers.auth import get_current_user

def require_role(roles: List[str]):
    """
    Dependency that checks if the current user has one of the required roles.
    Works for both JWT-authenticated users and API Key-authenticated requests.
    """
    async def role_checker(request: Request, user: User = Depends(get_current_user)):
        # Skip role check if the user is an admin
        if user.role == "Admin":
            return user

        if user.role not in roles:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="You do not have permission to perform this action.",
            )
        return user

    return role_checker

async def get_api_key(request: Request) -> Optional[APIKey]:
    """Extracts API key from the Authorization header if present."""
    auth_header = request.headers.get("Authorization")
    if not auth_header or not auth_header.startswith("Bearer "):
        return None
        
    # We only check API keys if the token format is long/looks like a key 
    # instead of a JWT. CodeRAG's API keys will start with 'cr_'
    token = auth_header.replace("Bearer ", "")
    if not token.startswith("cr_"):
        return None
        
    async with AsyncSessionLocal() as session:
        result = await session.execute(
            select(APIKey).where(
                APIKey.key == token,
                APIKey.is_revoked.is_(False)
            )
        )
        api_key = result.scalar_one_or_none()
        
        if not api_key:
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="Invalid API Key",
            )
            
        if api_key.expires_at and api_key.expires_at < datetime.now(timezone.utc):
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="API Key has expired",
            )
            
        return api_key

async def get_current_user_or_api_key(
    request: Request,
    user: Optional[User] = Depends(get_current_user),
    api_key: Optional[APIKey] = Depends(get_api_key)
) -> User:
    """
    Dependency to get the current user, either via JWT or via API Key.
    """
    if user:
        return user
        
    if api_key:
        # Load the user associated with the API key
        async with AsyncSessionLocal() as session:
            result = await session.execute(
                select(User).where(User.id == api_key.user_id)
            )
            key_user = result.scalar_one_or_none()
            if key_user:
                return key_user
                
    raise HTTPException(
        status_code=status.HTTP_401_UNAUTHORIZED,
        detail="Not authenticated",
        headers={"WWW-Authenticate": "Bearer"},
    )
