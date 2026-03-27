import pytest
from app.api.rate_limiter import login_limiter


@pytest.mark.asyncio
async def test_login_rate_limit_integration(client):
    """
    Integration test for Login Rate Limiting.
    Simulates >10 login attempts from the same IP and expects a 429.
    """
    # 1. Reset limiter for this test's IP
    test_ip = "127.0.0.1"

    if test_ip in login_limiter.requests:
        del login_limiter.requests[test_ip]

    # 2. Hit the endpoint 10 times (Allowed)
    for i in range(10):
        response = await client.post(
            "/api/v1/auth/login",
            data={"username": "test@example.com", "password": "wrongpassword"},
            headers={"X-Forwarded-For": test_ip},
        )
        assert response.status_code != 429, f"Request {i + 1} failed with 429"

    # 3. Hit the endpoint 11th time (Blocked)
    response = await client.post(
        "/api/v1/auth/login",
        data={"username": "test@example.com", "password": "wrongpassword"},
        headers={"X-Forwarded-For": test_ip},
    )

    assert response.status_code == 429
    assert "Too many login attempts" in response.json()["detail"]
