"""
Auth Flow Integration Tests

Uses a dedicated client WITHOUT get_current_user override,
so we test real auth: register → login → protected → refresh.
"""

import pytest
import pytest_asyncio
from typing import AsyncGenerator
from httpx import AsyncClient, ASGITransport
from sqlalchemy.ext.asyncio import AsyncSession, create_async_engine, async_sessionmaker
from sqlalchemy.pool import StaticPool

from app.api.main import app
from app.core.database import get_db, Base


@pytest_asyncio.fixture(scope="function")
async def real_auth_client() -> AsyncGenerator[AsyncClient, None]:
    """Client with real auth — only overrides DB, not auth."""
    # Reset ALL rate limiters to prevent 429s from cross-test pollution
    from app.api.rate_limiter import login_limiter, chat_limiter, ingest_limiter

    login_limiter.requests.clear()
    chat_limiter.requests.clear()
    ingest_limiter.requests.clear()

    engine = create_async_engine(
        "sqlite+aiosqlite:///:memory:",
        connect_args={"check_same_thread": False},
        poolclass=StaticPool,
    )
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)

    session_factory = async_sessionmaker(
        engine, class_=AsyncSession, expire_on_commit=False
    )

    async def override_get_db():
        async with session_factory() as session:
            yield session

    app.dependency_overrides[get_db] = override_get_db

    async with AsyncClient(
        transport=ASGITransport(app=app), base_url="http://test"
    ) as ac:
        yield ac

    app.dependency_overrides.clear()
    await engine.dispose()


@pytest.mark.asyncio
class TestAuthFlow:
    """End-to-end auth flow with real authentication."""

    async def test_register_new_user(self, real_auth_client: AsyncClient):
        response = await real_auth_client.post(
            "/api/v1/auth/register",
            json={"email": "flow_test@example.com", "password": "testpassword123"},
        )
        assert response.status_code == 200
        data = response.json()
        assert "access_token" in data
        assert "refresh_token" in data
        assert data["token_type"] == "bearer"

    async def test_register_duplicate_email_fails(self, real_auth_client: AsyncClient):
        await real_auth_client.post(
            "/api/v1/auth/register",
            json={"email": "dupe@example.com", "password": "testpassword123"},
        )
        response = await real_auth_client.post(
            "/api/v1/auth/register",
            json={"email": "dupe@example.com", "password": "differentpw"},
        )
        assert response.status_code == 400

    async def test_login_with_valid_credentials(self, real_auth_client: AsyncClient):
        await real_auth_client.post(
            "/api/v1/auth/register",
            json={"email": "login_test@example.com", "password": "securepass123"},
        )
        response = await real_auth_client.post(
            "/api/v1/auth/login",
            data={"username": "login_test@example.com", "password": "securepass123"},
        )
        assert response.status_code == 200
        data = response.json()
        assert "access_token" in data

    async def test_login_with_wrong_password_fails(self, real_auth_client: AsyncClient):
        await real_auth_client.post(
            "/api/v1/auth/register",
            json={"email": "wrongpw@example.com", "password": "correctpass"},
        )
        response = await real_auth_client.post(
            "/api/v1/auth/login",
            data={"username": "wrongpw@example.com", "password": "wrongpass"},
        )
        assert response.status_code in (400, 401)

    async def test_protected_route_with_valid_token(
        self, real_auth_client: AsyncClient
    ):
        reg = await real_auth_client.post(
            "/api/v1/auth/register",
            json={"email": "protected@example.com", "password": "securepass123"},
        )
        token = reg.json()["access_token"]
        # /api/v1/sessions requires get_current_user (not optional)
        response = await real_auth_client.get(
            "/api/v1/sessions", headers={"Authorization": f"Bearer {token}"}
        )
        assert response.status_code == 200

    async def test_protected_route_without_token_fails(
        self, real_auth_client: AsyncClient
    ):
        # /api/v1/sessions requires auth — should fail without token
        response = await real_auth_client.get("/api/v1/sessions")
        assert response.status_code in (401, 403)

    async def test_refresh_token_flow(self, real_auth_client: AsyncClient):
        reg = await real_auth_client.post(
            "/api/v1/auth/register",
            json={"email": "refresh@example.com", "password": "securepass123"},
        )
        data = reg.json()
        refresh_token = data.get("refresh_token")
        if refresh_token:
            response = await real_auth_client.post(
                "/api/v1/auth/refresh", json={"refresh_token": refresh_token}
            )
            assert response.status_code == 200
            assert "access_token" in response.json()
