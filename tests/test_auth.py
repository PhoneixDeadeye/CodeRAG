"""
Authentication Tests
Tests for user registration, login, and token validation.
"""
import pytest
from fastapi.testclient import TestClient


def test_register_new_user(client: TestClient):
    """Test successful user registration."""
    response = client.post(
        "/api/v1/auth/register",
        json={"email": "newuser@example.com", "password": "securepassword123"}
    )
    assert response.status_code == 200
    data = response.json()
    assert "access_token" in data
    assert data["token_type"] == "bearer"


def test_register_duplicate_email(client: TestClient):
    """Test registration with existing email fails."""
    # First registration
    client.post(
        "/api/v1/auth/register",
        json={"email": "duplicate@example.com", "password": "password123"}
    )
    
    # Duplicate registration should fail
    response = client.post(
        "/api/v1/auth/register",
        json={"email": "duplicate@example.com", "password": "differentpassword"}
    )
    assert response.status_code == 400
    assert "already registered" in response.json()["detail"].lower()


def test_register_weak_password(client: TestClient):
    """Test registration with weak password fails."""
    response = client.post(
        "/api/v1/auth/register",
        json={"email": "weakpass@example.com", "password": "12345"}  # Too short
    )
    assert response.status_code == 422  # Validation error


def test_register_invalid_email(client: TestClient):
    """Test registration with invalid email fails."""
    response = client.post(
        "/api/v1/auth/register",
        json={"email": "notanemail", "password": "securepassword123"}
    )
    assert response.status_code == 422  # Validation error


def test_login_success(client: TestClient):
    """Test successful login."""
    # Register first
    client.post(
        "/api/v1/auth/register",
        json={"email": "logintest@example.com", "password": "testpassword123"}
    )
    
    # Login
    response = client.post(
        "/api/v1/auth/login",
        data={"username": "logintest@example.com", "password": "testpassword123"}
    )
    assert response.status_code == 200
    data = response.json()
    assert "access_token" in data
    assert data["token_type"] == "bearer"


def test_login_wrong_password(client: TestClient):
    """Test login with wrong password fails."""
    # Register first
    client.post(
        "/api/v1/auth/register",
        json={"email": "wrongpass@example.com", "password": "correctpassword"}
    )
    
    # Login with wrong password
    response = client.post(
        "/api/v1/auth/login",
        data={"username": "wrongpass@example.com", "password": "incorrectpassword"}
    )
    assert response.status_code == 401


def test_login_nonexistent_user(client: TestClient):
    """Test login with nonexistent user fails."""
    response = client.post(
        "/api/v1/auth/login",
        data={"username": "doesnotexist@example.com", "password": "anypassword"}
    )
    assert response.status_code == 401


def test_get_current_user(client: TestClient):
    """Test getting current user info."""
    # The test fixture already mocks authentication
    response = client.get("/api/v1/auth/me")
    assert response.status_code == 200
    data = response.json()
    assert "id" in data
    assert "email" in data
