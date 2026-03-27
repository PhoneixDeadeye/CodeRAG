"""
Ingestion & Secret Scanning Tests

Tests the ingest pipeline: file loading, chunking, and secret redaction.
"""

from app.services.ingest import (
    redact_secrets,
    load_and_index_repo_from_path,
)


class TestSecretRedaction:
    """Verify secret scanning patterns catch common secrets."""

    def test_redacts_aws_key(self):
        content = 'aws_key = "AKIAIOSFODNN7EXAMPLE"'
        result = redact_secrets(content)
        assert "AKIAIOSFODNN7EXAMPLE" not in result
        assert "REDACTED" in result

    def test_redacts_github_token(self):
        content = 'token = "ghp_ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghij"'
        result = redact_secrets(content)
        assert "ghp_" not in result
        assert "REDACTED" in result

    def test_redacts_openai_key(self):
        content = 'OPENAI_KEY = "sk-abcdefghijklmnopqrstuvwxyz1234567890"'
        result = redact_secrets(content)
        assert "sk-" not in result
        assert "REDACTED" in result

    def test_redacts_generic_api_key(self):
        content = "api_key = 'super_secret_key_12345678901234567890'"
        result = redact_secrets(content)
        assert "super_secret_key" not in result

    def test_preserves_non_secret_content(self):
        content = "def hello():\n    return 'world'\n"
        result = redact_secrets(content)
        assert result == content


class TestIngestionPipeline:
    """Test file loading and chunking."""

    def test_process_python_file(self, tmp_path):
        """Process a simple Python file and check chunks."""
        code = '''
class Calculator:
    """A simple calculator class."""
    
    def add(self, a: int, b: int) -> int:
        return a + b
    
    def subtract(self, a: int, b: int) -> int:
        return a - b

def main():
    calc = Calculator()
    print(calc.add(1, 2))
'''
        (tmp_path / "calculator.py").write_text(code)

        texts = load_and_index_repo_from_path(str(tmp_path))

        assert len(texts) > 0
        # All chunks should have metadata
        for t in texts:
            assert "source" in t.metadata
            assert "language" in t.metadata

    def test_process_multiple_languages(self, tmp_path):
        """Process files in multiple languages."""
        (tmp_path / "app.py").write_text("def main(): pass")
        (tmp_path / "index.js").write_text("function main() {}")
        (tmp_path / "lib.ts").write_text("export const foo = 42;")

        texts = load_and_index_repo_from_path(str(tmp_path))

        languages = {t.metadata.get("language") for t in texts}
        assert "python" in languages
        # JS/TS should be detected
        assert len(languages) >= 2

    def test_ignores_non_code_files(self, tmp_path):
        """Non-code files should be excluded."""
        (tmp_path / "README.md").write_text("# Hello")
        (tmp_path / "data.csv").write_text("a,b,c")
        (tmp_path / "image.png").write_bytes(b"\x89PNG")
        (tmp_path / "app.py").write_text("x = 1")

        texts = load_and_index_repo_from_path(str(tmp_path))

        sources = [t.metadata.get("source", "") for t in texts]
        assert not any("README" in s for s in sources)
        assert not any(".csv" in s for s in sources)
        assert not any(".png" in s for s in sources)

    def test_empty_directory_returns_empty(self, tmp_path):
        """Empty directory should return no chunks."""
        texts = load_and_index_repo_from_path(str(tmp_path))
        assert len(texts) == 0

    def test_secrets_are_redacted_in_chunks(self, tmp_path):
        """Secrets in code files should be redacted after processing."""
        code = """
import os
API_KEY = "AKIAIOSFODNN7EXAMPLE"
token = "ghp_ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghij"

def connect():
    return API_KEY
"""
        (tmp_path / "config.py").write_text(code)

        texts = load_and_index_repo_from_path(str(tmp_path))

        for t in texts:
            assert "AKIAIOSFODNN7EXAMPLE" not in t.page_content
            assert "ghp_" not in t.page_content
