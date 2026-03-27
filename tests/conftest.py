import pytest
import pytest_asyncio
import asyncio
from typing import Generator, AsyncGenerator
from httpx import AsyncClient, ASGITransport
from sqlalchemy.ext.asyncio import AsyncSession, create_async_engine, async_sessionmaker
from sqlalchemy.pool import StaticPool

from app.api.main import app
from app.core.database import get_db, Base
from app.api.rate_limiter import login_limiter, chat_limiter, ingest_limiter


# --- Pytest Asyncio Configuration ---
@pytest.fixture(scope="session")
def event_loop() -> Generator:
    """Create an instance of the default event loop for each test session."""
    try:
        loop = asyncio.get_running_loop()
    except RuntimeError:
        loop = asyncio.new_event_loop()
    yield loop
    loop.close()


@pytest_asyncio.fixture(autouse=True)
async def clear_rate_limiters():
    """Clear all rate limiters before each test to prevent 429 errors across tests."""
    login_limiter.requests.clear()
    chat_limiter.requests.clear()
    ingest_limiter.requests.clear()


# --- Async Database Fixture (In-Memory SQLite) ---
@pytest_asyncio.fixture(scope="function")
async def db_session() -> AsyncGenerator[AsyncSession, None]:
    """
    Creates a fresh in-memory SQLite database for each test function.
    """
    # Use generic SQLite with aiosqlite driver
    # StaticPool is important for in-memory SQLite with async to keep connection open
    engine = create_async_engine(
        "sqlite+aiosqlite:///:memory:",
        connect_args={"check_same_thread": False},
        poolclass=StaticPool,
    )

    # Create tables
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)

    # Create session
    async_session = async_sessionmaker(
        engine, class_=AsyncSession, expire_on_commit=False, autoflush=False
    )

    async with async_session() as session:
        yield session
        await session.rollback()

    await engine.dispose()


# --- Dependency Override and Client ---
@pytest_asyncio.fixture(scope="function")
async def client(db_session) -> AsyncGenerator[AsyncClient, None]:
    """
    Test client with real in-memory database dependency.
    """

    # Override get_db to return our in-memory session
    async def override_get_db():
        yield db_session

    # Override auth to always return a test user
    from app.services.auth import get_current_user
    from app.core.database import User

    async def override_get_current_user():
        return User(
            id="test-user-id",
            email="test@example.com",
            is_active=True,
            hashed_password="hashed_secret",  # Needed if accessed
        )

    app.dependency_overrides[get_db] = override_get_db
    app.dependency_overrides[get_current_user] = override_get_current_user

    async with AsyncClient(
        transport=ASGITransport(app=app), base_url="http://test"
    ) as ac:
        yield ac

    app.dependency_overrides.clear()
