import time
import os
from collections import defaultdict
from typing import Dict, List
from fastapi import HTTPException, status

class RateLimiter:
    def __init__(self):
        # user_id -> list of timestamps
        self.requests: Dict[str, List[float]] = defaultdict(list)
        
    def cleanup_old_requests(self, window_seconds: int) -> None:
        """Remove expired requests to prevent memory leaks."""
        now = time.time()
        for user_id in list(self.requests.keys()):
            user_requests = self.requests[user_id]
            # Remove old requests
            self.requests[user_id] = [req for req in user_requests if req >= now - window_seconds]
            # Remove empty entries
            if not self.requests[user_id]:
                del self.requests[user_id]
        
    def is_allowed(self, user_id: str, limit: int, window_seconds: int) -> bool:
        # Periodic cleanup (every 100 requests)
        if sum(len(reqs) for reqs in self.requests.values()) % 100 == 0:
            self.cleanup_old_requests(window_seconds)
        
        now = time.time()
        user_requests = self.requests[user_id]
        
        # Remove old requests
        while user_requests and user_requests[0] < now - window_seconds:
            user_requests.pop(0)
            
        if len(user_requests) >= limit:
            return False
            
        user_requests.append(now)
        return True
    
    def get_remaining(self, user_id: str, limit: int, window_seconds: int) -> int:
        """Get remaining requests for a user."""
        now = time.time()
        user_requests = self.requests.get(user_id, [])
        
        # Count valid requests within window
        valid_requests = [req for req in user_requests if req >= now - window_seconds]
        return max(0, limit - len(valid_requests))

# Global instances
chat_limiter = RateLimiter()
ingest_limiter = RateLimiter()

# Configuration from environment
CHAT_RATE_LIMIT = int(os.getenv("CHAT_RATE_LIMIT", "50"))
INGEST_RATE_LIMIT = int(os.getenv("INGEST_RATE_LIMIT", "5"))
RATE_LIMIT_WINDOW = 3600  # 1 hour in seconds

def check_chat_limit(user_id: str) -> None:
    """Check if user has exceeded chat rate limit."""
    if not chat_limiter.is_allowed(user_id, limit=CHAT_RATE_LIMIT, window_seconds=RATE_LIMIT_WINDOW):
        remaining = chat_limiter.get_remaining(user_id, CHAT_RATE_LIMIT, RATE_LIMIT_WINDOW)
        raise HTTPException(
            status_code=status.HTTP_429_TOO_MANY_REQUESTS,
            detail=f"Chat rate limit exceeded ({CHAT_RATE_LIMIT} requests/hour). Please try again later.",
            headers={"X-RateLimit-Remaining": str(remaining)}
        )

def check_ingest_limit(user_id: str) -> None:
    """Check if user has exceeded ingestion rate limit."""
    if not ingest_limiter.is_allowed(user_id, limit=INGEST_RATE_LIMIT, window_seconds=RATE_LIMIT_WINDOW):
        remaining = ingest_limiter.get_remaining(user_id, INGEST_RATE_LIMIT, RATE_LIMIT_WINDOW)
        raise HTTPException(
            status_code=status.HTTP_429_TOO_MANY_REQUESTS,
            detail=f"Ingestion rate limit exceeded ({INGEST_RATE_LIMIT} repos/hour). Please try again later.",
            headers={"X-RateLimit-Remaining": str(remaining)}
        )
