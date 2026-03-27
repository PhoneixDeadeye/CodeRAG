# tests/test_rag_engine.py
import pytest
from unittest.mock import patch, MagicMock
from langchain_core.documents import Document
import app.services.rag_engine as rag_engine


@pytest.fixture
def mock_embeddings():
    with patch("app.services.rag_engine.GoogleGenerativeAIEmbeddings") as mock:
        mock_instance = MagicMock()
        mock_instance.embed_documents.return_value = [[0.1] * 768]
        mock_instance.embed_query.return_value = [0.1] * 768
        mock.return_value = mock_instance
        yield mock_instance


@pytest.fixture
def mock_qdrant_client():
    with patch("app.services.rag_engine.QdrantClient") as mock:
        mock_instance = MagicMock()
        # Mock collection check to return True so we don't try to create it and fail logic
        mock_instance.collection_exists.return_value = True
        mock.return_value = mock_instance
        yield mock_instance


@pytest.fixture
def mock_qdrant_store():
    with patch("app.services.rag_engine.QdrantVectorStore") as mock:
        mock_instance = MagicMock()
        mock.return_value = mock_instance
        yield mock


def test_create_vector_db(mock_embeddings, mock_qdrant_client, mock_qdrant_store):
    """Test vector DB creation with Qdrant."""
    chunks = [
        Document(page_content="def hello(): pass", metadata={"source": "test.py"}),
        Document(page_content="class Foo: pass", metadata={"source": "test.py"}),
    ]

    collection_name = "test_collection"

    # Needs to mock get_qdrant_client in the module properly if it's not using the class directly
    with patch(
        "app.services.rag_engine.get_qdrant_client", return_value=mock_qdrant_client
    ):
        # Also need to mock get_embeddings to return our mock
        with patch(
            "app.services.rag_engine.get_embeddings", return_value=mock_embeddings
        ):
            rag_engine.create_vector_db(chunks, collection_name)

    # Verify QdrantVectorStore was initialized
    mock_qdrant_store.assert_called()

    # Verify add_documents was called on the instance
    mock_qdrant_store.return_value.add_documents.assert_called()


def test_get_qa_chain_no_db(mock_embeddings, mock_qdrant_client):
    """Test getting QA chain when collection does not exist."""
    # Mock collection_exists to False
    mock_qdrant_client.collection_exists.return_value = False

    with patch(
        "app.services.rag_engine.get_qdrant_client", return_value=mock_qdrant_client
    ):
        with patch(
            "app.services.rag_engine.get_embeddings", return_value=mock_embeddings
        ):
            chain = rag_engine.get_qa_chain("non_existent_collection")
            assert chain is None


def test_get_qa_chain_success(mock_embeddings, mock_qdrant_client, mock_qdrant_store):
    """Test successful QA chain creation."""
    collection_name = "valid_collection"

    # Mock mocks
    mock_qdrant_client.collection_exists.return_value = True

    mock_retriever = MagicMock()
    mock_qdrant_store.return_value.as_retriever.return_value = mock_retriever

    with patch(
        "app.services.rag_engine.get_qdrant_client", return_value=mock_qdrant_client
    ):
        with patch(
            "app.services.rag_engine.get_embeddings", return_value=mock_embeddings
        ):
            with patch("app.services.rag_engine.GoogleGenerativeAI"):
                with patch(
                    "app.services.rag_engine.ConversationalRetrievalChain"
                ) as mock_crc:
                    mock_crc.from_llm.return_value = MagicMock()

                    chain = rag_engine.get_qa_chain(collection_name)
                    assert chain is not None
                    mock_crc.from_llm.assert_called()
