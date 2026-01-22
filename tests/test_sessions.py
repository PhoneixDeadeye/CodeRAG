from fastapi.testclient import TestClient

def test_create_session(client: TestClient):
    response = client.post(
        "/api/v1/sessions",
        json={"name": "Test Session"}
    )
    assert response.status_code == 200
    data = response.json()
    assert "session_id" in data
    
    session_id = data["session_id"]
    
    # Verify session list
    list_response = client.get("/api/v1/sessions")
    assert list_response.status_code == 200
    sessions = list_response.json()["sessions"]
    assert len(sessions) > 0
    assert sessions[0]["id"] == session_id
    assert sessions[0]["name"] == "Test Session"

