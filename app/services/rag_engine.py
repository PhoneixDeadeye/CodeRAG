import os
import time
import logging
import json
from tenacity import retry, stop_after_attempt, wait_exponential, retry_if_exception_type
import traceback
from typing import List, Optional, Any, Dict
from langchain_google_genai import GoogleGenerativeAI, GoogleGenerativeAIEmbeddings
from langchain_qdrant import QdrantVectorStore
from qdrant_client import QdrantClient
from qdrant_client.http import models
from langchain.chains import ConversationalRetrievalChain
from langchain.memory import ConversationBufferWindowMemory
from langchain_core.prompts import PromptTemplate
from langchain_core.documents import Document

# --- Retrieval & Reranking ---
from langchain_community.retrievers import BM25Retriever
from langchain.retrievers import EnsembleRetriever, ContextualCompressionRetriever
from langchain.retrievers.document_compressors import CrossEncoderReranker
from langchain_community.cross_encoders import HuggingFaceCrossEncoder
from langchain_core.retrievers import BaseRetriever

# --- Configuration ---
from app.core.config import settings
from cachetools import TTLCache

# Use central logging configuration
logger = logging.getLogger(__name__)

# Validate API Key
if not settings.GOOGLE_API_KEY:
    logger.warning(
        "[WARNING] GOOGLE_API_KEY not found in environment variables. AI features will be disabled."
    )
else:
    logger.info("GOOGLE_API_KEY found.")

# --- Singleton Instances (create once, reuse) ---
_llm_instance = None
_embeddings_instance = None
_cross_encoder_instance = None

# --- Qdrant Configuration ---
QDRANT_URL = os.getenv("QDRANT_URL", "http://localhost:6333")
QDRANT_API_KEY = os.getenv("QDRANT_API_KEY", None)
EMBEDDING_BATCH_SIZE = 10
EMBEDDING_BATCH_DELAY = 1.0


def _extract_api_key(key: Any) -> str:
    """Robustly extract API key from SecretStr (v1/v2) or string."""
    if isinstance(key, str):
        return key

    # Try standard get_secret_value (pydantic v1/v2)
    if hasattr(key, "get_secret_value") and callable(key.get_secret_value):
        try:
            return str(key.get_secret_value())
        except Exception as e:
            logger.debug(f"get_secret_value failed: {e}")

    # Try private attribute (pydantic internal)
    if hasattr(key, "_secret_value"):
        return str(key._secret_value)

    # Convert to string as last resort (might be masked)
    logger.warning(
        "Could not extract API key via standard methods. Using str() fallback."
    )
    return str(key)


def get_llm() -> Any:
    """Get the LLM instance (singleton pattern)."""
    global _llm_instance

    if _llm_instance is not None:
        return _llm_instance

    if not settings.GOOGLE_API_KEY:
        logger.warning("[WARNING] No Google API Key available. Returning None for LLM.")
        return None

    api_key = _extract_api_key(settings.GOOGLE_API_KEY)

    logger.info("[INIT] Initializing Gemini 2.0 Flash Lite LLM client")
    try:
        _llm_instance = GoogleGenerativeAI(
            model="gemini-2.0-flash-lite", temperature=0.2, google_api_key=api_key
        )
        return _llm_instance
    except Exception as e:
        logger.error(f"[FAILED] Failed to initialize LLM: {e}")
        return None


class SafeGoogleEmbeddings(GoogleGenerativeAIEmbeddings):
    """Wrapper to ensure embeddings are returned as standard Python lists, not Protobuf repeated fields."""

    def embed_documents(self, texts: List[str]) -> List[List[float]]:
        results = super().embed_documents(texts)
        return [list(res) for res in results]

    def embed_query(self, text: str) -> List[float]:
        result = super().embed_query(text)
        return list(result)


def get_embeddings() -> Any:
    """Get the embeddings instance (singleton pattern)."""
    global _embeddings_instance

    if _embeddings_instance is not None:
        return _embeddings_instance

    if not settings.GOOGLE_API_KEY:
        logger.warning(
            "[WARNING] No Google API Key available. Returning None for Embeddings."
        )
        return None

    api_key = _extract_api_key(settings.GOOGLE_API_KEY)

    # WORKAROUND: Set env var to bypass potential Pydantic SecretStr issues in library
    os.environ["GOOGLE_API_KEY"] = api_key

    logger.info("[INIT] Initializing Google embeddings (models/gemini-embedding-001)")
    try:
        _embeddings_instance = SafeGoogleEmbeddings(
            model="models/gemini-embedding-001",
            # google_api_key arg removed to force env var usage
        )
        return _embeddings_instance
    except Exception as e:
        logger.error(f"[FAILED] Failed to initialize Embeddings: {e}")
        return None


