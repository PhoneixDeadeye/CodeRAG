from sqlalchemy import (
    Column,
    Integer,
    String,
    Boolean,
    ForeignKey,
    DateTime,
    Text,
    MetaData,
    Float,
    JSON,
)
from sqlalchemy.orm import declarative_base, relationship
from sqlalchemy.ext.asyncio import (
    create_async_engine,
    AsyncSession,
    async_sessionmaker,
    AsyncAttrs,
)
from datetime import datetime, timezone
from typing import AsyncGenerator
import uuid
import os
import logging

logger = logging.getLogger(__name__)

# Default to Postgres, but allow override
SQL_ALCHEMY_DATABASE_URL = os.getenv(
    "SQL_ALCHEMY_DATABASE_URL",
    "postgresql+asyncpg://coderag:coderag@localhost:5432/coderag",
)

# Verify we are using an async driver
if (
    "postgresql" in SQL_ALCHEMY_DATABASE_URL
    and "+asyncpg" not in SQL_ALCHEMY_DATABASE_URL
):
    SQL_ALCHEMY_DATABASE_URL = SQL_ALCHEMY_DATABASE_URL.replace(
        "postgresql://", "postgresql+asyncpg://"
    )

# Engine kwargs differ between SQLite and PostgreSQL
_is_sqlite = "sqlite" in SQL_ALCHEMY_DATABASE_URL
if _is_sqlite:
    # SQLite doesn't support connection pooling — use StaticPool for async compatibility
    from sqlalchemy.pool import StaticPool

    _engine_kwargs = {
        "echo": False,
        "connect_args": {"check_same_thread": False},
        "poolclass": StaticPool,
    }
else:
    _engine_kwargs = {
        "echo": False,
        "pool_pre_ping": True,
        "pool_size": 50,
        "max_overflow": 20,
        "pool_timeout": 30,
    }

# Asynchronous Engine
async_engine = create_async_engine(SQL_ALCHEMY_DATABASE_URL, **_engine_kwargs)

AsyncSessionLocal = async_sessionmaker(
    async_engine, class_=AsyncSession, expire_on_commit=False
)


# Naming convention for Alembic constraints
convention = {
    "ix": "ix_%(column_0_label)s",
    "uq": "uq_%(table_name)s_%(column_0_name)s",
    "ck": "ck_%(table_name)s_%(constraint_name)s",
    "fk": "fk_%(table_name)s_%(column_0_name)s_%(referred_table_name)s",
    "pk": "pk_%(table_name)s",
}
metadata = MetaData(naming_convention=convention)
Base = declarative_base(cls=AsyncAttrs, metadata=metadata)


def generate_uuid():
    return str(uuid.uuid4())


class Organization(Base):
    __tablename__ = "organizations"

    id = Column(String, primary_key=True, default=generate_uuid)
    name = Column(String, nullable=False)
    subscription_id = Column(String, ForeignKey("subscriptions.id"), nullable=True)
    settings_json = Column(JSON, nullable=True, default=dict)
    created_at = Column(DateTime, default=lambda: datetime.now(timezone.utc))

    users = relationship("User", back_populates="organization")
    repositories = relationship("Repository", back_populates="organization")
    sessions = relationship("ChatSession", back_populates="organization")
    usage_logs = relationship("UsageLog", back_populates="organization")
    feedback = relationship("Feedback", back_populates="organization")
    api_keys = relationship("APIKey", back_populates="organization")
    usage_metrics = relationship("UsageMetric", back_populates="organization")
    invoices = relationship("Invoice", back_populates="organization")


class User(Base):
    __tablename__ = "users"

    id = Column(String, primary_key=True, default=generate_uuid)
    organization_id = Column(String, ForeignKey("organizations.id"), index=True, nullable=True)
    email = Column(String, unique=True, index=True, nullable=False)
    hashed_password = Column(String, nullable=False)
    is_active = Column(Boolean, default=True)
    organization_role = Column(String, default="member")  # owner, admin, member, viewer
    role = Column(String, default="User")  # Admin, User, Guest
    github_id = Column(String, unique=True, nullable=True, index=True)
    avatar_url = Column(String, nullable=True)
    preferred_llm_provider = Column(String, default="gemini")  # gemini, openai, anthropic
    created_at = Column(DateTime, default=lambda: datetime.now(timezone.utc))

    organization = relationship("Organization", back_populates="users")
    repositories = relationship("Repository", back_populates="owner")
    sessions = relationship("ChatSession", back_populates="user")
    usage_logs = relationship("UsageLog", back_populates="user")
    feedback = relationship("Feedback", back_populates="user")
    api_keys = relationship("APIKey", back_populates="user")
    github_tokens = relationship("GitHubToken", back_populates="user")
    refresh_tokens = relationship(
        "RefreshToken", back_populates="user", cascade="all, delete-orphan"
    )


