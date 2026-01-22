import os
import pickle
import time
from functools import lru_cache
from typing import Optional, List, Any, Dict, Tuple
from langchain_google_genai import GoogleGenerativeAI, GoogleGenerativeAIEmbeddings
from langchain_community.vectorstores import FAISS
from langchain.prompts import PromptTemplate
from langchain.retrievers import EnsembleRetriever
from langchain_community.retrievers import BM25Retriever
from langchain.chains import ConversationalRetrievalChain
from langchain.memory import ConversationBufferMemory
from langchain.schema import Document

# --- Configuration ---
from config import settings

import logging

# Use central logging configuration
logger = logging.getLogger(__name__)

# Validate API Key
if not settings.GOOGLE_API_KEY:
    logger.error("❌ GOOGLE_API_KEY not found in environment variables.")
    raise EnvironmentError("GOOGLE_API_KEY is required for Gemini API access.")

# --- Singleton Instances (create once, reuse) ---
_llm_instance = None
_embeddings_instance = None

# --- Batch Embedding Configuration ---
EMBEDDING_BATCH_SIZE = 50
EMBEDDING_BATCH_DELAY = 1.0


def get_llm() -> Any:
    """Get the LLM instance (singleton pattern)."""
    global _llm_instance
    
    if _llm_instance is not None:
        return _llm_instance
    
    logger.info("🔧 Initializing Gemini 2.0 Flash Lite LLM client")
    _llm_instance = GoogleGenerativeAI(
        model="gemini-2.0-flash-lite",
        temperature=0.2,
        google_api_key=settings.GOOGLE_API_KEY
    )
    return _llm_instance


def get_embeddings() -> Any:
    """Get the embeddings instance (singleton pattern)."""
    global _embeddings_instance
    
    if _embeddings_instance is not None:
        return _embeddings_instance
    
    logger.info("🔧 Initializing Google embeddings (text-embedding-004)")
    _embeddings_instance = GoogleGenerativeAIEmbeddings(
        model="models/text-embedding-004",
        google_api_key=settings.GOOGLE_API_KEY
    )
    return _embeddings_instance


