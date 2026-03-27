"""Shared error handling utilities for API endpoints."""

from fastapi import HTTPException
import logging

logger = logging.getLogger("CodeRAG")


def raise_ai_service_error(error: Exception) -> None:
    """Convert AI service exceptions into user-friendly HTTP errors.

    Centralizes error classification for LLM/RAG chain failures,
    preventing copy-paste of error matching logic across endpoints.
    """
    error_str = str(error).lower()

    if "deadline exceeded" in error_str or "timeout" in error_str or "504" in error_str:
        detail = "The AI service is taking too long to respond. Please try again in a moment."
    elif "rate limit" in error_str or "quota" in error_str or "429" in error_str:
        detail = "Rate limit exceeded. Please wait a moment and try again."
    elif "api key" in error_str or "401" in error_str or "403" in error_str:
        detail = "AI service authentication error. Please contact support."
    elif "retryerror" in error_str:
        detail = "The AI service is temporarily unavailable. Please try again in a few seconds."
    else:
        detail = "Failed to generate response. Please try again."

    raise HTTPException(status_code=503, detail=detail)
