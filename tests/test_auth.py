"""
Authentication Tests
Tests for user registration, login, and token validation.
"""

import pytest
from fastapi.testclient import TestClient


@pytest.mark.asyncio
async def test_register_new_user(client: TestClient):
    """Test successful user registration."""
    response = await client.post(
        "/api/v1/auth/register",
        json={"email": "newuser@example.com", "password": "securepassword123"},
    )
    assert response.status_code == 200
    data = response.json()
    assert "access_token" in data
    assert data["token_type"] == "bearer"


@pytest.mark.asyncio
async def test_register_duplicate_email(client: TestClient):
    """Test registration with existing email fails."""
    # First registration
    await client.post(
        "/api/v1/auth/register",
        json={"email": "duplicate@example.com", "password": "password123"},
    )

    # Duplicate registration should fail
    response = await client.post(
        "/api/v1/auth/register",
        json={"email": "duplicate@example.com", "password": "differentpassword"},
    )
    assert response.status_code == 400
    assert "already registered" in response.json()["detail"].lower()


@pytest.mark.asyncio
async def test_register_weak_password(client: TestClient):
    """Test registration with weak password fails."""
    response = await client.post(
        "/api/v1/auth/register",
        json={"email": "weakpass@example.com", "password": "12345"},  # Too short
    )
    assert response.status_code == 422  # Validation error


@pytest.mark.asyncio
async def test_register_invalid_email(client: TestClient):
    """Test registration with invalid email fails."""
    response = await client.post(
        "/api/v1/auth/register",
        json={"email": "notanemail", "password": "securepassword123"},
    )
    assert response.status_code == 422  # Validation error


@pytest.mark.asyncio
async def test_login_success(client: TestClient):
    """Test successful login."""
    # Register first
    await client.post(
        "/api/v1/auth/register",
        json={"email": "logintest@example.com", "password": "testpassword123"},
    )

    # Login
    response = await client.post(
        "/api/v1/auth/login",
        data={"username": "logintest@example.com", "password": "testpassword123"},
    )
    assert response.status_code == 200
    data = response.json()
    assert "access_token" in data
    assert data["token_type"] == "bearer"


@pytest.mark.asyncio
async def test_login_wrong_password(client: TestClient):
    """Test login with wrong password fails."""
    # Register first
    await client.post(
        "/api/v1/auth/register",
        json={"email": "wrongpass@example.com", "password": "correctpassword"},
    )

    # Login with wrong password
    response = await client.post(
        "/api/v1/auth/login",
        data={"username": "wrongpass@example.com", "password": "incorrectpassword"},
    )
    assert response.status_code == 401


@pytest.mark.asyncio
async def test_login_nonexistent_user(client: TestClient):
    """Test login with nonexistent user fails."""
    response = await client.post(
        "/api/v1/auth/login",
        data={"username": "doesnotexist@example.com", "password": "anypassword"},
    )
    assert response.status_code == 401


@pytest.mark.asyncio
async def test_get_current_user(client: TestClient):
    """Test getting current user info."""
    # The test fixture already mocks authentication
    response = await client.get("/api/v1/auth/me")
    assert response.status_code == 200
    data = response.json()
    assert "id" in data
    assert "email" in data


@pytest.mark.asyncio
async def test_refresh_token_rotation(client: TestClient):
    """Refresh endpoint rotates refresh token and returns a new one."""
    register_response = await client.post(
        "/api/v1/auth/register",
        json={"email": "refresh@example.com", "password": "securepassword123"},
    )
    assert register_response.status_code == 200
    first_refresh = register_response.json()["refresh_token"]

    refresh_response = await client.post(
        "/api/v1/auth/refresh", json={"refresh_token": first_refresh}
    )
    assert refresh_response.status_code == 200
    rotated_refresh = refresh_response.json()["refresh_token"]
    assert rotated_refresh != first_refresh


@pytest.mark.asyncio
async def test_refresh_token_reuse_is_blocked(client: TestClient):
    """Old refresh token should be rejected after rotation."""
    register_response = await client.post(
        "/api/v1/auth/register",
        json={"email": "reuse@example.com", "password": "securepassword123"},
    )
    assert register_response.status_code == 200
    old_refresh = register_response.json()["refresh_token"]

    first_refresh_response = await client.post(
        "/api/v1/auth/refresh", json={"refresh_token": old_refresh}
    )
    assert first_refresh_response.status_code == 200

    second_refresh_response = await client.post(
        "/api/v1/auth/refresh", json={"refresh_token": old_refresh}
    )
    assert second_refresh_response.status_code == 401


@pytest.mark.asyncio
async def test_logout_revokes_refresh_token(client: TestClient):
    """Logout endpoint revokes refresh token and prevents future refresh calls."""
    register_response = await client.post(
        "/api/v1/auth/register",
        json={"email": "logout@example.com", "password": "securepassword123"},
    )
    assert register_response.status_code == 200
    token_data = register_response.json()
    refresh_token = token_data["refresh_token"]

    logout_response = await client.post(
        "/api/v1/auth/logout",
        json={"refresh_token": refresh_token},
        headers={"Authorization": f"Bearer {token_data['access_token']}"},
    )
    assert logout_response.status_code == 200

    refresh_response = await client.post(
        "/api/v1/auth/refresh", json={"refresh_token": refresh_token}
    )
    assert refresh_response.status_code == 401
