# RAG Evaluation Module
# Provides tools for evaluating RAG pipeline quality

import logging
from typing import List, Dict, Optional, Any
from dataclasses import dataclass, field
from datetime import datetime, timezone
import json
import os

logger = logging.getLogger("CodeRAG.Evaluation")


@dataclass
class EvaluationResult:
    """Result of a single RAG evaluation."""
    query: str
    expected_answer: Optional[str]
    actual_answer: str
    retrieved_sources: List[Dict]
    
    # Metrics
    context_relevance: float = 0.0  # How relevant are retrieved docs to query
    answer_relevance: float = 0.0   # How relevant is answer to query
    faithfulness: float = 0.0       # Is answer grounded in retrieved docs
    source_coverage: float = 0.0    # Did we retrieve expected sources
    
    # Timing
    retrieval_time_ms: float = 0.0
    generation_time_ms: float = 0.0
    total_time_ms: float = 0.0
    
    # Metadata
    timestamp: datetime = field(default_factory=lambda: datetime.now(timezone.utc))
    repo_id: Optional[str] = None
    
    def to_dict(self) -> Dict:
        return {
            "query": self.query,
            "expected_answer": self.expected_answer,
            "actual_answer": self.actual_answer[:500] if self.actual_answer else None,
            "source_count": len(self.retrieved_sources),
            "metrics": {
                "context_relevance": self.context_relevance,
                "answer_relevance": self.answer_relevance,
                "faithfulness": self.faithfulness,
                "source_coverage": self.source_coverage,
            },
            "timing": {
                "retrieval_ms": self.retrieval_time_ms,
                "generation_ms": self.generation_time_ms,
                "total_ms": self.total_time_ms,
            },
            "timestamp": self.timestamp.isoformat(),
            "repo_id": self.repo_id,
        }


@dataclass
class EvaluationSuite:
    """A collection of test cases for RAG evaluation."""
    name: str
    test_cases: List[Dict] = field(default_factory=list)
    results: List[EvaluationResult] = field(default_factory=list)
    
    def add_test_case(
        self,
        query: str,
        expected_answer: Optional[str] = None,
        expected_sources: Optional[List[str]] = None,
        metadata: Optional[Dict] = None
    ):
        """Add a test case to the suite."""
        self.test_cases.append({
            "query": query,
            "expected_answer": expected_answer,
            "expected_sources": expected_sources or [],
            "metadata": metadata or {},
        })
    
    def get_summary(self) -> Dict:
        """Get summary statistics for the evaluation."""
        if not self.results:
            return {"status": "no results", "test_cases": len(self.test_cases)}
        
        return {
            "name": self.name,
            "total_tests": len(self.test_cases),
            "completed_tests": len(self.results),
            "average_metrics": {
                "context_relevance": sum(r.context_relevance for r in self.results) / len(self.results),
                "answer_relevance": sum(r.answer_relevance for r in self.results) / len(self.results),
                "faithfulness": sum(r.faithfulness for r in self.results) / len(self.results),
                "source_coverage": sum(r.source_coverage for r in self.results) / len(self.results),
            },
            "average_timing": {
                "retrieval_ms": sum(r.retrieval_time_ms for r in self.results) / len(self.results),
                "generation_ms": sum(r.generation_time_ms for r in self.results) / len(self.results),
                "total_ms": sum(r.total_time_ms for r in self.results) / len(self.results),
            },
        }


