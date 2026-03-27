import os
import logging
from fastapi import FastAPI
from opentelemetry import trace
from opentelemetry.sdk.trace import TracerProvider
from opentelemetry.sdk.trace.export import SimpleSpanProcessor, ConsoleSpanExporter, BatchSpanProcessor
from opentelemetry.exporter.otlp.proto.http.trace_exporter import OTLPSpanExporter
from opentelemetry.instrumentation.fastapi import FastAPIInstrumentor
from opentelemetry.sdk.resources import Resource

logger = logging.getLogger(__name__)

def setup_tracing(app: FastAPI):
    """
    Sets up OpenTelemetry tracing for the FastAPI application.
    Exports to OTLP depending on environment variables (OTEL_EXPORTER_OTLP_ENDPOINT).
    Otherwise it defaults to ConsoleSpanExporter for local tracking behavior (no side-effects).
    """
    span_processor = None
    otlp_endpoint = os.getenv("OTEL_EXPORTER_OTLP_ENDPOINT")
    
    resource = Resource.create({"service.name": "coderag-api"})
    provider = TracerProvider(resource=resource)
    
    if otlp_endpoint:
        # User specified OTLP in prompts. We export using BatchSpanProcessor for production.
        otlp_exporter = OTLPSpanExporter(endpoint=otlp_endpoint)
        span_processor = BatchSpanProcessor(otlp_exporter)
        logger.info(f"OpenTelemetry tracing enabled, routing to OTLP at {otlp_endpoint}")
    else:
        # Fallback to console testing
        console_exporter = ConsoleSpanExporter()
        span_processor = SimpleSpanProcessor(console_exporter)
        logger.info("OpenTelemetry tracing enabled, routing to Console (OTEL_EXPORTER_OTLP_ENDPOINT not set)")

    provider.add_span_processor(span_processor)
    trace.set_tracer_provider(provider)

    # Automatically trace the FastAPI app routes
    FastAPIInstrumentor.instrument_app(app)
