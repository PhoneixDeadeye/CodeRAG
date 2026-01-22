from datetime import datetime, timedelta, timezone
from typing import Optional
from jose import JWTError, jwt
from passlib.context import CryptContext
from fastapi import Depends, HTTPException, status, Header
from fastapi.security import OAuth2PasswordBearer
from sqlalchemy.orm import Session
from database import get_db, User
import os
import logging

logger = logging.getLogger(__name__)

# Configuration
SECRET_KEY = os.getenv("SECRET_KEY", "supersecretkey_change_me_in_prod")

# Warn if using default secret key in production
if SECRET_KEY == "supersecretkey_change_me_in_prod":
    logger.warning(
        "⚠️  WARNING: Using default SECRET_KEY! "
        "This is INSECURE for production. "
        "Generate a secure key: python -c \"import secrets; print(secrets.token_urlsafe(32))\""
    )

ALGORITHM = "HS256"
ACCESS_TOKEN_EXPIRE_MINUTES = 30 * 24 * 60  # 30 days for dev convenience

pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")

# Standard OAuth2 scheme (requires token)
oauth2_scheme = OAuth2PasswordBearer(tokenUrl="/api/auth/login")

# Optional OAuth2 scheme (allows missing token for guest access)
oauth2_scheme_optional = OAuth2PasswordBearer(tokenUrl="/api/auth/login", auto_error=False)

def verify_password(plain_password: str, hashed_password: str) -> bool:
    return pwd_context.verify(plain_password, hashed_password)

def get_password_hash(password: str) -> str:
    return pwd_context.hash(password)

def create_access_token(data: dict, expires_delta: Optional[timedelta] = None) -> str:
    to_encode = data.copy()
    if expires_delta:
        expire = datetime.now(timezone.utc) + expires_delta
    else:
        expire = datetime.now(timezone.utc) + timedelta(minutes=ACCESS_TOKEN_EXPIRE_MINUTES)
    to_encode.update({"exp": expire})
    encoded_jwt = jwt.encode(to_encode, SECRET_KEY, algorithm=ALGORITHM)
    return encoded_jwt

async def get_current_user(token: str = Depends(oauth2_scheme), db: Session = Depends(get_db)) -> User:
    """Get current authenticated user. Raises 401 if not authenticated."""
    credentials_exception = HTTPException(
        status_code=status.HTTP_401_UNAUTHORIZED,
        detail="Could not validate credentials",
        headers={"WWW-Authenticate": "Bearer"},
    )
    try:
        payload = jwt.decode(token, SECRET_KEY, algorithms=[ALGORITHM])
        email: str = payload.get("sub")
        if email is None:
            raise credentials_exception
    except JWTError:
        raise credentials_exception
    
    user = db.query(User).filter(User.email == email).first()
    if user is None:
        raise credentials_exception
    return user


async def get_optional_user(
    token: Optional[str] = Depends(oauth2_scheme_optional),
    db: Session = Depends(get_db)
) -> Optional[User]:
    """
    Get current user if authenticated, None if guest.
    
    This dependency allows endpoints to work for both authenticated users
    and guests. Use this for features that should work without login.
    """
    if not token:
        return None
    
    try:
        payload = jwt.decode(token, SECRET_KEY, algorithms=[ALGORITHM])
        email: Optional[str] = payload.get("sub")
        if email:
            user = db.query(User).filter(User.email == email).first()
            return user
    except JWTError:
        # Invalid token, treat as guest
        logger.debug("Invalid token provided, treating as guest")
    
    return None


def get_guest_session_id(
    x_guest_session_id: Optional[str] = Header(None, alias="X-Guest-Session-ID")
) -> Optional[str]:
    """Extract guest session ID from request header."""
    return x_guest_session_id
