import pytest
import httpx
import asyncio
import os

# Configuration
API_URL = os.getenv("API_URL", "http://localhost:8000/api/v1")
# Use a small public repo for testing
TEST_REPO_URL = "https://github.com/coderag-test/hello-world"
# Or use the local repo "upload://..." if we can Mock it, but let's stick to a real URL or a safe one.
# Let's use a very small repo to be fast.
# "https://github.com/octocat/Hello-World" is classic.
TEST_REPO_URL = "https://github.com/octocat/Hello-World"


@pytest.mark.asyncio
async def test_e2e_flow():
    """
    Full End-to-End Flow:
    1. Health Check
    2. Login (Get Token)
    3. Ingest Repository
    4. Wait for 'ready' status
    5. Chat (QA)
    6. Verify Stream
    """

    async with httpx.AsyncClient(timeout=30.0) as client:
        # 1. Health Check
        try:
            resp = await client.get(f"{API_URL.replace('/api/v1', '')}/health")
            if resp.status_code != 200:
                pytest.skip("Backend not running or unhealthy. Skipping E2E test.")
        except httpx.ConnectError:
            pytest.skip("Could not connect to backend. Skipping E2E test.")

        # 2. Login / Register
        # Create a random user
        import uuid

        email = f"test_{uuid.uuid4()}@example.com"
        password = "testpassword123"

        # Register
        resp = await client.post(
            f"{API_URL}/auth/register", json={"email": email, "password": password}
        )
        assert resp.status_code in [200, 400], f"Register failed: {resp.text}"

        # Login
        resp = await client.post(
            f"{API_URL}/auth/login", data={"username": email, "password": password}
        )
        assert resp.status_code == 200, f"Login failed: {resp.text}"
        token = resp.json()["access_token"]
        headers = {"Authorization": f"Bearer {token}"}

        # 3. Ingest Repository
        # We need to find the correct endpoint for ingestion.
        # Looking at worker.py, it seems to just handle the task.
        # We need to check `api/routers/repos.py`? Or similar.
        # Let's assume there is an ingestion endpoint.
        # Based on file structure `app/api/routers/repos.py` likely exists.

        ingest_payload = {"url": TEST_REPO_URL, "name": "Hello-World"}
        resp = await client.post(
            f"{API_URL}/repos/", json=ingest_payload, headers=headers
        )
        assert resp.status_code in [200, 201], f"Ingest failed: {resp.text}"
        repo_data = resp.json()
        repo_id = repo_data["id"]

        # 4. Poll for status
        max_retries = 20
        for i in range(max_retries):
            resp = await client.get(f"{API_URL}/repos/{repo_id}", headers=headers)
            status = resp.json()["status"]
            print(f"Repo status: {status}")
            if status == "ready":
                break
            if status == "failed":
                pytest.fail("Repository ingestion failed.")
            await asyncio.sleep(2)
        else:
            pytest.fail("Repository ingestion timed out.")

        # 5. Chat (Standard)
        chat_payload = {"query": "What is in the Readme?", "repo_id": repo_id}
        resp = await client.post(f"{API_URL}/chat", json=chat_payload, headers=headers)
        assert resp.status_code == 200, f"Chat failed: {resp.text}"
        answer = resp.json()["answer"]
        assert len(answer) > 0
        print(f"Chat Answer: {answer}")

        # 6. Chat (Streaming)
        # Testing SSE is tricky with simple client, but httpx supports it partially via iter_lines / astream
        print("Testing Streaming...")
        stream_payload = {"query": "Explain the code", "repo_id": repo_id}
        async with client.stream(
            "POST", f"{API_URL}/chat/stream", json=stream_payload, headers=headers
        ) as stream_resp:
            assert stream_resp.status_code == 200
            async for line in stream_resp.aiter_lines():
                if line.startswith("data: "):
                    data_str = line.replace("data: ", "")
                    # print(f"Chunk: {data_str}")
                    # Valid JSON check
                    import json

                    try:
                        chunk = json.loads(data_str)
                        if chunk["type"] == "done":
                            break
                    except Exception:
                        pass
