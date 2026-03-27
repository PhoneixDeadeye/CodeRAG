import pytest
import pytest_asyncio
import json
from unittest.mock import MagicMock, patch, AsyncMock
from httpx import AsyncClient, ASGITransport
from sqlalchemy.ext.asyncio import AsyncSession, create_async_engine, async_sessionmaker
from sqlalchemy.pool import StaticPool

from app.api.main import app
from app.core.database import get_db, Base, User, Repository

# --- Setup for this specific test ---
# We need a client that uses a real DB but mocks the RAG engine.


@pytest_asyncio.fixture(scope="function")
async def mock_streaming_client() -> AsyncClient:
    # 1. Setup In-Memory DB
    engine = create_async_engine(
        "sqlite+aiosqlite:///:memory:",
        connect_args={"check_same_thread": False},
        poolclass=StaticPool,
    )
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)

    session_factory = async_sessionmaker(
        engine, class_=AsyncSession, expire_on_commit=False
    )

    async def override_get_db():
        async with session_factory() as session:
            yield session

    # 2. Setup Auth Override (Authenticated User)
    async def override_get_current_user():
        return User(
            id="test-user-id",
            email="test@example.com",
            is_active=True,
            hashed_password="pw",
        )

    app.dependency_overrides[get_db] = override_get_db
    from app.services.auth import get_current_user

    app.dependency_overrides[get_current_user] = override_get_current_user

    # 3. Seed DB with a "Ready" Repository
    async with session_factory() as session:
        user = User(
            id="test-user-id",
            email="test@example.com",
            is_active=True,
            hashed_password="pw",
        )
        session.add(user)
        repo = Repository(
            id="test-repo-id",
            user_id="test-user-id",
            name="Test Repo",
            url="http://github.com/test/repo",
            status="ready",
            vector_collection_name="test_collection",
        )
        session.add(repo)
        await session.commit()

    async with AsyncClient(
        transport=ASGITransport(app=app), base_url="http://test"
    ) as ac:
        yield ac

    app.dependency_overrides.clear()
    await engine.dispose()


@pytest.mark.asyncio
async def test_streaming_happy_path(mock_streaming_client):
    """
    Verify:
    1. ChatSession is created.
    2. User message is saved.
    3. RAG engine is called.
    4. SSE events are streamed (session_id -> answer chunks -> done).
    """

    # Mock the RAG engine functions
    # 1. get_cached_qa_chain -> Return a dummy object
    # 2. astream_chain_with_retry -> Yield tokens

    mock_chain = MagicMock()
    # Mock memory to avoid attribute errors if accessed
    mock_chain.memory = MagicMock()
    mock_chain.memory.chat_memory = MagicMock()

    # Mock Document class
    class MockDocument:
        def __init__(self, page_content, metadata):
            self.page_content = page_content
            self.metadata = metadata

    # Generator for streaming response
    async def mock_stream_generator(chain, inputs):
        yield {"answer": "Hello"}
        yield {"answer": " World"}
        yield {"source_documents": [MockDocument("Source", {"source": "f.txt"})]}

    mock_db = AsyncMock()
    mock_result = MagicMock()
    mock_result.scalars.return_value.first.return_value = None
    mock_db.execute.return_value = mock_result
    mock_session_local = MagicMock()
    mock_session_local.return_value.__aenter__.return_value = mock_db

    with (
        patch("app.api.routers.streaming.AsyncSessionLocal", new=mock_session_local),
        patch("app.services.rag_engine.get_cached_qa_chain", return_value=mock_chain),
        patch(
            "app.services.rag_engine.astream_chain_with_retry",
            side_effect=mock_stream_generator,
        ),
    ):
        # Make the request
        response = await mock_streaming_client.post(
            "/api/v1/chat/stream", json={"query": "Hello AI", "repo_id": "test-repo-id"}
        )

        assert response.status_code == 200
        assert "text/event-stream" in response.headers["content-type"]

        # Parse SSE events
        events = []
        async for line in response.aiter_lines():
            if line.startswith("data: "):
                data = json.loads(line[6:])
                events.append(data)

        # Assertions
        # 1. Check Event Types
        event_types = [e["type"] for e in events]
        assert "session_id" in event_types
        assert "token" in event_types
        assert "sources" in event_types
        assert "done" in event_types

        # 2. Check Content
        tokens = [e["content"] for e in events if e["type"] == "token"]
        full_answer = "".join(tokens)
        assert full_answer == "Hello World"

        # 3. Check Persistence
        session_id_event = next(e for e in events if e["type"] == "session_id")
        session_id = session_id_event["content"]
        assert session_id is not None
