"""
Repository and File Tests
Tests for repository ingestion, file access, and search.
"""

import pytest
from fastapi.testclient import TestClient


@pytest.mark.asyncio
async def test_list_repos_empty(client: TestClient):
    """Test listing repos when none exist."""
    response = await client.get("/api/v1/repos")
    assert response.status_code == 200
    data = response.json()
    assert "repos" in data


@pytest.mark.asyncio
async def test_ingest_invalid_url(client: TestClient):
    """Test ingestion with non-GitHub URL fails."""
    response = await client.post(
        "/api/v1/ingest", json={"repo_url": "https://gitlab.com/user/repo"}
    )
    assert response.status_code == 422  # Validation error - only GitHub allowed


@pytest.mark.asyncio
async def test_ingest_invalid_format(client: TestClient):
    """Test ingestion with invalid URL format fails."""
    response = await client.post("/api/v1/ingest", json={"repo_url": "not-a-url"})
    assert response.status_code == 422


@pytest.mark.asyncio
async def test_get_files_no_repo(client: TestClient):
    """Test getting file tree when no repo exists returns 404 for authenticated user."""
    response = await client.get("/api/v1/files")
    # Authenticated user with no repos → 404
    # Guest with no ready repo → 200 with empty tree
    assert response.status_code in [200, 404]


@pytest.mark.asyncio
async def test_get_file_content_no_repo(client: TestClient):
    """Test getting file content when no repo exists."""
    response = await client.get("/api/v1/file/test.py")
    assert response.status_code == 404


@pytest.mark.asyncio
async def test_search_empty_query(client: TestClient):
    """Test search with empty query fails."""
    response = await client.post("/api/v1/search", json={"query": ""})
    assert response.status_code == 422


@pytest.mark.asyncio
async def test_search_query_too_long(client: TestClient):
    """Test search with very long query fails."""
    long_query = "x" * 1001  # Over 1000 char limit
    response = await client.post("/api/v1/search", json={"query": long_query})
    assert response.status_code == 422


@pytest.mark.asyncio
async def test_search_invalid_regex(client: TestClient):
    """Test search with invalid regex returns error."""
    response = await client.post(
        "/api/v1/search", json={"query": "[invalid(regex", "is_regex": True}
    )
    # Should return 400 for invalid regex or empty results if no repo
    assert response.status_code in [200, 400]


@pytest.mark.asyncio
async def test_symbols_no_repo(client: TestClient):
    """Test getting symbols when no repo exists."""
    response = await client.get("/api/v1/symbols")
    # Should return empty or 404
    assert response.status_code in [200, 404]
    if response.status_code == 200:
        data = response.json()
        assert "files" in data
        assert "symbols" in data


@pytest.mark.asyncio
async def test_analyze_dependencies_no_repo(client: TestClient):
    """Test dependency analysis when no repo exists."""
    response = await client.post(
        "/api/v1/analyze-dependencies", json={"file_path": "test.py"}
    )
    assert response.status_code == 404


@pytest.mark.asyncio
async def test_diff_no_repo(client: TestClient):
    """Test diff when no repo exists."""
    response = await client.post(
        "/api/v1/diff", json={"file1": "a.py", "file2": "b.py", "repo_id": "fake-id"}
    )
    assert response.status_code == 404


@pytest.mark.asyncio
async def test_config_endpoint(client: TestClient):
    """Test getting app configuration."""
    response = await client.get("/api/v1/config")
    assert response.status_code == 200
    data = response.json()
    assert "current_repo" in data
    assert "is_guest" in data


@pytest.mark.asyncio
async def test_delete_nonexistent_repo(client: TestClient):
    """Test deleting non-existent repo returns 404."""
    response = await client.delete("/api/v1/repos/nonexistent-id")
    assert response.status_code == 404
