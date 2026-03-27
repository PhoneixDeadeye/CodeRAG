import pytest
from httpx import AsyncClient
from unittest.mock import patch, AsyncMock, MagicMock
from app.api.main import app


# --- Auth Tests ---
@pytest.mark.asyncio
async def test_root_endpoint(client: AsyncClient):
    response = await client.get("/health")
    assert response.status_code == 200
    data = response.json()
    assert data["status"] == "healthy"
    assert "version" in data
    assert "service" in data


@pytest.mark.asyncio
async def test_auth_flow(client: AsyncClient):
    """Test register → login → refresh flow using real in-memory DB."""
    # 1. Register
    response = await client.post(
        "/api/v1/auth/register",
        json={"email": "integration@example.com", "password": "securepassword123"},
    )
    assert response.status_code == 200
    data = response.json()
    assert "access_token" in data
    assert "refresh_token" in data
    refresh_token = data["refresh_token"]

    # 2. Login
    response = await client.post(
        "/api/v1/auth/login",
        data={"username": "integration@example.com", "password": "securepassword123"},
    )
    assert response.status_code == 200
    data = response.json()
    assert "access_token" in data
    assert "refresh_token" in data

    # 3. Refresh
    response = await client.post(
        "/api/v1/auth/refresh", json={"refresh_token": refresh_token}
    )
    assert response.status_code == 200
    new_data = response.json()
    assert "access_token" in new_data
    assert "refresh_token" in new_data


# --- Ingest Tests ---
@pytest.mark.asyncio
async def test_ingest_endpoint(client: AsyncClient):
    """Test ingest endpoint accepts a valid GitHub URL and starts background task."""
    # Mock the background ingestion to avoid actual git clone
    with patch("app.api.routers.repos._start_background_ingestion") as mock_ingest:
        response = await client.post(
            "/api/v1/ingest",
            json={
                "repo_url": "https://github.com/example/repo",
                "force_reindex": False,
            },
        )

        assert response.status_code == 200
        data = response.json()
        assert "repo_id" in data
        assert data["status"] == "success"
        # Verify background task was called
        mock_ingest.assert_called_once()


# --- Chat Tests ---
@pytest.mark.asyncio
async def test_chat_endpoint(client: AsyncClient):
    """Test chat endpoint with mocked RAG engine."""
    with patch("app.services.rag_engine.get_cached_qa_chain") as mock_get_chain:
        mock_chain = MagicMock()
        mock_chain.invoke.return_value = {
            "answer": "Test answer",
            "source_documents": [],
        }
        mock_chain.ainvoke = AsyncMock(
            return_value={"answer": "Test answer", "source_documents": []}
        )
        mock_chain.memory.chat_memory.add_user_message = MagicMock()
        mock_chain.memory.chat_memory.add_ai_message = MagicMock()
        mock_chain.memory.clear = MagicMock()
        mock_get_chain.return_value = mock_chain

        # First need to ingest a repo so chat has something to reference
        with patch("app.api.routers.repos._start_background_ingestion"):
            ingest_resp = await client.post(
                "/api/v1/ingest",
                json={
                    "repo_url": "https://github.com/example/repo",
                    "force_reindex": False,
                },
            )
            repo_id = ingest_resp.json()["repo_id"]

        # Manually mark the repo as ready
        from app.core.database import get_db, Repository

        async for db in app.dependency_overrides[get_db]():
            from sqlalchemy import select

            result = await db.execute(
                select(Repository).where(Repository.id == repo_id)
            )
            repo = result.scalar_one_or_none()
            if repo:
                repo.status = "ready"
                repo.vector_collection_name = repo_id
                await db.commit()

        response = await client.post(
            "/api/v1/chat", json={"query": "Hello", "repo_id": repo_id}
        )

        assert response.status_code == 200
        data = response.json()
        assert data["answer"] == "Test answer"