class RefreshToken(Base):
    __tablename__ = "refresh_tokens"

    id = Column(String, primary_key=True, default=generate_uuid)
    user_id = Column(String, ForeignKey("users.id"), nullable=False, index=True)
    token_hash = Column(String, nullable=False, unique=True, index=True)
    jti = Column(String, nullable=False, unique=True, index=True)
    issued_at = Column(DateTime, default=lambda: datetime.now(timezone.utc), nullable=False)
    expires_at = Column(DateTime, nullable=False, index=True)
    revoked_at = Column(DateTime, nullable=True, index=True)
    replaced_by_jti = Column(String, nullable=True)
    user_agent = Column(String, nullable=True)
    ip_address = Column(String, nullable=True)

    user = relationship("User", back_populates="refresh_tokens")


class Repository(Base):
    __tablename__ = "repositories"

    id = Column(String, primary_key=True, default=generate_uuid)
    organization_id = Column(String, ForeignKey("organizations.id"), index=True, nullable=True)
    user_id = Column(String, ForeignKey("users.id"), index=True)
    name = Column(String)
    url = Column(String)
    local_path = Column(String)  # Path to cloned repo
    vector_collection_name = Column(
        String
    )  # Qdrant collection name (formerly vector_db_path)
    is_private = Column(Boolean, default=False)
    github_token_id = Column(String, ForeignKey("github_tokens.id"), nullable=True)
    status = Column(
        String, default="pending", index=True
    )  # pending, cloning, indexing, ready, failed
    created_at = Column(
        DateTime, default=lambda: datetime.now(timezone.utc), index=True
    )
    updated_at = Column(
        DateTime,
        default=lambda: datetime.now(timezone.utc),
        onupdate=lambda: datetime.now(timezone.utc),
        index=True,
    )

    organization = relationship("Organization", back_populates="repositories")
    owner = relationship("User", back_populates="repositories")
    sessions = relationship("ChatSession", back_populates="repo")
    github_token = relationship("GitHubToken", back_populates="repositories")


class ChatSession(Base):
    __tablename__ = "chat_sessions"

    id = Column(String, primary_key=True, default=generate_uuid)
    organization_id = Column(String, ForeignKey("organizations.id"), index=True, nullable=True)
    user_id = Column(String, ForeignKey("users.id"), index=True)
    repo_id = Column(String, ForeignKey("repositories.id"), nullable=True, index=True)
    name = Column(String)
    created_at = Column(DateTime, default=lambda: datetime.now(timezone.utc))
    updated_at = Column(DateTime, default=lambda: datetime.now(timezone.utc), onupdate=lambda: datetime.now(timezone.utc))

    organization = relationship("Organization", back_populates="sessions")
    user = relationship("User", back_populates="sessions")
    repo = relationship("Repository", back_populates="sessions")
    messages = relationship(
        "ChatMessage", back_populates="session", cascade="all, delete-orphan"
    )


class ChatMessage(Base):
    __tablename__ = "chat_messages"

    id = Column(String, primary_key=True, default=generate_uuid)
    session_id = Column(String, ForeignKey("chat_sessions.id"), index=True)
    role = Column(String)  # user, assistant
    content = Column(Text)
    sources = Column(JSON, nullable=True)
    created_at = Column(
        DateTime, default=lambda: datetime.now(timezone.utc), index=True
    )

    session = relationship("ChatSession", back_populates="messages")


class UsageLog(Base):
    __tablename__ = "usage_logs"

    id = Column(String, primary_key=True, default=generate_uuid)
    organization_id = Column(String, ForeignKey("organizations.id"), index=True, nullable=True)
    user_id = Column(String, ForeignKey("users.id"), index=True)
    event_type = Column(String)  # chat, ingest
    details = Column(String)
    created_at = Column(DateTime, default=lambda: datetime.now(timezone.utc))

    organization = relationship("Organization", back_populates="usage_logs")
    user = relationship("User", back_populates="usage_logs")


class Feedback(Base):
    __tablename__ = "feedback"

    id = Column(String, primary_key=True, default=generate_uuid)
    organization_id = Column(String, ForeignKey("organizations.id"), index=True, nullable=True)
    user_id = Column(String, ForeignKey("users.id"), index=True)
    question = Column(Text)
    answer = Column(Text)
    rating = Column(Integer)
    comment = Column(Text, nullable=True)
    created_at = Column(DateTime, default=lambda: datetime.now(timezone.utc))

    organization = relationship("Organization", back_populates="feedback")
    user = relationship("User", back_populates="feedback")


class APIKey(Base):
    __tablename__ = "api_keys"

    id = Column(String, primary_key=True, default=generate_uuid)
    key = Column(String, unique=True, index=True, nullable=False)
    organization_id = Column(String, ForeignKey("organizations.id"), index=True, nullable=True)
    user_id = Column(String, ForeignKey("users.id"), index=True)
    name = Column(String)
    is_revoked = Column(Boolean, default=False)
    created_at = Column(DateTime, default=lambda: datetime.now(timezone.utc))
    expires_at = Column(DateTime, nullable=True)

    organization = relationship("Organization", back_populates="api_keys")
    user = relationship("User", back_populates="api_keys")


