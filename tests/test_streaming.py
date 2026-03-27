"""
Streaming SSE Endpoint Tests

Uses the mocked conftest (always-authenticated user).
Tests SSE format, error handling, and event structure.
"""

import pytest
import json


@pytest.mark.asyncio
class TestStreamingSSE:
    """Tests for the streaming chat endpoint SSE format."""

    async def test_stream_returns_event_stream_content_type(self, client):
        """Response should have text/event-stream media type."""
        response = await client.post("/api/v1/chat/stream", json={"query": "hello"})
        assert response.status_code == 200
        assert "text/event-stream" in response.headers.get("content-type", "")

    async def test_stream_sse_lines_are_valid_json(self, client):
        """Each SSE data line should contain valid JSON with a 'type' field."""
        response = await client.post(
            "/api/v1/chat/stream", json={"query": "test query"}
        )
        body = response.text
        events = []
        for line in body.strip().split("\n"):
            line = line.strip()
            if not line or not line.startswith("data: "):
                continue
            payload = line[6:]
            parsed = json.loads(payload)
            assert "type" in parsed, f"SSE event missing 'type': {parsed}"
            events.append(parsed)

        # Should have at least one event
        assert len(events) > 0, "No SSE events received"

    async def test_stream_error_or_done_when_no_repo(self, client):
        """Without a repo, should get error or done event (not crash)."""
        response = await client.post("/api/v1/chat/stream", json={"query": "test"})
        assert response.status_code == 200
        body = response.text
        events = [
            json.loads(line[6:])
            for line in body.strip().split("\n")
            if line.strip().startswith("data: ")
        ]
        event_types = [e.get("type") for e in events]
        assert any(t in ("error", "done") for t in event_types), (
            f"Expected error/done event, got types: {event_types}"
        )
