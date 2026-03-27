import socket
import ipaddress
from urllib.parse import urlparse
import logging
from app.core.config import settings

logger = logging.getLogger(__name__)


def validate_repo_url(url: str) -> str:
    """
    Validates that the repository URL is safe to access.
    Blocks local network access (SSRF protection).

    Returns the URL if safe, raises ValueError if unsafe.
    """
    # Allow internal upload scheme
    if url.startswith("upload://"):
        return url

    try:
        parsed = urlparse(url)
        if parsed.scheme != "https":
            raise ValueError(f"Invalid scheme: {parsed.scheme}")

        hostname = parsed.hostname
        if not hostname:
            raise ValueError("No hostname in URL")

        normalized_host = hostname.lower().strip(".")
        allowlist = {host.lower().strip(".") for host in settings.GIT_HOST_ALLOWLIST}
        if normalized_host not in allowlist:
            raise ValueError(f"Host not allowed: {normalized_host}")

        if parsed.username or parsed.password:
            raise ValueError("Credentials in URL are not allowed")

        if parsed.port and parsed.port != 443:
            raise ValueError("Only HTTPS default port is allowed")

        if normalized_host in {"localhost", "127.0.0.1", "::1"}:
            raise ValueError("Access to localhost is blocked")

        # Resolve hostname to IP to check for DNS rebinding / local IPs
        try:
            addr_info = socket.getaddrinfo(hostname, 443, proto=socket.IPPROTO_TCP)
        except socket.gaierror:
            logger.warning(f"Could not resolve hostname: {hostname}")
            raise ValueError("Hostname cannot be resolved")

        resolved_ips = set()
        for addr in addr_info:
            ip_str = addr[4][0]
            resolved_ips.add(ip_str)

        for ip_str in resolved_ips:
            ip = ipaddress.ip_address(ip_str)
            if (
                ip.is_loopback
                or ip.is_private
                or ip.is_link_local
                or ip.is_reserved
                or ip.is_multicast
                or ip.is_unspecified
            ):
                raise ValueError(
                    f"Access to local/private network blocked: {hostname} ({ip_str})"
                )

        return url

    except ValueError as e:
        logger.warning(f"[SECURITY] SSRF Attempt blocked: {url} -> {e}")
        raise
    except Exception as e:
        logger.error(f"Error validating URL {url}: {e}")
        raise ValueError(f"Invalid URL structure: {e}")
