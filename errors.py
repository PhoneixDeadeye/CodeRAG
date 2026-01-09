"""
Centralized Error Handling Module
Provides consistent error responses across all API endpoints.
"""
from fastapi import HTTPException, Request
from fastapi.responses import JSONResponse
from pydantic import BaseModel
from typing import Optional, Any
import logging

logger = logging.getLogger(__name__)


class ErrorResponse(BaseModel):
    """Standard error response schema."""
    error: str
    detail: str
    code: str
    request_id: Optional[str] = None


class APIError(Exception):
    """Base exception for API errors with structured response."""
    
    def __init__(
        self, 
        error: str,
        detail: str,
        code: str,
        status_code: int = 400
    ):
        self.error = error
        self.detail = detail
        self.code = code
        self.status_code = status_code
        super().__init__(detail)


# Common error factories
def not_found(resource: str, resource_id: str = "") -> APIError:
    """Create a not found error."""
    detail = f"{resource} not found" + (f": {resource_id}" if resource_id else "")
    return APIError(
        error="Not Found",
        detail=detail,
        code="NOT_FOUND",
        status_code=404
    )


def validation_error(detail: str) -> APIError:
    """Create a validation error."""
    return APIError(
        error="Validation Error",
        detail=detail,
        code="VALIDATION_ERROR",
        status_code=422
    )


def unauthorized(detail: str = "Authentication required") -> APIError:
    """Create an unauthorized error."""
    return APIError(
        error="Unauthorized",
        detail=detail,
        code="UNAUTHORIZED",
        status_code=401
    )


def rate_limited(detail: str = "Rate limit exceeded") -> APIError:
    """Create a rate limit error."""
    return APIError(
        error="Too Many Requests",
        detail=detail,
        code="RATE_LIMITED",
        status_code=429
    )


def internal_error(detail: str = "An unexpected error occurred") -> APIError:
    """Create an internal server error."""
    return APIError(
        error="Internal Server Error",
        detail=detail,
        code="INTERNAL_ERROR",
        status_code=500
    )


async def api_error_handler(request: Request, exc: APIError) -> JSONResponse:
    """Handle APIError exceptions and return structured response."""
    request_id = getattr(request.state, 'request_id', None)
    
    return JSONResponse(
        status_code=exc.status_code,
        content={
            "error": exc.error,
            "detail": exc.detail,
            "code": exc.code,
            "request_id": request_id
        }
    )
