"""
Rate Limiter Tests
Covers: hitting limit → 429 response → recovery after window
"""

import pytest
import time
from app.api.rate_limiter import RateLimiter, check_login_limit, check_chat_limit
from fastapi import HTTPException


class TestRateLimiterCore:
    """Unit tests for the RateLimiter class."""

    def test_allows_under_limit(self):
        limiter = RateLimiter()
        for _ in range(5):
            assert limiter.is_allowed("test_ip", limit=5, window_seconds=60)

    def test_blocks_at_limit(self):
        limiter = RateLimiter()
        for _ in range(5):
            limiter.is_allowed("block_ip", limit=5, window_seconds=60)
        assert not limiter.is_allowed("block_ip", limit=5, window_seconds=60)

    def test_different_keys_are_independent(self):
        limiter = RateLimiter()
        for _ in range(5):
            limiter.is_allowed("ip_a", limit=5, window_seconds=60)
        # ip_a is at limit, but ip_b should still work
        assert limiter.is_allowed("ip_b", limit=5, window_seconds=60)

    def test_remaining_count(self):
        limiter = RateLimiter()
        limiter.is_allowed("count_ip", limit=10, window_seconds=60)
        limiter.is_allowed("count_ip", limit=10, window_seconds=60)
        remaining = limiter.get_remaining("count_ip", 10, 60)
        assert remaining == 8

    def test_recovers_after_window(self):
        limiter = RateLimiter()
        # Use a 1-second window
        for _ in range(3):
            limiter.is_allowed("recover_ip", limit=3, window_seconds=1)
        assert not limiter.is_allowed("recover_ip", limit=3, window_seconds=1)

        # Wait for window to expire
        time.sleep(1.1)
        assert limiter.is_allowed("recover_ip", limit=3, window_seconds=1)


class TestLoginRateLimit:
    """Integration tests for login rate limit enforcement."""

    def test_check_login_limit_passes_under_limit(self):
        """Should not raise for normal usage."""
        # Use unique IP to avoid interference
        check_login_limit("unit_test_safe_ip_123")

    def test_check_login_limit_raises_429(self):
        """Should raise HTTPException 429 when limit exceeded."""
        unique_ip = f"rate_test_{time.time()}"
        # Exhaust the limit (default is 10/min)
        for _ in range(10):
            check_login_limit(unique_ip)

        with pytest.raises(HTTPException) as exc_info:
            check_login_limit(unique_ip)
        assert exc_info.value.status_code == 429
        assert "Too many login attempts" in exc_info.value.detail


class TestChatRateLimit:
    """Integration tests for chat rate limit enforcement."""

    def test_check_chat_limit_passes_under_limit(self):
        check_chat_limit("unit_test_chat_user_123")

    def test_check_chat_limit_raises_429(self):
        unique_user = f"chat_test_{time.time()}"
        # Default chat limit is 50/hour (from env or default)
        for _ in range(50):
            check_chat_limit(unique_user)

        with pytest.raises(HTTPException) as exc_info:
            check_chat_limit(unique_user)
        assert exc_info.value.status_code == 429
