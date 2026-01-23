# Re-ranker Module for Enhanced RAG Quality
# Implements cross-encoder re-ranking for improved retrieval precision

import logging
from typing import List, Tuple, Optional
from dataclasses import dataclass

logger = logging.getLogger("CodeRAG.Reranker")

# Flag to track if sentence-transformers is available
_SENTENCE_TRANSFORMERS_AVAILABLE = False
_reranker_model = None

try:
    from sentence_transformers import CrossEncoder
    _SENTENCE_TRANSFORMERS_AVAILABLE = True
except ImportError:
    logger.warning(
        "sentence-transformers not installed. Re-ranking will be disabled. "
        "Install with: pip install sentence-transformers"
    )


@dataclass
class RankedDocument:
    """A document with its re-ranking score."""
    content: str
    metadata: dict
    original_score: float
    rerank_score: float
    final_rank: int


def get_reranker(model_name: str = "cross-encoder/ms-marco-MiniLM-L-6-v2"):
    """
    Get or create a cross-encoder re-ranker model.
    
    Uses a lightweight model by default for fast inference.
    Other options:
    - cross-encoder/ms-marco-MiniLM-L-12-v2 (more accurate, slower)
    - cross-encoder/ms-marco-TinyBERT-L-2-v2 (fastest, less accurate)
    """
    global _reranker_model
    
    if not _SENTENCE_TRANSFORMERS_AVAILABLE:
        return None
    
    if _reranker_model is None:
        try:
            logger.info(f"🔄 Loading re-ranker model: {model_name}")
            _reranker_model = CrossEncoder(model_name, max_length=512)
            logger.info("✅ Re-ranker model loaded")
        except Exception as e:
            logger.error(f"❌ Failed to load re-ranker: {e}")
            return None
    
    return _reranker_model


def rerank_documents(
    query: str,
    documents: List[Tuple[str, dict, float]],  # (content, metadata, score)
    top_k: int = 5,
    min_score: float = 0.0
) -> List[RankedDocument]:
    """
    Re-rank documents using cross-encoder.
    
    Args:
        query: The search query
        documents: List of (content, metadata, original_score) tuples
        top_k: Number of top documents to return
        min_score: Minimum re-rank score threshold
    
    Returns:
        List of RankedDocument sorted by rerank_score
    """
    if not documents:
        return []
    
    reranker = get_reranker()
    
    if reranker is None:
        # Fallback: return documents sorted by original score
        logger.debug("Re-ranker not available, using original scores")
        return [
            RankedDocument(
                content=doc[0],
                metadata=doc[1],
                original_score=doc[2],
                rerank_score=doc[2],
                final_rank=i + 1
            )
            for i, doc in enumerate(sorted(documents, key=lambda x: x[2], reverse=True)[:top_k])
        ]
    
    # Prepare query-document pairs for cross-encoder
    pairs = [(query, doc[0]) for doc in documents]
    
    try:
        # Get re-ranking scores
        scores = reranker.predict(pairs)
        
        # Combine with original data
        ranked = []
        for i, (content, metadata, orig_score) in enumerate(documents):
            ranked.append(RankedDocument(
                content=content,
                metadata=metadata,
                original_score=orig_score,
                rerank_score=float(scores[i]),
                final_rank=0  # Will be set after sorting
            ))
        
        # Sort by rerank score
        ranked.sort(key=lambda x: x.rerank_score, reverse=True)
        
        # Filter by min_score and assign ranks
        result = []
        for i, doc in enumerate(ranked):
            if doc.rerank_score >= min_score and len(result) < top_k:
                doc.final_rank = len(result) + 1
                result.append(doc)
        
        logger.debug(f"Re-ranked {len(documents)} documents, returning top {len(result)}")
        return result
        
    except Exception as e:
        logger.error(f"Re-ranking failed: {e}")
        # Fallback to original scores
        return [
            RankedDocument(
                content=doc[0],
                metadata=doc[1],
                original_score=doc[2],
                rerank_score=doc[2],
                final_rank=i + 1
            )
            for i, doc in enumerate(sorted(documents, key=lambda x: x[2], reverse=True)[:top_k])
        ]


