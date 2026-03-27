"""
Security Tests — SSRF Protection & URL Validation

Tests that validate_repo_url blocks private/loopback/reserved IPs
and allows legitimate GitHub URLs.
"""

import pytest
from unittest.mock import patch
from app.core.security import validate_repo_url


def _addrinfo(ip: str):
    return [(0, 0, 0, "", (ip, 443))]


class TestSSRFProtection:
    """Verify SSRF protection blocks private network access."""

    def test_allows_valid_github_https(self):
        url = "https://github.com/user/repo.git"
        with patch(
            "app.core.security.socket.getaddrinfo", return_value=_addrinfo("140.82.121.3")
        ):
            result = validate_repo_url(url)
        assert result == url

    def test_blocks_localhost(self):
        with patch("app.core.security.socket.getaddrinfo", return_value=_addrinfo("127.0.0.1")):
            with pytest.raises(ValueError, match="local/private network blocked"):
                validate_repo_url("https://github.com/user/repo.git")

    def test_blocks_private_10_network(self):
        with patch("app.core.security.socket.getaddrinfo", return_value=_addrinfo("10.0.0.1")):
            with pytest.raises(ValueError, match="local/private network blocked"):
                validate_repo_url("https://github.com/user/repo.git")

    def test_blocks_private_172_network(self):
        with patch("app.core.security.socket.getaddrinfo", return_value=_addrinfo("172.16.0.1")):
            with pytest.raises(ValueError, match="local/private network blocked"):
                validate_repo_url("https://github.com/user/repo.git")

    def test_blocks_private_192_network(self):
        with patch("app.core.security.socket.getaddrinfo", return_value=_addrinfo("192.168.1.1")):
            with pytest.raises(ValueError, match="local/private network blocked"):
                validate_repo_url("https://github.com/user/repo.git")

    def test_blocks_loopback_127_range(self):
        with patch("app.core.security.socket.getaddrinfo", return_value=_addrinfo("127.0.0.2")):
            with pytest.raises(ValueError, match="local/private network blocked"):
                validate_repo_url("https://github.com/user/repo.git")

    def test_blocks_link_local(self):
        with patch("app.core.security.socket.getaddrinfo", return_value=_addrinfo("169.254.0.1")):
            with pytest.raises(ValueError, match="local/private network blocked"):
                validate_repo_url("https://github.com/user/repo.git")

    def test_rejects_invalid_scheme_ftp(self):
        with pytest.raises(ValueError, match="Invalid scheme"):
            validate_repo_url("ftp://github.com/user/repo")

    def test_rejects_invalid_scheme_file(self):
        with pytest.raises(ValueError, match="Invalid scheme"):
            validate_repo_url("file:///etc/passwd")

    def test_rejects_non_allowlisted_host(self):
        with pytest.raises(ValueError, match="Host not allowed"):
            validate_repo_url("https://gitlab.com/user/repo.git")

    def test_rejects_url_with_credentials(self):
        with pytest.raises(ValueError, match="Credentials in URL"):
            validate_repo_url("https://user:pass@github.com/user/repo.git")

    def test_allows_upload_scheme(self):
        result = validate_repo_url("upload://local-file")
        assert result == "upload://local-file"

    def test_rejects_no_hostname(self):
        with pytest.raises(ValueError):
            validate_repo_url("https://")

    def test_rejects_dns_resolution_failure(self):
        """If DNS resolution fails, URL is rejected for SSRF safety."""
        import socket

        with patch(
            "app.core.security.socket.getaddrinfo",
            side_effect=socket.gaierror("DNS failed"),
        ):
            with pytest.raises(ValueError, match="Hostname cannot be resolved"):
                validate_repo_url("https://github.com/user/repo.git")
