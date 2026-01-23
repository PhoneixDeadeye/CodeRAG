# Prometheus Metrics Module
# Provides observability for the CodeRAG application

import time
import logging
from typing import Callable, Optional
from functools import wraps
from dataclasses import dataclass, field
from collections import defaultdict
from datetime import datetime, timezone
import threading

logger = logging.getLogger("CodeRAG.Metrics")


@dataclass
class MetricValue:
    """A single metric value with labels."""
    name: str
    value: float
    labels: dict = field(default_factory=dict)
    timestamp: datetime = field(default_factory=lambda: datetime.now(timezone.utc))
    
    def to_prometheus_line(self) -> str:
        """Format as Prometheus exposition format."""
        if self.labels:
            label_str = ",".join(f'{k}="{v}"' for k, v in self.labels.items())
            return f"{self.name}{{{label_str}}} {self.value}"
        return f"{self.name} {self.value}"


class Counter:
    """A monotonically increasing counter metric."""
    
    def __init__(self, name: str, description: str):
        self.name = name
        self.description = description
        self._values: dict = defaultdict(float)
        self._lock = threading.Lock()
    
    def inc(self, amount: float = 1.0, **labels):
        """Increment the counter."""
        key = tuple(sorted(labels.items()))
        with self._lock:
            self._values[key] += amount
    
    def get_values(self) -> list:
        """Get all counter values."""
        with self._lock:
            return [
                MetricValue(self.name, value, dict(key))
                for key, value in self._values.items()
            ]
    
    def to_prometheus(self) -> str:
        """Export in Prometheus format."""
        lines = [f"# HELP {self.name} {self.description}", f"# TYPE {self.name} counter"]
        for mv in self.get_values():
            lines.append(mv.to_prometheus_line())
        return "\n".join(lines)


class Gauge:
    """A metric that can go up and down."""
    
    def __init__(self, name: str, description: str):
        self.name = name
        self.description = description
        self._values: dict = defaultdict(float)
        self._lock = threading.Lock()
    
    def set(self, value: float, **labels):
        """Set the gauge value."""
        key = tuple(sorted(labels.items()))
        with self._lock:
            self._values[key] = value
    
    def inc(self, amount: float = 1.0, **labels):
        """Increment the gauge."""
        key = tuple(sorted(labels.items()))
        with self._lock:
            self._values[key] += amount
    
    def dec(self, amount: float = 1.0, **labels):
        """Decrement the gauge."""
        key = tuple(sorted(labels.items()))
        with self._lock:
            self._values[key] -= amount
    
    def get_values(self) -> list:
        """Get all gauge values."""
        with self._lock:
            return [
                MetricValue(self.name, value, dict(key))
                for key, value in self._values.items()
            ]
    
    def to_prometheus(self) -> str:
        """Export in Prometheus format."""
        lines = [f"# HELP {self.name} {self.description}", f"# TYPE {self.name} gauge"]
        for mv in self.get_values():
            lines.append(mv.to_prometheus_line())
        return "\n".join(lines)


class Histogram:
    """A histogram metric for measuring distributions."""
    
    DEFAULT_BUCKETS = (0.005, 0.01, 0.025, 0.05, 0.1, 0.25, 0.5, 1, 2.5, 5, 10, float("inf"))
    
    def __init__(self, name: str, description: str, buckets: tuple = None):
        self.name = name
        self.description = description
        self.buckets = buckets or self.DEFAULT_BUCKETS
        self._counts: dict = defaultdict(lambda: defaultdict(int))
        self._sums: dict = defaultdict(float)
        self._totals: dict = defaultdict(int)
        self._lock = threading.Lock()
    
    def observe(self, value: float, **labels):
        """Record an observation."""
        key = tuple(sorted(labels.items()))
        with self._lock:
            self._sums[key] += value
            self._totals[key] += 1
            for bucket in self.buckets:
                if value <= bucket:
                    self._counts[key][bucket] += 1
    
    def time(self, **labels):
        """Context manager for timing operations."""
        return _HistogramTimer(self, labels)
    
    def to_prometheus(self) -> str:
        """Export in Prometheus format."""
        lines = [f"# HELP {self.name} {self.description}", f"# TYPE {self.name} histogram"]
        
        with self._lock:
            for key in self._counts.keys():
                labels = dict(key)
                label_str = ",".join(f'{k}="{v}"' for k, v in labels.items()) if labels else ""
                
                # Bucket values (cumulative)
                cumulative = 0
                for bucket in sorted(b for b in self.buckets if b != float("inf")):
                    cumulative += self._counts[key].get(bucket, 0)
                    bucket_labels = f'{label_str},le="{bucket}"' if label_str else f'le="{bucket}"'
                    lines.append(f"{self.name}_bucket{{{bucket_labels}}} {cumulative}")
                
                # +Inf bucket
                cumulative += self._counts[key].get(float("inf"), 0)
                inf_labels = f'{label_str},le="+Inf"' if label_str else 'le="+Inf"'
                lines.append(f"{self.name}_bucket{{{inf_labels}}} {cumulative}")
                
                # Sum and count
                if label_str:
                    lines.append(f"{self.name}_sum{{{label_str}}} {self._sums[key]}")
                    lines.append(f"{self.name}_count{{{label_str}}} {self._totals[key]}")
                else:
                    lines.append(f"{self.name}_sum {self._sums[key]}")
                    lines.append(f"{self.name}_count {self._totals[key]}")
        
        return "\n".join(lines)


