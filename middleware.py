"""
Request Tracing Middleware
Adds unique request IDs for tracing and debugging.
"""
import uuid
import time
import logging
from starlette.middleware.base import BaseHTTPMiddleware
from starlette.requests import Request
from starlette.responses import Response

logger = logging.getLogger(__name__)


class RequestTracingMiddleware(BaseHTTPMiddleware):
    """Middleware that adds request ID and timing to all requests."""
    
    async def dispatch(self, request: Request, call_next) -> Response:
        # Generate unique request ID
        request_id = str(uuid.uuid4())[:8]
        
        # Store in request state for use in handlers
        request.state.request_id = request_id
        
        # Track timing
        start_time = time.time()
        
        # Add request ID to logging context
        logger.info(
            f"[{request_id}] {request.method} {request.url.path} - Started"
        )
        
        try:
            response = await call_next(request)
            
            # Calculate duration
            duration_ms = (time.time() - start_time) * 1000
            
            # Add headers to response
            response.headers["X-Request-ID"] = request_id
            response.headers["X-Response-Time"] = f"{duration_ms:.2f}ms"
            
            logger.info(
                f"[{request_id}] {request.method} {request.url.path} - "
                f"{response.status_code} ({duration_ms:.2f}ms)"
            )
            
            return response
            
        except Exception as e:
            duration_ms = (time.time() - start_time) * 1000
            logger.error(
                f"[{request_id}] {request.method} {request.url.path} - "
                f"Error: {str(e)} ({duration_ms:.2f}ms)"
            )
            raise