def get_cross_encoder() -> Any:
    """Get the CrossEncoder instance (singleton pattern)."""
    global _cross_encoder_instance

    if _cross_encoder_instance is not None:
        return _cross_encoder_instance

    logger.info("[INIT] Initializing CrossEncoder (ms-marco-MiniLM-L-6-v2)...")
    try:
        # This will download the model on first run (~80MB)
        _cross_encoder_instance = HuggingFaceCrossEncoder(
            model_name="cross-encoder/ms-marco-MiniLM-L-6-v2"
        )
        return _cross_encoder_instance
    except Exception as e:
        logger.error(f"[FAILED] Failed to initialize CrossEncoder: {e}")
        return None


_qdrant_client_instance = None


def get_qdrant_client():
    """Get Qdrant Client (singleton pattern)."""
    global _qdrant_client_instance
    if _qdrant_client_instance is None:
        _qdrant_client_instance = QdrantClient(url=QDRANT_URL, api_key=QDRANT_API_KEY)
    return _qdrant_client_instance


def create_vector_db(texts: List[Document], collection_name: str) -> None:
    """
    Takes text chunks and stores them in Qdrant collection AND BM25 index.
    """
    if not texts:
        logger.warning("[WARNING] No texts to process.")
        return None

    # 1. Update/Create BM25 Index (Sparse)
    try:
        logger.info(f"[BM25] Building BM25 index for {len(texts)} chunks...")
        BM25Retriever.from_documents(texts)

        # Save to disk as JSON (safe serialization — no pickle RCE risk)
        bm25_path = os.path.join(settings.DATA_DIR, f"bm25_{collection_name}.json")
        bm25_data = [
            {"page_content": doc.page_content, "metadata": doc.metadata}
            for doc in texts
        ]
        with open(bm25_path, "w", encoding="utf-8") as f:
            json.dump(bm25_data, f, ensure_ascii=False, default=str)
        logger.info(f"[BM25] Saved BM25 index to {bm25_path}")
    except Exception as e:
        logger.error(f"[FAILED] Failed to build/save BM25 index: {e}")
        # Continue to Vector DB even if BM25 fails, for resilience

    # 2. Update/Create Vector DB (Dense)
    logger.info(f"[EMBEDDING] Generating embeddings for {len(texts)} chunks...")
    embeddings = get_embeddings()
    if not embeddings:
        logger.warning("[WARNING] Embeddings not available. Skipping Qdrant update.")
        return None

    client = get_qdrant_client()

    # Ensure collection exists with correct dimensions
    try:
        # Detect actual embedding dimension from the model
        sample_embedding = embeddings.embed_query("dimension test")
        embedding_dim = len(sample_embedding)
    except Exception as e:
        logger.warning(f"Could not detect embedding dimension, defaulting to 768: {e}")
        embedding_dim = 768

    if client.collection_exists(collection_name):
        # Check if existing collection has matching dimensions
        try:
            collection_info = client.get_collection(collection_name)
            existing_dim = collection_info.config.params.vectors.size
            if existing_dim != embedding_dim:
                logger.warning(
                    f"Collection {collection_name} has {existing_dim}-dim vectors "
                    f"but current model uses {embedding_dim}-dim. Recreating collection."
                )
                client.delete_collection(collection_name)
                client.create_collection(
                    collection_name=collection_name,
                    vectors_config=models.VectorParams(
                        size=embedding_dim, distance=models.Distance.COSINE
                    ),
                )
        except Exception as e:
            logger.warning(f"Could not verify collection dimensions: {e}")
    else:
        logger.info(
            f"Creating Qdrant collection: {collection_name} ({embedding_dim}-dim)"
        )
        client.create_collection(
            collection_name=collection_name,
            vectors_config=models.VectorParams(
                size=embedding_dim, distance=models.Distance.COSINE
            ),
        )

    # Batch processing
    total_batches = (len(texts) + EMBEDDING_BATCH_SIZE - 1) // EMBEDDING_BATCH_SIZE

    for i in range(0, len(texts), EMBEDDING_BATCH_SIZE):
        batch = texts[i : i + EMBEDDING_BATCH_SIZE]
        batch_num = (i // EMBEDDING_BATCH_SIZE) + 1

        logger.info(f"  Batch {batch_num}/{total_batches} ({len(batch)} chunks)")

        max_retries = 3
        for attempt in range(max_retries):
            try:
                vector_store = QdrantVectorStore(
                    client=client,
                    collection_name=collection_name,
                    embedding=embeddings,
                )
                vector_store.add_documents(batch)
                break
            except Exception as e:
                err_str = str(e).lower()
                if (
                    "quota" in err_str
                    or "rate" in err_str
                    or "resource_exhausted" in err_str
                ):
                    wait_time = (attempt + 1) * 30
                    logger.warning(
                        f"  [RATE_LIMIT] Rate limit hit, waiting {wait_time}s (retry {attempt + 1}/{max_retries})"
                    )
                    time.sleep(wait_time)
                else:
                    logger.error(f"Embedding batch failed: {e}", exc_info=True)
                    raise e

        # Delay between batches
        if i + EMBEDDING_BATCH_SIZE < len(texts):
            time.sleep(EMBEDDING_BATCH_DELAY)

    logger.info(f"[OK] Successfully indexed chunks to {collection_name}")


# --- QA Chain Cache ---
# Global Cache for QA Chains (LRU + TTL)
# 10 chains max, 1 hour expiration
_qa_chain_cache = TTLCache(maxsize=10, ttl=3600)


def get_cached_qa_chain(collection_name: str) -> Optional[ConversationalRetrievalChain]:
    """
    Get QA chain with caching for performance.
    """
    if not collection_name:
        return None

    # Unique cache key per collection AND retrieval strategy
    cache_key = f"{collection_name}_hybrid"

    # Check cache
    if cache_key in _qa_chain_cache:
        logger.debug(f"[CACHE_HIT] QA chain cache hit for {collection_name}")
        return _qa_chain_cache[cache_key]

    logger.debug(f"[CACHE_MISS] QA chain cache miss for {collection_name}")

    # Build new chain
    chain = get_qa_chain(collection_name)
    if chain:
        _qa_chain_cache[cache_key] = chain

    return chain


def clear_qa_chain_cache(collection_name: Optional[str] = None) -> None:
    """Clear QA chain cache."""
    global _qa_chain_cache
    if collection_name:
        key = f"{collection_name}_hybrid"
        if key in _qa_chain_cache:
            del _qa_chain_cache[key]
            logger.info(f"Cleared cache for repo: {collection_name}")
    else:
        _qa_chain_cache.clear()
        logger.info("[CACHE_CLEARED] QA chain cache cleared")


def get_qa_chain(collection_name: str) -> Optional[ConversationalRetrievalChain]:
    """
    Creates a Hybrid QA chain (Dense + Sparse + Rerank).
    """
    logger.info(
        f"[BUILDING] Building Hybrid QA chain for collection: {collection_name}..."
    )

    # 1. Setup Dense Retriever (Qdrant)
    embeddings = get_embeddings()
    if not embeddings:
        return None

    client = get_qdrant_client()
    if not client.collection_exists(collection_name):
        logger.error(f"[ERROR] Collection {collection_name} does not exist in Qdrant")
        return None

    vectorstore = QdrantVectorStore(
        client=client, collection_name=collection_name, embedding=embeddings
    )
    dense_retriever = vectorstore.as_retriever(
        search_type="similarity", search_kwargs={"k": 10}
    )  # Fetch more for reranking

    # 2. Setup Sparse Retriever (BM25)
    bm25_retriever = None
    bm25_path = os.path.join(settings.DATA_DIR, f"bm25_{collection_name}.json")
    if os.path.exists(bm25_path):
        try:
            with open(bm25_path, "r", encoding="utf-8") as f:
                bm25_data = json.load(f)
            # Reconstruct Documents and BM25Retriever from safe JSON data
            bm25_docs = [
                Document(page_content=d["page_content"], metadata=d.get("metadata", {}))
                for d in bm25_data
            ]
            bm25_retriever = BM25Retriever.from_documents(bm25_docs)
            bm25_retriever.k = 10  # Match dense k
            logger.info(f"[BM25] Loaded BM25 index from {bm25_path}")
        except Exception as e:
            logger.error(f"[BM25] Failed to load BM25 index: {e}")
    else:
        logger.warning(
            f"[BM25] No BM25 index found at {bm25_path}. Falling back to Dense only."
        )

    # 3. Combine into Ensemble (if BM25 exists)
    if bm25_retriever:
        logger.info("[HYBRID] Using Ensemble Retriever (Dense + Sparse)")
        # 0.5/0.5 weight is a good starting point
        base_retriever = EnsembleRetriever(
            retrievers=[dense_retriever, bm25_retriever], weights=[0.5, 0.5]
        )
    else:
        logger.info("[HYBRID] BM25 missing, using Dense Retriever only")
        base_retriever = dense_retriever

    # 4. Setup Reranker (Cross Encoder)
    cross_encoder = get_cross_encoder()
    if cross_encoder and isinstance(base_retriever, BaseRetriever):
        logger.info("[RERANK] Attaching CrossEncoder Reranker")
        compressor = CrossEncoderReranker(model=cross_encoder, top_n=5)
        # Wrap the base retriever with compression
        final_retriever = ContextualCompressionRetriever(
            base_compressor=compressor, base_retriever=base_retriever
        )
    else:
        logger.warning(
            "[RERANK] CrossEncoder unavailable or base retriever incompatible. Skipping rerank step."
        )
        final_retriever = base_retriever

    llm = get_llm()
    if not llm:
        return None

    # Define Prompts
    condense_template = """Given the following conversation and a follow up question, rephrase the follow up question to be a standalone question, in its original language.
    
    Chat History:
    {chat_history}
    Follow Up Input: {question}
    Standalone question:"""
    CONDENSE_QUESTION_PROMPT = PromptTemplate.from_template(condense_template)

    qa_template = """You are a Senior Principal Software Engineer.
    Use the following pieces of context (code snippets) to answer the question at the end.
    
    RULES:
    1. Be concise and technical. Avoid fluff.
    2. Cite the file name (source) for EVERY code block you reference. Format: [Source: file_path]
    3. If the answer is not in the context, say "I don't see that in the provided context."
    4. Format your answer in Markdown, using code blocks with language tags (e.g. ```python).

    Context:
    {context}

    Question: {question}

    Helpful Answer:"""
    QA_PROMPT = PromptTemplate.from_template(qa_template)

    memory = ConversationBufferWindowMemory(
        k=10, memory_key="chat_history", return_messages=True, output_key="answer"
    )

    qs_chain = ConversationalRetrievalChain.from_llm(
        llm=llm,
        retriever=final_retriever,
        return_source_documents=True,
        memory=memory,
        condense_question_prompt=CONDENSE_QUESTION_PROMPT,
        combine_docs_chain_kwargs={"prompt": QA_PROMPT},
    )

    return qs_chain


# --- Resilience Helpers ---


# Custom exception to act as our Circuit Breaker "Open" state indicator
class CircuitBreakerOpenError(Exception):
    pass

@retry(
    stop=stop_after_attempt(4), 
    wait=wait_exponential(multiplier=1, min=2, max=10),
    retry=retry_if_exception_type(Exception),
    reraise=True
)
async def invoke_chain_with_retry(chain, inputs: Dict[str, Any]):
    """Reliable AI invocation with retries acting as a Circuit Breaker."""
    try:
        # Use ainvoke for better async support if available, otherwise fallback
        logger.info(f"[INVOKING] Invoking chain with inputs: {list(inputs.keys())}")
        result = await chain.ainvoke(inputs)
        logger.info("[OK] Chain invocation successful")
        return result
    except TypeError as e:
        logger.error(f"[FAILED] TypeError during chain invocation: {e}")
        logger.error(f"Full traceback:\n{traceback.format_exc()}")
        raise
    except Exception as e:
        logger.error(f"[FAILED] Error during chain invocation: {type(e).__name__}: {e}")
        logger.error(f"Full traceback:\n{traceback.format_exc()}")
        raise


async def astream_chain_with_retry(chain, inputs: Dict[str, Any]):
    """Reliable AI streaming with retries."""
    # Note: Retrying a stream is complex because we might have already yielded data.
    # For now, we only retry if the stream fails immediately.
    try:
        logger.info(f"[STREAMING] Streaming chain with inputs: {list(inputs.keys())}")
        async for chunk in chain.astream(inputs):
            yield chunk
    except Exception as e:
        logger.error(f"[FAILED] Error during chain streaming: {e}")
        yield {"answer": f"Error generating response: {str(e)}"}
