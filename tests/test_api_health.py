import pytest
from fastapi.testclient import TestClient


@pytest.mark.asyncio
async def test_api_root(client: TestClient):
    response = await client.get("/")
    assert response.status_code == 200
    assert response.json() == {"message": "Welcome to CodeRAG API", "status": "running"}


@pytest.mark.asyncio
async def test_ready_endpoint_returns_dependency_checks(client: TestClient):
    response = await client.get("/ready")
    assert response.status_code == 200

    data = response.json()
    assert "status" in data
    assert "checks" in data
    assert "database" in data["checks"]
    assert "redis" in data["checks"]
