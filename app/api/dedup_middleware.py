"""
Request Deduplication Middleware
Prevents duplicate concurrent requests for the same resource.
"""

import asyncio
from typing import Dict, Tuple
from starlette.middleware.base import BaseHTTPMiddleware
from starlette.requests import Request
from starlette.responses import Response
import logging

logger = logging.getLogger(__name__)


class RequestDeduplicationMiddleware(BaseHTTPMiddleware):
    """
    Middleware that deduplicates concurrent requests to the same endpoint.

    If multiple identical requests arrive while one is being processed,
    subsequent requests will wait for the first one to complete and
    return the same response.
    """

    def __init__(self, app, enabled: bool = True):
        super().__init__(app)
        self.enabled = enabled
        self._pending: Dict[str, Tuple[asyncio.Future, Response]] = {}

    def _generate_request_key(self, request: Request) -> str:
        """Generate unique key for request based on method, path, and query params."""
        # Include method, path, and sorted query params
        query_str = (
            str(sorted(request.query_params.items())) if request.query_params else ""
        )
        return f"{request.method}:{request.url.path}?{query_str}"

    async def dispatch(self, request: Request, call_next) -> Response:
        if not self.enabled:
            return await call_next(request)

        # Only deduplicate GET requests (idempotent)
        if request.method != "GET":
            return await call_next(request)

        # Skip health checks and metrics
        if request.url.path in ["/health", "/metrics", "/health/ai", "/health/cache"]:
            return await call_next(request)

        request_key = self._generate_request_key(request)

        # Check if this request is already being processed
        if request_key in self._pending:
            logger.debug(f"[DEDUP] Waiting for pending request: {request_key}")
            future, _ = self._pending[request_key]
            try:
                # Wait for the pending request to complete
                response = await future
                logger.debug(f"[DEDUP] Returning cached response for: {request_key}")
                return response
            except Exception as e:
                logger.error(f"[DEDUP] Error waiting for pending request: {e}")
                # If waiting failed, just proceed with new request

        # Create a future for this request
        future = asyncio.Future()
        self._pending[request_key] = (future, None)

        try:
            # Process the request
            response = await call_next(request)

            # Store response and notify waiting requests
            future.set_result(response)

            return response

        except Exception as e:
            # Propagate error to waiting requests
            future.set_exception(e)
            raise

        finally:
            # Clean up
            if request_key in self._pending:
                del self._pending[request_key]

    def get_stats(self) -> dict:
        """Get deduplication statistics."""
        return {
            "enabled": self.enabled,
            "pending_requests": len(self._pending),
            "pending_keys": list(self._pending.keys())
            if len(self._pending) < 10
            else [],
        }
