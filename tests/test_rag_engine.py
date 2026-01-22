
# tests/test_rag_engine.py
import pytest
from unittest.mock import patch, MagicMock
from langchain.schema import Document
import rag_engine
import os

@pytest.fixture
def mock_embeddings():
    with patch('rag_engine.GoogleGenerativeAIEmbeddings') as mock:
        mock_instance = MagicMock()
        mock_instance.embed_documents.return_value = [[0.1] * 768]
        mock_instance.embed_query.return_value = [0.1] * 768
        mock.return_value = mock_instance
        yield mock_instance

def test_create_vector_db(mock_embeddings, tmp_path):
    """Test vector DB creation."""
    chunks = [
        Document(page_content="def hello(): pass", metadata={"source": "test.py"}),
        Document(page_content="class Foo: pass", metadata={"source": "test.py"})
    ]
    
    vector_path = str(tmp_path / "vectors")
    
    with patch('rag_engine.FAISS') as mock_faiss:
        mock_instance = MagicMock()
        mock_faiss.from_documents.return_value = mock_instance
        
        rag_engine.create_vector_db(chunks, vector_path)
        
        # Verify FAISS was initialized
        mock_faiss.from_documents.assert_called()
        # Verify save was called
        mock_instance.save_local.assert_called_with(vector_path)

def test_get_qa_chain_no_db():
    """Test getting QA chain when DB does not exist."""
    chain = rag_engine.get_qa_chain("non_existent_path")
    assert chain is None

@patch('rag_engine.ConversationalRetrievalChain')
@patch('rag_engine.FAISS')
@patch('rag_engine.BM25Retriever')
@patch('rag_engine.GoogleGenerativeAIEmbeddings')
@patch('rag_engine.GoogleGenerativeAI')
def test_get_qa_chain_success(mock_llm, mock_embeddings, mock_bm25, mock_faiss, mock_crc, tmp_path):
    """Test successful QA chain creation."""
    # Create valid paths
    vector_path = str(tmp_path / "vectors")
    os.makedirs(vector_path, exist_ok=True)
    with open(os.path.join(vector_path, "texts.pkl"), 'wb') as f:
        import pickle
        pickle.dump([], f)
        
    # Mock FAISS
    mock_db = MagicMock()
    mock_faiss.load_local.return_value = mock_db
    
    # Mock LLM
    mock_llm.return_value = MagicMock()
    
    # Mock Chain
    mock_crc.from_llm.return_value = MagicMock()
    
    chain = rag_engine.get_qa_chain(vector_path)
    assert chain is not None
