from sqlalchemy import create_engine, Column, Integer, String, Boolean, ForeignKey, DateTime, Text
from sqlalchemy.orm import sessionmaker, declarative_base, relationship, Session
from datetime import datetime, timezone
from typing import Generator
import uuid
import os
import logging

logger = logging.getLogger(__name__)

SQL_ALCHEMY_DATABASE_URL = os.getenv("SQL_ALCHEMY_DATABASE_URL", "sqlite:///./coderag.db")

engine = create_engine(
    SQL_ALCHEMY_DATABASE_URL, 
    connect_args={"check_same_thread": False},
    # SQLite does not support server-side pooling efficiently. 
    # We use default pool (QueuePool) with 1 connection or StaticPool for strict serial access could be better
    # but concurrent access requires check_same_thread=False.
    # Removing incompatible pool arguments for file-based SQLite.
)
SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)

Base = declarative_base()

def generate_uuid():
    return str(uuid.uuid4())

class User(Base):
    __tablename__ = "users"

    id = Column(String, primary_key=True, default=generate_uuid)
    email = Column(String, unique=True, index=True, nullable=False)
    hashed_password = Column(String, nullable=False)
    is_active = Column(Boolean, default=True)
    created_at = Column(DateTime, default=lambda: datetime.now(timezone.utc))
    
    repositories = relationship("Repository", back_populates="owner")
    sessions = relationship("ChatSession", back_populates="user")
    usage_logs = relationship("UsageLog", back_populates="user")
    feedback = relationship("Feedback", back_populates="user")

class Repository(Base):
    __tablename__ = "repositories"

    id = Column(String, primary_key=True, default=generate_uuid)
    user_id = Column(String, ForeignKey("users.id"), index=True)
    name = Column(String)
    url = Column(String)
    local_path = Column(String) # Path to cloned repo
    vector_db_path = Column(String) # Path to FAISS index
    status = Column(String, default="pending", index=True) # pending, cloning, indexing, ready, failed
    created_at = Column(DateTime, default=lambda: datetime.now(timezone.utc), index=True)
    updated_at = Column(DateTime, default=lambda: datetime.now(timezone.utc), onupdate=lambda: datetime.now(timezone.utc), index=True)

    owner = relationship("User", back_populates="repositories")
    sessions = relationship("ChatSession", back_populates="repo")

class ChatSession(Base):
    __tablename__ = "chat_sessions"

    id = Column(String, primary_key=True, default=generate_uuid)
    user_id = Column(String, ForeignKey("users.id"), index=True)
    repo_id = Column(String, ForeignKey("repositories.id"), nullable=True, index=True)
    name = Column(String)
    created_at = Column(DateTime, default=lambda: datetime.now(timezone.utc))
    updated_at = Column(DateTime, default=lambda: datetime.now(timezone.utc))

    user = relationship("User", back_populates="sessions")
    repo = relationship("Repository", back_populates="sessions")
    messages = relationship("ChatMessage", back_populates="session", cascade="all, delete-orphan")

class ChatMessage(Base):
    __tablename__ = "chat_messages"

    id = Column(String, primary_key=True, default=generate_uuid)
    session_id = Column(String, ForeignKey("chat_sessions.id"), index=True)
    role = Column(String) # user, assistant
    content = Column(Text)
    created_at = Column(DateTime, default=lambda: datetime.now(timezone.utc), index=True)
    
    # Store sources as JSON string if needed, or separate table. 
    # For MVP, simpler to store in content or separate column if we want to structure it.
    # Let's keep it simple for now, maybe store metadata in a JSON column if we used Postgres, 
    # but for SQLite/SA generic, Text is fine.
    
    session = relationship("ChatSession", back_populates="messages")

class UsageLog(Base):
    __tablename__ = "usage_logs"
    
    id = Column(String, primary_key=True, default=generate_uuid)
    user_id = Column(String, ForeignKey("users.id"), index=True)
    event_type = Column(String) # chat, ingest
    details = Column(String)
    created_at = Column(DateTime, default=lambda: datetime.now(timezone.utc))
    
    user = relationship("User", back_populates="usage_logs")

class Feedback(Base):
    __tablename__ = "feedback"
    
    id = Column(String, primary_key=True, default=generate_uuid)
    user_id = Column(String, ForeignKey("users.id"), index=True)
    question = Column(Text)
    answer = Column(Text)
    rating = Column(Integer)
    comment = Column(Text, nullable=True)
    created_at = Column(DateTime, default=lambda: datetime.now(timezone.utc))
    
    user = relationship("User", back_populates="feedback")


def init_db() -> None:
    """Initialize database tables."""
    try:
        Base.metadata.create_all(bind=engine)
        logger.info("✅ Database initialized successfully")
    except Exception as e:
        logger.error(f"❌ Failed to initialize database: {e}")
        raise

def get_db() -> Generator[Session, None, None]:
    """Get database session with proper cleanup."""
    db = SessionLocal()
    try:
        yield db
    except Exception as e:
        logger.error(f"Database session error: {e}")
        db.rollback()
        raise
    finally:
        db.close()
def recover_stale_repos() -> None:
    """Reset repositories stuck in 'indexing' or 'cloning' states to 'failed' on startup."""
    db = SessionLocal()
    try:
        stale_repos = db.query(Repository).filter(
            Repository.status.in_(["indexing", "cloning", "re-indexing"])
        ).all()
        
        if stale_repos:
            logger.info(f"💾 Found {len(stale_repos)} stale repositories. Resetting to 'failed' for safety.")
            for repo in stale_repos:
                repo.status = "failed"
            db.commit()
    except Exception as e:
        logger.error(f"Error during repository recovery: {e}")
        db.rollback()
    finally:
        db.close()