class RAGEvaluator:
    """
    Evaluator for RAG pipeline quality.
    
    Provides methods to:
    - Run evaluation suites against the RAG pipeline
    - Calculate relevance, faithfulness, and coverage metrics
    - Generate evaluation reports
    """
    
    def __init__(self, vector_db_path: str):
        self.vector_db_path = vector_db_path
        self._chain = None
    
    def _get_chain(self):
        """Lazy load the QA chain."""
        if self._chain is None:
            import rag_engine
            self._chain = rag_engine.get_cached_qa_chain(self.vector_db_path)
        return self._chain
    
    async def evaluate_query(
        self,
        query: str,
        expected_answer: Optional[str] = None,
        expected_sources: Optional[List[str]] = None
    ) -> EvaluationResult:
        """
        Evaluate a single query against the RAG pipeline.
        
        Returns metrics including relevance, faithfulness, and timing.
        """
        import time
        import rag_engine
        
        result = EvaluationResult(
            query=query,
            expected_answer=expected_answer,
            actual_answer="",
            retrieved_sources=[],
        )
        
        start_time = time.perf_counter()
        
        try:
            chain = self._get_chain()
            if not chain:
                result.actual_answer = "ERROR: Could not load QA chain"
                return result
            
            # Time retrieval and generation
            retrieval_start = time.perf_counter()
            response = await rag_engine.invoke_chain_with_retry(chain, {"question": query})
            generation_end = time.perf_counter()
            
            result.actual_answer = response.get("answer", "")
            
            # Extract sources
            if "source_documents" in response:
                result.retrieved_sources = [
                    {
                        "content": doc.page_content[:500],
                        "source": doc.metadata.get("source", ""),
                        "metadata": doc.metadata,
                    }
                    for doc in response["source_documents"]
                ]
            
            result.retrieval_time_ms = (generation_end - retrieval_start) * 1000 * 0.3  # Estimate
            result.generation_time_ms = (generation_end - retrieval_start) * 1000 * 0.7
            
            # Calculate metrics
            result.context_relevance = self._calculate_context_relevance(
                query, result.retrieved_sources
            )
            result.answer_relevance = self._calculate_answer_relevance(
                query, result.actual_answer
            )
            result.faithfulness = self._calculate_faithfulness(
                result.actual_answer, result.retrieved_sources
            )
            
            if expected_sources:
                result.source_coverage = self._calculate_source_coverage(
                    expected_sources, result.retrieved_sources
                )
            
        except Exception as e:
            logger.error(f"Evaluation error: {e}")
            result.actual_answer = f"ERROR: {str(e)}"
        
        result.total_time_ms = (time.perf_counter() - start_time) * 1000
        return result
    
    def _calculate_context_relevance(
        self,
        query: str,
        sources: List[Dict]
    ) -> float:
        """
        Calculate how relevant the retrieved sources are to the query.
        
        Uses keyword overlap as a simple heuristic.
        For production, use semantic similarity or LLM-as-judge.
        """
        if not sources:
            return 0.0
        
        query_words = set(query.lower().split())
        
        relevance_scores = []
        for source in sources:
            content = source.get("content", "").lower()
            content_words = set(content.split())
            
            # Calculate Jaccard similarity
            if content_words:
                overlap = len(query_words & content_words)
                union = len(query_words | content_words)
                relevance_scores.append(overlap / union if union > 0 else 0)
        
        return sum(relevance_scores) / len(relevance_scores) if relevance_scores else 0.0
    
    def _calculate_answer_relevance(
        self,
        query: str,
        answer: str
    ) -> float:
        """
        Calculate how relevant the answer is to the query.
        
        Uses keyword overlap as a simple heuristic.
        """
        if not answer:
            return 0.0
        
        query_words = set(query.lower().split())
        answer_words = set(answer.lower().split())
        
        # Check if key query terms appear in answer
        overlap = len(query_words & answer_words)
        relevance = overlap / len(query_words) if query_words else 0
        
        return min(relevance, 1.0)
    
    def _calculate_faithfulness(
        self,
        answer: str,
        sources: List[Dict]
    ) -> float:
        """
        Calculate whether the answer is grounded in the sources.
        
        Checks if answer sentences can be traced back to sources.
        """
        if not answer or not sources:
            return 0.0
        
        # Combine all source content
        source_text = " ".join(s.get("content", "") for s in sources).lower()
        
        # Check what fraction of answer words appear in sources
        answer_words = set(answer.lower().split())
        grounded_words = sum(1 for w in answer_words if w in source_text)
        
        return grounded_words / len(answer_words) if answer_words else 0.0
    
    def _calculate_source_coverage(
        self,
        expected_sources: List[str],
        actual_sources: List[Dict]
    ) -> float:
        """Calculate what fraction of expected sources were retrieved."""
        if not expected_sources:
            return 1.0
        
        retrieved_paths = {s.get("source", "") for s in actual_sources}
        
        covered = sum(
            1 for expected in expected_sources
            if any(expected in path for path in retrieved_paths)
        )
        
        return covered / len(expected_sources)
    
    async def run_suite(self, suite: EvaluationSuite) -> EvaluationSuite:
        """Run all test cases in an evaluation suite."""
        for test_case in suite.test_cases:
            result = await self.evaluate_query(
                query=test_case["query"],
                expected_answer=test_case.get("expected_answer"),
                expected_sources=test_case.get("expected_sources"),
            )
            suite.results.append(result)
        
        return suite
    
    def save_results(self, suite: EvaluationSuite, output_path: str):
        """Save evaluation results to a JSON file."""
        os.makedirs(os.path.dirname(output_path), exist_ok=True)
        
        data = {
            "suite_name": suite.name,
            "summary": suite.get_summary(),
            "results": [r.to_dict() for r in suite.results],
        }
        
        with open(output_path, "w") as f:
            json.dump(data, f, indent=2)
        
        logger.info(f"📊 Saved evaluation results to {output_path}")


# ============================================
# Pre-built Evaluation Suites
# ============================================

def create_basic_suite() -> EvaluationSuite:
    """Create a basic evaluation suite for CodeRAG."""
    suite = EvaluationSuite(name="Basic CodeRAG Evaluation")
    
    suite.add_test_case(
        query="How does authentication work in this codebase?",
        expected_sources=["auth.py"],
    )
    suite.add_test_case(
        query="What is the main entry point of the application?",
        expected_sources=["api.py", "main.py", "app.py"],
    )
    suite.add_test_case(
        query="How are database models defined?",
        expected_sources=["database.py", "models.py"],
    )
    suite.add_test_case(
        query="What API endpoints are available?",
        expected_sources=["routers/"],
    )
    suite.add_test_case(
        query="How is error handling implemented?",
        expected_sources=["errors.py", "middleware.py"],
    )
    
    return suite
