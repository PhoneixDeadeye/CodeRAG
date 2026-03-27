"""Multi-LLM Provider Abstraction.

Supports pluggable LLM backends: Google Gemini (default), OpenAI, Anthropic.
Each provider implements generate(), stream(), and embed() with a common interface.
"""

import logging
from abc import ABC, abstractmethod
from typing import Any, AsyncIterator, List, Optional

from app.core.config import settings

logger = logging.getLogger(__name__)

# ──────────────────────────────────────────────────────────────
# Abstract Base Provider
# ──────────────────────────────────────────────────────────────


class BaseLLMProvider(ABC):
    """Base class for all LLM providers."""

    provider_name: str = "base"

    @abstractmethod
    async def generate(self, prompt: str, temperature: float = 0.2) -> str:
        """Generate a text completion from a prompt."""

    @abstractmethod
    async def stream(self, prompt: str, temperature: float = 0.2) -> AsyncIterator[str]:
        """Stream a text completion token-by-token."""

    @abstractmethod
    def embed(self, texts: List[str]) -> List[List[float]]:
        """Generate embeddings for a list of texts."""

    @abstractmethod
    def embed_query(self, text: str) -> List[float]:
        """Generate embedding for a single query."""


# ──────────────────────────────────────────────────────────────
# Google Gemini Provider
# ──────────────────────────────────────────────────────────────


class GeminiProvider(BaseLLMProvider):
    """Google Gemini LLM provider using langchain-google-genai."""

    provider_name = "gemini"

    def __init__(self, api_key: Optional[str] = None):
        self.api_key = api_key or settings.GOOGLE_API_KEY
        if not self.api_key:
            raise ValueError("GOOGLE_API_KEY is required for GeminiProvider")

        self._llm = None
        self._embeddings = None

    def _get_llm(self) -> Any:
        if self._llm is None:
            from langchain_google_genai import GoogleGenerativeAI

            key = self._extract_key(self.api_key)
            self._llm = GoogleGenerativeAI(
                model="gemini-2.0-flash-lite",
                temperature=0.2,
                google_api_key=key,
            )
        return self._llm

    def _get_embeddings(self) -> Any:
        if self._embeddings is None:
            import os
            from app.services.rag_engine import SafeGoogleEmbeddings

            key = self._extract_key(self.api_key)
            os.environ["GOOGLE_API_KEY"] = key
            self._embeddings = SafeGoogleEmbeddings(
                model="models/gemini-embedding-001",
            )
        return self._embeddings

    @staticmethod
    def _extract_key(key: Any) -> str:
        if isinstance(key, str):
            return key
        if hasattr(key, "get_secret_value") and callable(key.get_secret_value):
            return str(key.get_secret_value())
        return str(key)

    async def generate(self, prompt: str, temperature: float = 0.2) -> str:
        llm = self._get_llm()
        llm.temperature = temperature
        result = await llm.ainvoke(prompt)
        return str(result)

    async def stream(self, prompt: str, temperature: float = 0.2) -> AsyncIterator[str]:
        llm = self._get_llm()
        llm.temperature = temperature
        async for chunk in llm.astream(prompt):
            yield str(chunk)

    def embed(self, texts: List[str]) -> List[List[float]]:
        embeddings = self._get_embeddings()
        return embeddings.embed_documents(texts)

    def embed_query(self, text: str) -> List[float]:
        embeddings = self._get_embeddings()
        return embeddings.embed_query(text)


# ──────────────────────────────────────────────────────────────
# OpenAI Provider
# ──────────────────────────────────────────────────────────────


class OpenAIProvider(BaseLLMProvider):
    """OpenAI LLM provider."""

    provider_name = "openai"

    def __init__(self, api_key: Optional[str] = None):
        self.api_key = api_key or settings.OPENAI_API_KEY
        if not self.api_key:
            raise ValueError("OPENAI_API_KEY is required for OpenAIProvider")

        self._client = None
        self._async_client = None

    def _get_client(self) -> Any:
        if self._client is None:
            try:
                import openai
                self._client = openai.OpenAI(api_key=self.api_key)
            except ImportError:
                raise ImportError("Install 'openai' package: pip install openai")
        return self._client

    def _get_async_client(self) -> Any:
        if self._async_client is None:
            try:
                import openai
                self._async_client = openai.AsyncOpenAI(api_key=self.api_key)
            except ImportError:
                raise ImportError("Install 'openai' package: pip install openai")
        return self._async_client

    async def generate(self, prompt: str, temperature: float = 0.2) -> str:
        client = self._get_async_client()
        response = await client.chat.completions.create(
            model="gpt-4o-mini",
            messages=[{"role": "user", "content": prompt}],
            temperature=temperature,
        )
        return response.choices[0].message.content or ""

    async def stream(self, prompt: str, temperature: float = 0.2) -> AsyncIterator[str]:
        client = self._get_async_client()
        stream = await client.chat.completions.create(
            model="gpt-4o-mini",
            messages=[{"role": "user", "content": prompt}],
            temperature=temperature,
            stream=True,
        )
        async for chunk in stream:
            delta = chunk.choices[0].delta.content
            if delta:
                yield delta

    def embed(self, texts: List[str]) -> List[List[float]]:
        client = self._get_client()
        response = client.embeddings.create(
            model="text-embedding-3-small",
            input=texts,
        )
        return [item.embedding for item in response.data]

    def embed_query(self, text: str) -> List[float]:
        return self.embed([text])[0]


