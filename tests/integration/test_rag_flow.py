import pytest
from unittest.mock import MagicMock, patch
from qdrant_client import QdrantClient
from app.services import rag_engine, ingest

from langchain_core.embeddings import Embeddings
from langchain_core.language_models.llms import LLM
from typing import Optional, List, Any

# --- Mocks ---
class MockEmbeddings(Embeddings):
    def embed_documents(self, texts):
        return [[0.1] * 768 for _ in texts]

    def embed_query(self, text):
        return [0.1] * 768


class MockLLM(LLM):
    def _call(
        self,
        prompt: str,
        stop: Optional[List[str]] = None,
        run_manager: Any = None,
        **kwargs: Any,
    ) -> str:
        return "This is a mock answer based on the context."

    @property
    def _llm_type(self) -> str:
        return "mock"


@pytest.fixture
def mock_dependencies():
    import importlib

    importlib.reload(rag_engine)

    # Verify not mocked
    if isinstance(rag_engine.ConversationalRetrievalChain, MagicMock):
        print(
            "CRITICAL WARNING: ConversationalRetrievalChain is ALREADY mocked before patch!"
        )

    with (
        patch("app.services.rag_engine.get_embeddings", return_value=MockEmbeddings()),
        patch("app.services.rag_engine.get_llm", return_value=MockLLM()),
        patch(
            "app.services.rag_engine.get_qdrant_client",
            return_value=QdrantClient(":memory:"),
        ),
    ):
        yield


def test_rag_ingest_and_query(tmp_path, mock_dependencies):
    """
    Test the full RAG pipeline:
    1. Create a dummy repo
    2. Ingest it (load -> chunk -> vector db)
    3. Query it (retrieve -> generate)
    """

    # 1. Setup Dummy Repo
    repo_dir = tmp_path / "test_repo"
    repo_dir.mkdir()

    # Create a Python file
    code_file = repo_dir / "main.py"
    code_file.write_text("""
def calculate_sum(a, b):
    \"\"\"Calculates the sum of two numbers.\"\"\"
    return a + b

class Calculator:
    def multiply(self, x, y):
        return x * y
""")

    # 2. Ingest
    collection_name = "test_collection"

    # Process files
    # Using existing utility to load from path
    texts = ingest.load_and_index_repo_from_path(str(repo_dir))
    assert len(texts) > 0, "Should have found documents"

    # Index into Vector DB
    rag_engine.create_vector_db(texts, collection_name)

    # 3. Query
    # Get QA Chain
    chain = rag_engine.get_qa_chain(collection_name)
    assert chain is not None, "QA Chain should be created"

    # Query logic (simulating chat)
    # The chain expects "question" and "chat_history"
    try:
        response = chain.invoke(
            {"question": "What does calculate_sum do?", "chat_history": []}
        )
    except Exception as e:
        pytest.fail(f"Chain invocation failed: {e}")

    # 4. Verify
    assert "answer" in response
    # Since we mocked the LLM to return a fixed string, we verify that.
    # In a real integration test with VCR or real LLM, we'd check content.
    # But wait, invoke returns a dict with answer.
    # The MockLLM returns a string. LangChain handles this.

    # Verify retrieval
    # Qdrant in memory should find matches if embeddings are uniform ([0.1]*768)
    # Cosine similarity will be 1.0 for all docs.
    if "source_documents" in response:
        assert len(response["source_documents"]) > 0
        found_main_py = False
        for doc in response["source_documents"]:
            # Need to handle path normalization
            if "main.py" in doc.metadata.get("source", ""):
                found_main_py = True
                break
        assert found_main_py, "Should have retrieved main.py"
    else:
        # If no source docs returned, something fundamental failed in retrieval
        pytest.fail("No source documents returned")
