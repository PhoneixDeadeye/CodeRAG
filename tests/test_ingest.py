
# tests/test_ingest.py
import pytest
from unittest.mock import patch, MagicMock
from langchain.schema import Document
import ingest
import os

def test_process_repo_files(tmp_path):
    """Test processing of repo files."""
    repo_path = tmp_path / "repo"
    repo_path.mkdir()
    (repo_path / "test.py").write_text("def hello(): pass")
    
    with patch('ingest.GenericLoader') as mock_loader:
        mock_instance = MagicMock()
        mock_instance.load.return_value = [
            Document(page_content="def hello(): pass", metadata={"source": str(repo_path / "test.py")})
        ]
        mock_loader.from_filesystem.return_value = mock_instance
        
        texts = ingest._process_repo_files(str(repo_path), "http://github.com/test/repo")
        
        # Verify loader was called
        mock_loader.from_filesystem.assert_called()
        # Verify texts were returned (and split/redacted)
        assert len(texts) > 0
        assert "def hello" in texts[0].page_content

@patch('ingest.git.Repo')
def test_load_and_index_repo_clone(mock_repo, tmp_path):
    """Test repo cloning and indexing."""
    repo_path = str(tmp_path / "clone_repo")
    cache_path = str(tmp_path / "cache.json")
    url = "https://github.com/test/repo"
    
    # Mock behavior
    mock_repo_instance = MagicMock()
    mock_repo_instance.head.commit.hexsha = "abc1234"
    mock_repo.clone_from.return_value = mock_repo_instance
    mock_repo.return_value = mock_repo_instance
    
    with patch('ingest._process_repo_files') as mock_process:
        mock_process.return_value = [Document(page_content="test")]
        
        texts = ingest.load_and_index_repo(url, repo_path, cache_path, force_reindex=True)
        
        mock_repo.clone_from.assert_called()
        assert texts is not None
        assert len(texts) == 1

def test_redact_secrets():
    """Test secret redaction."""
    content = "api_key = 'sec_12345678901234567890'"
    redacted = ingest.redact_secrets(content)
    assert "REDACTED_SECRET" in redacted
    assert "sec_" not in redacted