def create_vector_db(texts: List[Document], output_path: str) -> Optional[FAISS]:
    """
    Takes text chunks and stores them in FAISS at output_path.
    """
    if not texts:
        logger.warning("❌ No texts to process.")
        return None

    logger.info(f"🧠 Generating embeddings for {len(texts)} chunks...")
    embeddings = get_embeddings()
    
    # Ensure output directory exists
    os.makedirs(output_path, exist_ok=True)
    
    # Batch processing for large repos
    if len(texts) > EMBEDDING_BATCH_SIZE:
        logger.info(f"📦 Processing in batches of {EMBEDDING_BATCH_SIZE} with {EMBEDDING_BATCH_DELAY}s delay...")
        
        db = None
        for i in range(0, len(texts), EMBEDDING_BATCH_SIZE):
            batch = texts[i:i + EMBEDDING_BATCH_SIZE]
            batch_num = (i // EMBEDDING_BATCH_SIZE) + 1
            total_batches = (len(texts) + EMBEDDING_BATCH_SIZE - 1) // EMBEDDING_BATCH_SIZE
            
            logger.info(f"  → Batch {batch_num}/{total_batches} ({len(batch)} chunks)")
            
            max_retries = 3
            for attempt in range(max_retries):
                try:
                    if db is None:
                        db = FAISS.from_documents(batch, embeddings)
                    else:
                        batch_db = FAISS.from_documents(batch, embeddings)
                        db.merge_from(batch_db)
                    break
                except Exception as e:
                    err_str = str(e).lower()
                    if 'quota' in err_str or 'rate' in err_str or 'resource_exhausted' in err_str:
                        wait_time = (attempt + 1) * 30
                        logger.warning(f"  ⏳ Rate limit hit, waiting {wait_time}s (retry {attempt + 1}/{max_retries})")
                        time.sleep(wait_time)
                    else:
                        raise e
            
            # Delay between batches
            if i + EMBEDDING_BATCH_SIZE < len(texts):
                time.sleep(EMBEDDING_BATCH_DELAY)
    else:
        # Small repo - process all at once
        max_retries = 3
        for attempt in range(max_retries):
            try:
                db = FAISS.from_documents(texts, embeddings)
                break
            except Exception as e:
                err_str = str(e).lower()
                if 'quota' in err_str or 'rate' in err_str or 'resource_exhausted' in err_str:
                    wait_time = (attempt + 1) * 30
                    logger.warning(f"⏳ Rate limit hit, waiting {wait_time}s (retry {attempt + 1}/{max_retries})")
                    time.sleep(wait_time)
                else:
                    raise e
        else:
            raise Exception("Failed after multiple retries due to quota limits")
    
    # Save database
    db.save_local(output_path)
    
    # Save texts for BM25 retriever (alongside vector db)
    texts_path = os.path.join(output_path, "texts.pkl")
    with open(texts_path, 'wb') as f:
        pickle.dump(texts, f)
    
    logger.info(f"✅ Vector database saved to {output_path}")
    
    return db


# --- QA Chain Cache ---
_qa_chain_cache: Dict[str, Tuple[Any, float]] = {}
QA_CHAIN_CACHE_TTL = 3600  # 1 hour TTL for cached chains
QA_CHAIN_CACHE_MAX_SIZE = 10  # Max number of cached chains to prevent memory bloat


def get_cached_qa_chain(vector_db_path: str) -> Optional[ConversationalRetrievalChain]:
    """
    Get QA chain with caching for performance.
    Caches chains with TTL to avoid rebuilding for the same repo.
    Uses LRU eviction when cache is full.
    """
    current_time = time.time()
    
    # Check cache
    if vector_db_path in _qa_chain_cache:
        chain, cached_at = _qa_chain_cache[vector_db_path]
        if current_time - cached_at < QA_CHAIN_CACHE_TTL:
            logger.debug(f"✅ QA chain cache hit for {vector_db_path}")
            # Update timestamp to implement LRU behavior
            _qa_chain_cache[vector_db_path] = (chain, current_time)
            return chain
        else:
            logger.debug(f"⏰ QA chain cache expired for {vector_db_path}")
            del _qa_chain_cache[vector_db_path]
    
    # Build new chain
    chain = get_qa_chain(vector_db_path)
    if chain:
        # Enforce max cache size with LRU eviction
        if len(_qa_chain_cache) >= QA_CHAIN_CACHE_MAX_SIZE:
            # Remove oldest entry
            oldest_key = min(_qa_chain_cache.keys(), key=lambda k: _qa_chain_cache[k][1])
            del _qa_chain_cache[oldest_key]
            logger.info(f"♻️ Evicted oldest cache entry: {oldest_key}")
        
        _qa_chain_cache[vector_db_path] = (chain, current_time)
        logger.info(f"💾 Cached QA chain for {vector_db_path} (cache size: {len(_qa_chain_cache)})")
    
    return chain


def clear_qa_chain_cache(vector_db_path: Optional[str] = None) -> None:
    """Clear QA chain cache. If path specified, only clear that path."""
    global _qa_chain_cache
    if vector_db_path:
        _qa_chain_cache.pop(vector_db_path, None)
    else:
        _qa_chain_cache.clear()
    logger.info("🗑️ QA chain cache cleared")


def get_qa_chain(vector_db_path: str) -> Optional[ConversationalRetrievalChain]:
    """
    Creates a QA chain for a specific vector database path.
    """
    logger.info(f"🔧 Building QA chain for {vector_db_path}...")
    
    if not os.path.exists(vector_db_path):
        logger.warning(f"⚠️ No database found at {vector_db_path}")
        return None

    # 1. Load Embeddings (cached)
    embeddings = get_embeddings()
    
    # 2. Load Vector DB
    try:
        db = FAISS.load_local(vector_db_path, embeddings, allow_dangerous_deserialization=True)
    except Exception as e:
        logger.error(f"⚠️ Error loading FAISS DB: {e}")
        return None

    # 3. Setup HYBRID Retriever (BM25 + FAISS)
    try:
        texts_path = os.path.join(vector_db_path, "texts.pkl")
        with open(texts_path, 'rb') as f:
            texts = pickle.load(f)
        
        bm25_retriever = BM25Retriever.from_documents(texts)
        bm25_retriever.k = 5
        
        faiss_retriever = db.as_retriever(search_type="mmr", search_kwargs={'k': 5, 'fetch_k': 20})
        
        retriever = EnsembleRetriever(
            retrievers=[bm25_retriever, faiss_retriever],
            weights=[0.4, 0.6]
        )
        logger.info("🔀 Using HYBRID search (BM25 + FAISS)")
    except Exception as e:
        logger.warning(f"⚠️ BM25 feature not available, using FAISS only: {e}")
        retriever = db.as_retriever(search_type="mmr", search_kwargs={'k': 5, 'fetch_k': 20})

    # 4. Get LLM (cached)
    llm = get_llm()

    # 5. Define Prompts
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

    # 6. Build the Conversational Chain
    memory = ConversationBufferMemory(
        memory_key="chat_history",
        return_messages=True,
        output_key='answer'
    )

    qs_chain = ConversationalRetrievalChain.from_llm(
        llm=llm,
        retriever=retriever,
        return_source_documents=True,
        memory=memory,
        condense_question_prompt=CONDENSE_QUESTION_PROMPT,
        combine_docs_chain_kwargs={"prompt": QA_PROMPT}
    )
    
    return qs_chain

# --- Resilience Helpers ---
from tenacity import retry, stop_after_attempt, wait_exponential
import asyncio
import traceback

@retry(stop=stop_after_attempt(3), wait=wait_exponential(multiplier=1, min=4, max=10))
async def invoke_chain_with_retry(chain, inputs: Dict[str, Any]):
    """Reliable AI invocation with retries.
    
    Uses asyncio.to_thread() because ConversationalRetrievalChain's ainvoke()
    doesn't work properly with GoogleGenerativeAI - it raises TypeError.
    """
    try:
        # Run synchronous invoke in a thread to avoid blocking
        logger.info(f"🔄 Invoking chain with inputs: {list(inputs.keys())}")
        result = await asyncio.to_thread(chain.invoke, inputs)
        logger.info("✅ Chain invocation successful")
        return result
    except TypeError as e:
        logger.error(f"❌ TypeError during chain invocation: {e}")
        logger.error(f"Full traceback:\n{traceback.format_exc()}")
        raise
    except Exception as e:
        logger.error(f"❌ Error during chain invocation: {type(e).__name__}: {e}")
        logger.error(f"Full traceback:\n{traceback.format_exc()}")
        raise


