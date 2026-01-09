"""
Repository and File Tests
Tests for repository ingestion, file access, and search.
"""
import pytest
from fastapi.testclient import TestClient


def test_list_repos_empty(client: TestClient):
    """Test listing repos when none exist."""
    response = client.get("/api/repos")
    assert response.status_code == 200
    data = response.json()
    assert "repos" in data


def test_ingest_invalid_url(client: TestClient):
    """Test ingestion with non-GitHub URL fails."""
    response = client.post(
        "/api/ingest",
        json={"repo_url": "https://gitlab.com/user/repo"}
    )
    assert response.status_code == 422  # Validation error - only GitHub allowed


def test_ingest_invalid_format(client: TestClient):
    """Test ingestion with invalid URL format fails."""
    response = client.post(
        "/api/ingest",
        json={"repo_url": "not-a-url"}
    )
    assert response.status_code == 422


def test_get_files_no_repo(client: TestClient):
    """Test getting file tree when no repo exists."""
    response = client.get("/api/files")
    assert response.status_code == 404


def test_get_file_content_no_repo(client: TestClient):
    """Test getting file content when no repo exists."""
    response = client.get("/api/file/test.py")
    assert response.status_code == 404


def test_search_empty_query(client: TestClient):
    """Test search with empty query fails."""
    response = client.post(
        "/api/search",
        json={"query": ""}
    )
    assert response.status_code == 422


def test_search_query_too_long(client: TestClient):
    """Test search with very long query fails."""
    long_query = "x" * 1001  # Over 1000 char limit
    response = client.post(
        "/api/search",
        json={"query": long_query}
    )
    assert response.status_code == 422


def test_search_invalid_regex(client: TestClient):
    """Test search with invalid regex returns error."""
    response = client.post(
        "/api/search",
        json={"query": "[invalid(regex", "is_regex": True}
    )
    # Should return 400 for invalid regex or empty results if no repo
    assert response.status_code in [200, 400]


def test_symbols_no_repo(client: TestClient):
    """Test getting symbols when no repo exists."""
    response = client.get("/api/symbols")
    # Should return empty or 404
    assert response.status_code in [200, 404]
    if response.status_code == 200:
        data = response.json()
        assert "files" in data
        assert "symbols" in data


def test_analyze_dependencies_no_repo(client: TestClient):
    """Test dependency analysis when no repo exists."""
    response = client.post(
        "/api/analyze-dependencies",
        json={"file_path": "test.py"}
    )
    assert response.status_code == 404


def test_diff_no_repo(client: TestClient):
    """Test diff when no repo exists."""
    response = client.post(
        "/api/diff",
        json={"file1": "a.py", "file2": "b.py", "repo_id": "fake-id"}
    )
    assert response.status_code == 404


def test_config_endpoint(client: TestClient):
    """Test getting app configuration."""
    response = client.get("/api/config")
    assert response.status_code == 200
    data = response.json()
    assert "use_local_llm" in data


def test_delete_nonexistent_repo(client: TestClient):
    """Test deleting non-existent repo returns 404."""
    response = client.delete("/api/repos/nonexistent-id")
    assert response.status_code == 404
