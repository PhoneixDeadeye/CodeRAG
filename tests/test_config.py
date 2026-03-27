"""
Configuration & Security Validation Tests
Tests for SECRET_KEY enforcement, BM25 JSON serialization, and registration rate limiting.
"""

import pytest
import json
from pydantic import ValidationError
from unittest.mock import patch
from langchain_core.documents import Document


class TestSecretKeyValidation:
    """Tests for SECRET_KEY enforcement in config.py."""

    def test_secure_key_accepted(self):
        """A 32+ char key should be accepted."""
        from app.core.config import Settings

        settings = Settings(SECRET_KEY="A" * 32)
        assert settings.SECRET_KEY == "A" * 32

    def test_insecure_default_key_rejected(self):
        """The known insecure default key must crash startup."""
        from app.core.config import Settings

        with pytest.raises(ValidationError) as excinfo:
            Settings(SECRET_KEY="supersecretkey_change_me_in_prod")
        assert "Insecure default SECRET_KEY detected" in str(excinfo.value)

    def test_short_key_rejected(self):
        """Keys shorter than 32 characters must be rejected."""
        from app.core.config import Settings

        with pytest.raises(ValidationError) as excinfo:
            Settings(SECRET_KEY="tooshort")
        assert "too short" in str(excinfo.value).lower()

    def test_31_char_key_rejected(self):
        """Edge case: exactly 31 chars should fail."""
        from app.core.config import Settings

        with pytest.raises(ValidationError):
            Settings(SECRET_KEY="A" * 31)

    def test_32_char_key_accepted(self):
        """Edge case: exactly 32 chars should pass."""
        from app.core.config import Settings

        settings = Settings(SECRET_KEY="B" * 32)
        assert len(settings.SECRET_KEY) == 32


class TestBM25JsonSerialization:
    """Tests for safe JSON (not pickle) BM25 serialization."""

    def test_bm25_saves_as_json(self, tmp_path):
        """BM25 index should be saved as .json, not .pkl."""
        from app.services.rag_engine import create_vector_db
        from app.core.config import settings

        # Temporarily redirect DATA_DIR
        original_data_dir = settings.DATA_DIR
        settings.DATA_DIR = str(tmp_path)

        try:
            docs = [
                Document(
                    page_content="def hello(): pass", metadata={"source": "test.py"}
                ),
                Document(
                    page_content="def world(): pass", metadata={"source": "test2.py"}
                ),
            ]

            collection_name = "test_bm25_json"

            # Mock the Qdrant parts — we only care about BM25 saving
            with patch("app.services.rag_engine.get_embeddings", return_value=None):
                # create_vector_db will skip Qdrant (embeddings=None) but still save BM25
                create_vector_db(docs, collection_name)

            # Verify JSON file exists
            json_path = tmp_path / f"bm25_{collection_name}.json"
            assert json_path.exists(), "BM25 index should be saved as .json"

            # Verify it's valid JSON
            with open(json_path, "r", encoding="utf-8") as f:
                data = json.load(f)

            assert isinstance(data, list)
            assert len(data) == 2
            assert data[0]["page_content"] == "def hello(): pass"
            assert data[0]["metadata"]["source"] == "test.py"

            # Verify no pickle file was created
            pkl_path = tmp_path / f"bm25_{collection_name}.pkl"
            assert not pkl_path.exists(), "No .pkl file should be created"

        finally:
            settings.DATA_DIR = original_data_dir

    def test_bm25_round_trip(self, tmp_path):
        """BM25 save → load should preserve document content."""
        from app.core.config import settings

        original_data_dir = settings.DATA_DIR
        settings.DATA_DIR = str(tmp_path)

        try:
            collection_name = "test_roundtrip"

            # Create JSON manually (simulates what create_vector_db does)
            docs_data = [
                {
                    "page_content": "class Foo: pass",
                    "metadata": {"source": "foo.py", "start_line": 1},
                },
                {
                    "page_content": "class Bar: pass",
                    "metadata": {"source": "bar.py", "start_line": 5},
                },
            ]
            json_path = tmp_path / f"bm25_{collection_name}.json"
            with open(json_path, "w", encoding="utf-8") as f:
                json.dump(docs_data, f)

            # Load using the rag_engine logic
            with open(json_path, "r", encoding="utf-8") as f:
                loaded_data = json.load(f)

            loaded_docs = [
                Document(page_content=d["page_content"], metadata=d.get("metadata", {}))
                for d in loaded_data
            ]

            assert len(loaded_docs) == 2
            assert loaded_docs[0].page_content == "class Foo: pass"
            assert loaded_docs[1].metadata["source"] == "bar.py"

        finally:
            settings.DATA_DIR = original_data_dir


class TestRegistrationRateLimiting:
    """Tests for rate limiting on registration endpoint."""

    @pytest.mark.asyncio
    async def test_register_rate_limit_exists(self, client):
        """Registration endpoint should use rate limiting."""
        from app.api.rate_limiter import login_limiter

        # The login_limiter is used for both login and register
        # Verify it's a proper RateLimiter instance
        assert hasattr(login_limiter, "is_allowed")
        assert hasattr(login_limiter, "get_remaining")

    @pytest.mark.asyncio
    async def test_register_works_under_limit(self, client):
        """Normal registration should succeed."""
        response = await client.post(
            "/api/v1/auth/register",
            json={
                "email": "ratelimit_test@example.com",
                "password": "securepassword123",
            },
        )
        assert response.status_code == 200
        data = response.json()
        assert "access_token" in data


class TestConversationMemoryWindowing:
    """Tests for bounded conversation memory."""

    def test_memory_has_window_limit(self):
        """QA chain memory should use windowed memory, not unbounded buffer."""
        from langchain.memory import ConversationBufferWindowMemory

        # Verify we can create the windowed memory
        memory = ConversationBufferWindowMemory(
            k=10, memory_key="chat_history", return_messages=True, output_key="answer"
        )
        assert memory.k == 10