# ──────────────────────────────────────────────────────────────
# NEW v5.0 MODELS — Billing, Usage, GitHub OAuth
# ──────────────────────────────────────────────────────────────


class SubscriptionPlan(Base):
    __tablename__ = "subscription_plans"

    id = Column(String, primary_key=True, default=generate_uuid)
    name = Column(String, nullable=False, unique=True)  # Free, Pro, Enterprise
    tier = Column(String, nullable=False, index=True)  # free, pro, enterprise
    max_repos = Column(Integer, default=3)
    max_queries_per_day = Column(Integer, default=50)
    max_storage_mb = Column(Integer, default=500)
    price_cents = Column(Integer, default=0)  # 0 = free
    is_active = Column(Boolean, default=True)
    features_json = Column(JSON, nullable=True, default=dict)
    created_at = Column(DateTime, default=lambda: datetime.now(timezone.utc))

    subscriptions = relationship("Subscription", back_populates="plan")


class Subscription(Base):
    __tablename__ = "subscriptions"

    id = Column(String, primary_key=True, default=generate_uuid)
    organization_id = Column(String, ForeignKey("organizations.id"), index=True, nullable=True)
    plan_id = Column(String, ForeignKey("subscription_plans.id"), index=True)
    status = Column(String, default="active", index=True)  # active, canceled, past_due, trialing
    stripe_subscription_id = Column(String, unique=True, nullable=True)
    current_period_start = Column(DateTime, nullable=True)
    current_period_end = Column(DateTime, nullable=True)
    created_at = Column(DateTime, default=lambda: datetime.now(timezone.utc))
    updated_at = Column(DateTime, default=lambda: datetime.now(timezone.utc), onupdate=lambda: datetime.now(timezone.utc))

    plan = relationship("SubscriptionPlan", back_populates="subscriptions")
    invoices = relationship("Invoice", back_populates="subscription")


class UsageMetric(Base):
    __tablename__ = "usage_metrics"

    id = Column(String, primary_key=True, default=generate_uuid)
    organization_id = Column(String, ForeignKey("organizations.id"), index=True, nullable=True)
    metric_type = Column(String, nullable=False, index=True)  # query, ingest, storage, token
    value = Column(Float, nullable=False, default=0)
    metadata_json = Column(JSON, nullable=True)
    recorded_at = Column(DateTime, default=lambda: datetime.now(timezone.utc), index=True)

    organization = relationship("Organization", back_populates="usage_metrics")


class Invoice(Base):
    __tablename__ = "invoices"

    id = Column(String, primary_key=True, default=generate_uuid)
    organization_id = Column(String, ForeignKey("organizations.id"), index=True, nullable=True)
    subscription_id = Column(String, ForeignKey("subscriptions.id"), index=True)
    amount_cents = Column(Integer, nullable=False, default=0)
    status = Column(String, default="draft", index=True)  # draft, open, paid, void, uncollectable
    stripe_invoice_id = Column(String, unique=True, nullable=True)
    period_start = Column(DateTime, nullable=True)
    period_end = Column(DateTime, nullable=True)
    created_at = Column(DateTime, default=lambda: datetime.now(timezone.utc))

    organization = relationship("Organization", back_populates="invoices")
    subscription = relationship("Subscription", back_populates="invoices")


class GitHubToken(Base):
    __tablename__ = "github_tokens"

    id = Column(String, primary_key=True, default=generate_uuid)
    user_id = Column(String, ForeignKey("users.id"), index=True)
    encrypted_access_token = Column(Text, nullable=False)
    refresh_token = Column(Text, nullable=True)
    github_username = Column(String, nullable=True)
    scopes = Column(String, nullable=True)  # comma-separated scopes
    expires_at = Column(DateTime, nullable=True)
    created_at = Column(DateTime, default=lambda: datetime.now(timezone.utc))

    user = relationship("User", back_populates="github_tokens")
    repositories = relationship("Repository", back_populates="github_token")


async def init_db():
    """Initialize database tables."""
    async with async_engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)
    logger.info("Database tables initialized.")


async def get_db() -> AsyncGenerator[AsyncSession, None]:
    """Get async database session."""
    async with AsyncSessionLocal() as session:
        try:
            yield session
        finally:
            await session.close()


async def recover_stale_repos_async():
    """Reset stale repo statuses."""
    async with AsyncSessionLocal() as session:
        try:
            # Update 'cloning' or 'indexing' -> 'failed'
            # We need to construct an update statement
            from sqlalchemy import update

            stmt = (
                update(Repository)
                .where(Repository.status.in_(["cloning", "indexing"]))
                .values(status="failed")
            )
            await session.execute(stmt)
            await session.commit()
            logger.info("Recovered stale repositories.")
        except Exception as e:
            logger.error(f"Error recovering stale repos: {e}")
