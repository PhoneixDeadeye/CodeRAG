"""
Chat Tests
Tests for chat functionality and session management.
"""
import pytest
from fastapi.testclient import TestClient


def test_chat_requires_repo(client: TestClient):
    """Test that chat without repo gives appropriate error."""
    response = client.post(
        "/api/v1/chat",
        json={"query": "What does this code do?"}
    )
    # Should return error since no repo is ingested in test
    assert response.status_code in [400, 404, 500]


def test_chat_empty_query(client: TestClient):
    """Test that empty query is rejected."""
    response = client.post(
        "/api/v1/chat",
        json={"query": ""}
    )
    assert response.status_code == 422  # Validation error


def test_chat_query_too_long(client: TestClient):
    """Test that very long query is rejected."""
    long_query = "x" * 6000  # Over 5000 char limit
    response = client.post(
        "/api/v1/chat",
        json={"query": long_query}
    )
    assert response.status_code == 422  # Validation error


def test_feedback_submission(client: TestClient):
    """Test submitting feedback."""
    response = client.post(
        "/api/v1/feedback",
        json={
            "question": "How do I use this function?",
            "answer": "Here is how you use it...",
            "rating": 5,
            "comment": "Very helpful!"
        }
    )
    assert response.status_code == 200
    assert response.json()["status"] == "success"


def test_feedback_without_comment(client: TestClient):
    """Test feedback can be submitted without comment."""
    response = client.post(
        "/api/v1/feedback",
        json={
            "question": "Test question",
            "answer": "Test answer",
            "rating": 3
        }
    )
    assert response.status_code == 200


def test_session_lifecycle(client: TestClient):
    """Test full session lifecycle: create, get, delete."""
    # Create
    create_resp = client.post(
        "/api/v1/sessions",
        json={"name": "Lifecycle Test Session"}
    )
    assert create_resp.status_code == 200
    session_id = create_resp.json()["session_id"]
    
    # Get
    get_resp = client.get(f"/api/v1/sessions/{session_id}")
    assert get_resp.status_code == 200
    
    # Delete
    delete_resp = client.delete(f"/api/v1/sessions/{session_id}")
    assert delete_resp.status_code == 200
    
    # Verify deleted
    verify_resp = client.get(f"/api/v1/sessions/{session_id}")
    assert verify_resp.status_code == 404


def test_add_message_to_session(client: TestClient):
    """Test adding messages to a session."""
    # Create session
    create_resp = client.post(
        "/api/v1/sessions",
        json={"name": "Message Test Session"}
    )
    session_id = create_resp.json()["session_id"]
    
    # Add user message
    user_msg = client.post(
        f"/api/v1/sessions/{session_id}/messages",
        json={"role": "user", "content": "Hello AI!"}
    )
    assert user_msg.status_code == 200
    
    # Add assistant message
    ai_msg = client.post(
        f"/api/v1/sessions/{session_id}/messages",
        json={"role": "assistant", "content": "Hello! How can I help?"}
    )
    assert ai_msg.status_code == 200
    
    # Verify messages
    session = client.get(f"/api/v1/sessions/{session_id}")
    messages = session.json()["messages"]
    assert len(messages) == 2


def test_invalid_message_role(client: TestClient):
    """Test that invalid message role is rejected."""
    # Create session
    create_resp = client.post(
        "/api/v1/sessions",
        json={"name": "Invalid Role Test"}
    )
    session_id = create_resp.json()["session_id"]
    
    # Try invalid role
    response = client.post(
        f"/api/v1/sessions/{session_id}/messages",
        json={"role": "bot", "content": "Invalid role"}  # Should be user or assistant
    )
    assert response.status_code == 422


def test_export_session_json(client: TestClient):
    """Test exporting session as JSON."""
    # Create session with messages
    create_resp = client.post(
        "/api/v1/sessions",
        json={"name": "Export Test"}
    )
    session_id = create_resp.json()["session_id"]
    
    client.post(
        f"/api/v1/sessions/{session_id}/messages",
        json={"role": "user", "content": "Test message"}
    )
    
    # Export
    export_resp = client.get(f"/api/v1/sessions/{session_id}/export?format=json")
    assert export_resp.status_code == 200


def test_export_session_markdown(client: TestClient):
    """Test exporting session as Markdown."""
    # Create session
    create_resp = client.post(
        "/api/v1/sessions",
        json={"name": "MD Export Test"}
    )
    session_id = create_resp.json()["session_id"]
    
    # Export
    export_resp = client.get(f"/api/v1/sessions/{session_id}/export?format=markdown")
    assert export_resp.status_code == 200