def reciprocal_rank_fusion(
    rankings: List[List[Tuple[str, dict, float]]],
    k: int = 60,
    top_n: int = 10
) -> List[Tuple[str, dict, float]]:
    """
    Combine multiple rankings using Reciprocal Rank Fusion (RRF).
    
    RRF is a robust method for combining multiple ranked lists that
    works well regardless of the underlying scoring functions.
    
    Args:
        rankings: List of ranked lists, each containing (content, metadata, score) tuples
        k: RRF constant (default 60, as recommended in the original paper)
        top_n: Number of top results to return
    
    Returns:
        Combined ranked list with RRF scores
    """
    # Create a mapping of document content to accumulated RRF score
    rrf_scores: dict = {}
    doc_metadata: dict = {}
    
    for ranking in rankings:
        for rank, (content, metadata, _) in enumerate(ranking, start=1):
            # Use content as key (could also use a hash for efficiency)
            doc_key = content[:500]  # Truncate for key to avoid memory issues
            
            if doc_key not in rrf_scores:
                rrf_scores[doc_key] = 0.0
                doc_metadata[doc_key] = (content, metadata)
            
            # RRF formula: 1 / (k + rank)
            rrf_scores[doc_key] += 1.0 / (k + rank)
    
    # Sort by RRF score and return top_n
    sorted_docs = sorted(rrf_scores.items(), key=lambda x: x[1], reverse=True)[:top_n]
    
    return [
        (doc_metadata[key][0], doc_metadata[key][1], score)
        for key, score in sorted_docs
    ]


class HybridRetriever:
    """
    Hybrid retriever combining dense (FAISS) and sparse (BM25) retrieval.
    
    Uses RRF to combine rankings from both methods for better recall
    and precision than either method alone.
    """
    
    def __init__(
        self,
        faiss_retriever,
        bm25_retriever=None,
        use_reranking: bool = True,
        rerank_top_k: int = 5
    ):
        self.faiss_retriever = faiss_retriever
        self.bm25_retriever = bm25_retriever
        self.use_reranking = use_reranking
        self.rerank_top_k = rerank_top_k
    
    def retrieve(
        self,
        query: str,
        k: int = 10,
        fetch_k: int = 20
    ) -> List[Tuple[str, dict, float]]:
        """
        Retrieve documents using hybrid approach.
        
        Args:
            query: Search query
            k: Number of final results
            fetch_k: Number to fetch from each retriever before fusion
        
        Returns:
            List of (content, metadata, score) tuples
        """
        rankings = []
        
        # Dense retrieval (FAISS)
        try:
            faiss_docs = self.faiss_retriever.similarity_search_with_score(query, k=fetch_k)
            faiss_ranking = [
                (doc.page_content, doc.metadata, float(score))
                for doc, score in faiss_docs
            ]
            rankings.append(faiss_ranking)
            logger.debug(f"FAISS retrieved {len(faiss_ranking)} documents")
        except Exception as e:
            logger.error(f"FAISS retrieval failed: {e}")
        
        # Sparse retrieval (BM25) if available
        if self.bm25_retriever:
            try:
                bm25_docs = self.bm25_retriever.get_relevant_documents(query)[:fetch_k]
                bm25_ranking = [
                    (doc.page_content, doc.metadata, 1.0 / (i + 1))  # Rank-based score
                    for i, doc in enumerate(bm25_docs)
                ]
                rankings.append(bm25_ranking)
                logger.debug(f"BM25 retrieved {len(bm25_ranking)} documents")
            except Exception as e:
                logger.error(f"BM25 retrieval failed: {e}")
        
        # Combine using RRF
        if len(rankings) > 1:
            combined = reciprocal_rank_fusion(rankings, top_n=fetch_k)
        elif rankings:
            combined = rankings[0]
        else:
            return []
        
        # Optional re-ranking
        if self.use_reranking and _SENTENCE_TRANSFORMERS_AVAILABLE:
            ranked = rerank_documents(query, combined, top_k=k)
            return [
                (doc.content, doc.metadata, doc.rerank_score)
                for doc in ranked
            ]
        
        return combined[:k]