class _HistogramTimer:
    """Context manager for timing histogram observations."""
    
    def __init__(self, histogram: Histogram, labels: dict):
        self.histogram = histogram
        self.labels = labels
        self.start = None
    
    def __enter__(self):
        self.start = time.perf_counter()
        return self
    
    def __exit__(self, *args):
        duration = time.perf_counter() - self.start
        self.histogram.observe(duration, **self.labels)


class MetricsRegistry:
    """Central registry for all application metrics."""
    
    def __init__(self):
        self._metrics: dict = {}
        self._lock = threading.Lock()
    
    def register(self, metric) -> None:
        """Register a metric."""
        with self._lock:
            self._metrics[metric.name] = metric
    
    def counter(self, name: str, description: str) -> Counter:
        """Create and register a counter."""
        with self._lock:
            if name not in self._metrics:
                self._metrics[name] = Counter(name, description)
            return self._metrics[name]
    
    def gauge(self, name: str, description: str) -> Gauge:
        """Create and register a gauge."""
        with self._lock:
            if name not in self._metrics:
                self._metrics[name] = Gauge(name, description)
            return self._metrics[name]
    
    def histogram(self, name: str, description: str, buckets: tuple = None) -> Histogram:
        """Create and register a histogram."""
        with self._lock:
            if name not in self._metrics:
                self._metrics[name] = Histogram(name, description, buckets)
            return self._metrics[name]
    
    def export_prometheus(self) -> str:
        """Export all metrics in Prometheus format."""
        with self._lock:
            return "\n\n".join(m.to_prometheus() for m in self._metrics.values())


# ============================================
# Global Registry and Application Metrics
# ============================================

registry = MetricsRegistry()

# Request metrics
http_requests_total = registry.counter(
    "coderag_http_requests_total",
    "Total HTTP requests"
)

http_request_duration_seconds = registry.histogram(
    "coderag_http_request_duration_seconds",
    "HTTP request duration in seconds",
    buckets=(0.01, 0.05, 0.1, 0.25, 0.5, 1.0, 2.5, 5.0, 10.0, float("inf"))
)

http_requests_in_flight = registry.gauge(
    "coderag_http_requests_in_flight",
    "Number of HTTP requests currently being processed"
)

# Chat/LLM metrics
llm_requests_total = registry.counter(
    "coderag_llm_requests_total",
    "Total LLM API requests"
)

llm_request_duration_seconds = registry.histogram(
    "coderag_llm_request_duration_seconds",
    "LLM request duration in seconds",
    buckets=(0.5, 1.0, 2.0, 5.0, 10.0, 30.0, 60.0, float("inf"))
)

llm_tokens_total = registry.counter(
    "coderag_llm_tokens_total",
    "Total LLM tokens processed"
)

# Ingestion metrics
ingestion_jobs_total = registry.counter(
    "coderag_ingestion_jobs_total",
    "Total ingestion jobs started"
)

ingestion_duration_seconds = registry.histogram(
    "coderag_ingestion_duration_seconds",
    "Repository ingestion duration in seconds",
    buckets=(5.0, 10.0, 30.0, 60.0, 120.0, 300.0, 600.0, float("inf"))
)

ingestion_chunks_total = registry.counter(
    "coderag_ingestion_chunks_total",
    "Total code chunks indexed"
)

# Active resources
active_users = registry.gauge(
    "coderag_active_users",
    "Number of active users (sessions in last hour)"
)

repositories_total = registry.gauge(
    "coderag_repositories_total",
    "Total number of repositories"
)

active_jobs = registry.gauge(
    "coderag_active_jobs",
    "Number of active background jobs"
)


# ============================================
# Middleware for Automatic Request Metrics
# ============================================

class PrometheusMiddleware:
    """ASGI middleware for automatic request metrics."""
    
    def __init__(self, app):
        self.app = app
    
    async def __call__(self, scope, receive, send):
        if scope["type"] != "http":
            await self.app(scope, receive, send)
            return
        
        method = scope.get("method", "UNKNOWN")
        path = scope.get("path", "/")
        
        # Normalize path to avoid cardinality explosion
        normalized_path = self._normalize_path(path)
        
        http_requests_in_flight.inc(method=method, path=normalized_path)
        start = time.perf_counter()
        
        status_code = 500  # Default in case of unhandled exception
        
        async def send_wrapper(message):
            nonlocal status_code
            if message["type"] == "http.response.start":
                status_code = message.get("status", 500)
            await send(message)
        
        try:
            await self.app(scope, receive, send_wrapper)
        finally:
            duration = time.perf_counter() - start
            
            http_requests_total.inc(
                method=method,
                path=normalized_path,
                status=str(status_code)
            )
            http_request_duration_seconds.observe(
                duration,
                method=method,
                path=normalized_path
            )
            http_requests_in_flight.dec(method=method, path=normalized_path)
    
    def _normalize_path(self, path: str) -> str:
        """Normalize path to reduce cardinality."""
        # Replace UUIDs with placeholder
        import re
        path = re.sub(
            r"[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}",
            "{id}",
            path,
            flags=re.IGNORECASE
        )
        # Replace numeric IDs
        path = re.sub(r"/\d+(/|$)", "/{id}\\1", path)
        return path


def get_metrics() -> str:
    """Get all metrics in Prometheus format."""
    return registry.export_prometheus()


def track_llm_request(model: str = "gemini"):
    """Decorator to track LLM requests."""
    def decorator(func: Callable):
        @wraps(func)
        async def wrapper(*args, **kwargs):
            llm_requests_total.inc(model=model)
            with llm_request_duration_seconds.time(model=model):
                return await func(*args, **kwargs)
        return wrapper
    return decorator
