"""
Simple in-memory cache for API responses
Reduces redundant computations for frequently accessed data
"""

import time
from typing import Any, Optional, Callable
from functools import wraps
import hashlib
import json
import logging

logger = logging.getLogger(__name__)


class SimpleCache:
    """Thread-safe in-memory cache with TTL support."""

    def __init__(self, default_ttl: int = 300):
        """
        Initialize cache.

        Args:
            default_ttl: Default time-to-live in seconds (default: 5 minutes)
        """
        self._cache = {}
        self._default_ttl = default_ttl

    def _generate_key(self, *args, **kwargs) -> str:
        """Generate cache key from function arguments."""
        key_data = {"args": args, "kwargs": sorted(kwargs.items())}
        key_str = json.dumps(key_data, sort_keys=True, default=str)
        return hashlib.md5(key_str.encode()).hexdigest()

    def get(self, key: str) -> Optional[Any]:
        """Get value from cache if not expired."""
        if key in self._cache:
            value, expiry = self._cache[key]
            if time.time() < expiry:
                logger.debug(f"Cache HIT: {key[:8]}...")
                return value
            else:
                # Expired, remove it
                logger.debug(f"Cache EXPIRED: {key[:8]}...")
                del self._cache[key]

        logger.debug(f"Cache MISS: {key[:8]}...")
        return None

    def set(self, key: str, value: Any, ttl: Optional[int] = None):
        """Set value in cache with TTL."""
        if ttl is None:
            ttl = self._default_ttl

        expiry = time.time() + ttl
        self._cache[key] = (value, expiry)
        logger.debug(f"Cache SET: {key[:8]}... (TTL: {ttl}s)")

    def delete(self, key: str):
        """Delete value from cache."""
        if key in self._cache:
            del self._cache[key]
            logger.debug(f"Cache DELETE: {key[:8]}...")

    def clear(self):
        """Clear entire cache."""
        count = len(self._cache)
        self._cache.clear()
        logger.info(f"Cache cleared ({count} items)")

    def cleanup(self):
        """Remove expired entries."""
        now = time.time()
        expired_keys = [
            key for key, (_, expiry) in self._cache.items() if now >= expiry
        ]

        for key in expired_keys:
            del self._cache[key]

        if expired_keys:
            logger.info(f"Cache cleanup: removed {len(expired_keys)} expired items")

    def stats(self) -> dict:
        """Get cache statistics."""
        now = time.time()
        active = sum(1 for _, expiry in self._cache.values() if now < expiry)
        expired = len(self._cache) - active

        return {
            "total_items": len(self._cache),
            "active_items": active,
            "expired_items": expired,
            "memory_estimate_kb": len(str(self._cache)) / 1024,
        }


# Global cache instance
_global_cache = SimpleCache(default_ttl=300)  # 5 minutes default


def cached(ttl: Optional[int] = None, key_prefix: str = ""):
    """
    Decorator to cache function results.

    Args:
        ttl: Time-to-live in seconds (None uses default)
        key_prefix: Prefix for cache key

    Example:
        @cached(ttl=60, key_prefix="file_tree")
        def get_file_tree(repo_id: str):
            # expensive operation
            return result
    """

    def decorator(func: Callable) -> Callable:
        @wraps(func)
        def wrapper(*args, **kwargs):
            # Generate cache key
            cache_key = _global_cache._generate_key(
                key_prefix, func.__name__, *args, **kwargs
            )

            # Try to get from cache
            cached_value = _global_cache.get(cache_key)
            if cached_value is not None:
                return cached_value

            # Not in cache, execute function
            result = func(*args, **kwargs)

            # Store in cache
            _global_cache.set(cache_key, result, ttl)

            return result

        # Add cache management methods to wrapped function
        wrapper.cache_clear = lambda: _global_cache.clear()
        wrapper.cache_stats = lambda: _global_cache.stats()

        return wrapper

    return decorator


def get_cache() -> SimpleCache:
    """Get global cache instance."""
    return _global_cache


def clear_cache():
    """Clear global cache."""
    _global_cache.clear()


def cache_stats() -> dict:
    """Get global cache statistics."""
    return _global_cache.stats()
