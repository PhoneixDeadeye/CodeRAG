import pytest
import pytest_asyncio
import asyncio
from typing import AsyncGenerator
from httpx import AsyncClient, ASGITransport
from sqlalchemy.ext.asyncio import AsyncSession, create_async_engine
from sqlalchemy.orm import sessionmaker
from unittest.mock import MagicMock, AsyncMock, patch

from app.api.main import app
from app.core.database import get_db, Base

# Use in-memory SQLite for speed and isolation
TEST_DATABASE_URL = "sqlite+aiosqlite:///:memory:"


@pytest.fixture(scope="session")
def event_loop():
    """Create an instance of the default event loop for each test session."""
    loop = asyncio.new_event_loop()
    yield loop
    loop.close()


# --- Real In-Memory Database Fixture ---
@pytest_asyncio.fixture
async def db_engine():
    from sqlalchemy.pool import StaticPool

    engine = create_async_engine(
        TEST_DATABASE_URL,
        echo=False,
        poolclass=StaticPool,
        connect_args={"check_same_thread": False},
    )
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)
    yield engine
    await engine.dispose()


@pytest_asyncio.fixture
async def db(db_engine) -> AsyncGenerator[AsyncSession, None]:
    async_session = sessionmaker(db_engine, class_=AsyncSession, expire_on_commit=False)
    async with async_session() as session:
        yield session


@pytest_asyncio.fixture
async def client(db) -> AsyncGenerator[AsyncClient, None]:
    async def override_get_db():
        yield db

    app.dependency_overrides[get_db] = override_get_db

    # Configure app settings for test environment if needed

    async with AsyncClient(
        transport=ASGITransport(app=app), base_url="http://test"
    ) as ac:
        yield ac

    app.dependency_overrides.clear()


# --- Mock Qdrant & LLM ---
@pytest.fixture(autouse=True)
def mock_external_services():
    """
    Automatically mock external calls (Qdrant, Google AI) for all integration tests.
    We want to test logic flow, not external APIs.
    """
    with (
        patch("app.services.rag_engine.get_embeddings") as mock_embed,
        patch("app.services.rag_engine.get_llm") as mock_llm,
        patch("app.services.rag_engine.QdrantVectorStore"),
        patch("app.services.rag_engine.get_qdrant_client"),
        patch("app.services.rag_engine.ConversationalRetrievalChain") as mock_chain,
    ):
        # Mock Embeddings
        mock_embed.return_value.embed_documents.return_value = [[0.1] * 768]
        mock_embed.return_value.embed_query.return_value = [0.1] * 768

        # Mock LLM
        mock_llm.return_value.acall.return_value = "Mocked LLM Response"

        # Mock Chain
        mock_chain_instance = MagicMock()
        mock_chain_instance.ainvoke = AsyncMock(
            return_value={
                "answer": "This is a mocked answer based on context.",
                "source_documents": [
                    MagicMock(
                        page_content="def hello(): return 'world'",
                        metadata={"source": "main.py"},
                    )
                ],
            }
        )
        mock_chain.from_llm.return_value = mock_chain_instance
        with patch(
            "app.services.rag_engine.get_cached_qa_chain",
            return_value=mock_chain_instance,
        ):
            yield


# --- Mock Git ---
@pytest.fixture
def mock_git_clone():
    """Mocks git clone to copy local files instead of network clone."""
    # Patch git.Repo.clone_from globally
    with patch("git.Repo.clone_from") as mock_clone, patch("git.Repo") as mock_repo:

        def side_effect(url, to_path, **kwargs):
            import shutil
            import os
            import logging

            logger = logging.getLogger("tests.conftest")

            # Copy fake repo content to to_path
            src = os.path.join(os.path.dirname(__file__), "fake_repo")
            logger.info(f"DEBUG: Cloning from {src} to {to_path}")

            if os.path.exists(src):
                # Ensure target dir is clean or just copy over
                if os.path.exists(to_path):
                    shutil.rmtree(to_path, ignore_errors=True)
                shutil.copytree(src, to_path, dirs_exist_ok=True)
                logger.info(f"DEBUG: Copied files: {os.listdir(to_path)}")
            else:
                logger.warning(f"DEBUG: Source {src} NOT FOUND")
                os.makedirs(to_path, exist_ok=True)
                with open(os.path.join(to_path, "main.py"), "w") as f:
                    f.write("def hello(): pass")

            return MagicMock()

        mock_clone.side_effect = side_effect
        mock_repo.return_value.head.commit.hexsha = "fakehash123"
        yield mock_clone