# ──────────────────────────────────────────────────────────────
# Anthropic Provider
# ──────────────────────────────────────────────────────────────


class AnthropicProvider(BaseLLMProvider):
    """Anthropic Claude LLM provider."""

    provider_name = "anthropic"

    def __init__(self, api_key: Optional[str] = None):
        self.api_key = api_key or settings.ANTHROPIC_API_KEY
        if not self.api_key:
            raise ValueError("ANTHROPIC_API_KEY is required for AnthropicProvider")

        self._client = None
        self._async_client = None

    def _get_async_client(self) -> Any:
        if self._async_client is None:
            try:
                import anthropic
                self._async_client = anthropic.AsyncAnthropic(api_key=self.api_key)
            except ImportError:
                raise ImportError("Install 'anthropic' package: pip install anthropic")
        return self._async_client

    async def generate(self, prompt: str, temperature: float = 0.2) -> str:
        client = self._get_async_client()
        response = await client.messages.create(
            model="claude-3-5-sonnet-20241022",
            max_tokens=4096,
            temperature=temperature,
            messages=[{"role": "user", "content": prompt}],
        )
        return response.content[0].text

    async def stream(self, prompt: str, temperature: float = 0.2) -> AsyncIterator[str]:
        client = self._get_async_client()
        async with client.messages.stream(
            model="claude-3-5-sonnet-20241022",
            max_tokens=4096,
            temperature=temperature,
            messages=[{"role": "user", "content": prompt}],
        ) as stream:
            async for text in stream.text_stream:
                yield text

    def embed(self, texts: List[str]) -> List[List[float]]:
        # Anthropic doesn't have embeddings — fall back to Gemini embeddings
        logger.warning("Anthropic does not support embeddings. Falling back to Gemini.")
        fallback = GeminiProvider()
        return fallback.embed(texts)

    def embed_query(self, text: str) -> List[float]:
        logger.warning("Anthropic does not support embeddings. Falling back to Gemini.")
        fallback = GeminiProvider()
        return fallback.embed_query(text)


# ──────────────────────────────────────────────────────────────
# Provider Factory
# ──────────────────────────────────────────────────────────────

_PROVIDERS = {
    "gemini": GeminiProvider,
    "openai": OpenAIProvider,
    "anthropic": AnthropicProvider,
}

_provider_cache: dict[str, BaseLLMProvider] = {}


class LLMProviderFactory:
    """Factory for creating LLM provider instances with caching."""

    @staticmethod
    def create(provider_name: str, api_key: Optional[str] = None) -> BaseLLMProvider:
        """Create or return cached LLM provider instance."""
        cache_key = f"{provider_name}:{api_key or 'default'}"

        if cache_key in _provider_cache:
            return _provider_cache[cache_key]

        provider_class = _PROVIDERS.get(provider_name.lower())
        if not provider_class:
            raise ValueError(
                f"Unknown LLM provider: '{provider_name}'. "
                f"Available: {', '.join(_PROVIDERS.keys())}"
            )

        try:
            instance = provider_class(api_key=api_key)
            _provider_cache[cache_key] = instance
            logger.info(f"Created LLM provider: {provider_name}")
            return instance
        except (ValueError, ImportError) as e:
            logger.error(f"Failed to create {provider_name} provider: {e}")
            raise

    @staticmethod
    def get_default() -> BaseLLMProvider:
        """Get the default provider from settings."""
        return LLMProviderFactory.create(settings.DEFAULT_LLM_PROVIDER)

    @staticmethod
    def get_available_providers() -> List[str]:
        """Return list of providers that have API keys configured."""
        available = []
        if settings.GOOGLE_API_KEY:
            available.append("gemini")
        if settings.OPENAI_API_KEY:
            available.append("openai")
        if settings.ANTHROPIC_API_KEY:
            available.append("anthropic")
        return available
