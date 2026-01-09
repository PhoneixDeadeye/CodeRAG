from fastapi.testclient import TestClient

def test_api_root(client: TestClient):
    response = client.get("/")
    assert response.status_code == 200
    assert response.json() == {"message": "Welcome to CodeRAG API", "status": "running"}
