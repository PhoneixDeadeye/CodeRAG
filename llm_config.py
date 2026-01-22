"""
Multi-Model LLM Configuration

Provides configuration for multiple LLM providers:
- Google Gemini (default)
- OpenAI GPT models
- Anthropic Claude
- Local Ollama

Usage:
    from llm_config import get_llm_client, LLMProvider
    
    client = get_llm_client(LLMProvider.OPENAI)
"""
from enum import Enum
from typing import Any, Optional
import os
import logging

logger = logging.getLogger(__name__)


class LLMProvider(str, Enum):
    """Supported LLM providers."""
    GOOGLE = "google"
    OPENAI = "openai"
    ANTHROPIC = "anthropic"
    OLLAMA = "ollama"


# Provider configuration with defaults
LLM_CONFIG = {
    LLMProvider.GOOGLE: {
        "model": "gemini-2.0-flash-lite",
        "env_key": "GOOGLE_API_KEY",
        "temperature": 0.2,
    },
    LLMProvider.OPENAI: {
        "model": "gpt-4o-mini",
        "env_key": "OPENAI_API_KEY",
        "temperature": 0.2,
    },
    LLMProvider.ANTHROPIC: {
        "model": "claude-3-haiku-20240307",
        "env_key": "ANTHROPIC_API_KEY",
        "temperature": 0.2,
    },
    LLMProvider.OLLAMA: {
        "model": "llama3.2",
        "base_url": "http://localhost:11434",
        "temperature": 0.2,
    },
}


def get_available_providers() -> list[LLMProvider]:
    """Get list of providers with valid API keys configured."""
    available = []
    for provider, config in LLM_CONFIG.items():
        if provider == LLMProvider.OLLAMA:
            # Ollama doesn't need API key
            available.append(provider)
        elif os.getenv(config.get("env_key", "")):
            available.append(provider)
    return available


def get_llm_client(
    provider: LLMProvider = LLMProvider.GOOGLE,
    model_override: Optional[str] = None,
    temperature_override: Optional[float] = None
) -> Any:
    """
    Get an LLM client for the specified provider.
    
    Args:
        provider: The LLM provider to use
        model_override: Override the default model
        temperature_override: Override the default temperature
        
    Returns:
        LangChain-compatible LLM instance
        
    Raises:
        ValueError: If provider not supported or API key missing
    """
    config = LLM_CONFIG.get(provider)
    if not config:
        raise ValueError(f"Unsupported provider: {provider}")
    
    model = model_override or config["model"]
    temperature = temperature_override if temperature_override is not None else config["temperature"]
    
    if provider == LLMProvider.GOOGLE:
        from langchain_google_genai import GoogleGenerativeAI
        api_key = os.getenv(config["env_key"])
        if not api_key:
            raise ValueError("GOOGLE_API_KEY not set")
        return GoogleGenerativeAI(
            model=model,
            temperature=temperature,
            google_api_key=api_key
        )
    
    elif provider == LLMProvider.OPENAI:
        from langchain_openai import ChatOpenAI
        api_key = os.getenv(config["env_key"])
        if not api_key:
            raise ValueError("OPENAI_API_KEY not set")
        return ChatOpenAI(
            model=model,
            temperature=temperature,
            api_key=api_key
        )
    
    elif provider == LLMProvider.ANTHROPIC:
        from langchain_anthropic import ChatAnthropic
        api_key = os.getenv(config["env_key"])
        if not api_key:
            raise ValueError("ANTHROPIC_API_KEY not set")
        return ChatAnthropic(
            model=model,
            temperature=temperature,
            api_key=api_key
        )
    
    elif provider == LLMProvider.OLLAMA:
        from langchain_community.llms import Ollama
        return Ollama(
            model=model,
            temperature=temperature,
            base_url=config.get("base_url", "http://localhost:11434")
        )
    
    raise ValueError(f"Provider not implemented: {provider}")


# Default provider from environment or fallback to Google
def get_default_provider() -> LLMProvider:
    """Get the default LLM provider from environment."""
    provider_name = os.getenv("LLM_PROVIDER", "google").lower()
    try:
        return LLMProvider(provider_name)
    except ValueError:
        logger.warning(f"Unknown LLM_PROVIDER '{provider_name}', using Google")
        return LLMProvider.GOOGLE
