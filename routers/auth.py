from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session
from database import get_db, User
from auth import (
    get_current_user, 
    create_access_token, 
    get_password_hash, 
    verify_password,
    ACCESS_TOKEN_EXPIRE_MINUTES
)
from pydantic import BaseModel, validator, EmailStr
from datetime import timedelta
from fastapi.security import OAuth2PasswordRequestForm
import logging

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/api/auth", tags=["auth"])

# -- Models --
class UserCreate(BaseModel):
    email: EmailStr
    password: str
    
    @validator('password')
    def validate_password(cls, v):
        if len(v) < 6:
            raise ValueError('Password must be at least 6 characters')
        if len(v) > 100:
            raise ValueError('Password too long')
        return v

class Token(BaseModel):
    access_token: str
    token_type: str

# -- Endpoints --
@router.post("/register", response_model=Token)
async def register(user: UserCreate, db: Session = Depends(get_db)):
    """Register a new user account."""
    db_user = db.query(User).filter(User.email == user.email).first()
    if db_user:
        logger.warning(f"Registration attempt with existing email: {user.email}")
        raise HTTPException(status_code=400, detail="Email already registered")
    
    hashed_pwd = get_password_hash(user.password)
    new_user = User(email=user.email, hashed_password=hashed_pwd)
    
    try:
        db.add(new_user)
        db.commit()
        db.refresh(new_user)
        logger.info(f"New user registered: {user.email}")
    except Exception as e:
        db.rollback()
        logger.error(f"Registration failed for {user.email}: {e}")
        raise HTTPException(status_code=500, detail=f"Registration failed: {str(e)}")
    
    access_token = create_access_token(data={"sub": new_user.email})
    return {"access_token": access_token, "token_type": "bearer"}

@router.post("/login", response_model=Token)
async def login(form_data: OAuth2PasswordRequestForm = Depends(), db: Session = Depends(get_db)):
    """Authenticate user and return access token."""
    user = db.query(User).filter(User.email == form_data.username).first()
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
    logger.info(f"User logged in: {user.email}")
    return {"access_token": access_token, "token_type": "bearer"}

@router.get("/me")
async def read_users_me(current_user: User = Depends(get_current_user)):
    """Get current authenticated user information."""
    return {"id": current_user.id, "email": current_user.email}
