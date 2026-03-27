# ruff: noqa: E402
import logging
from dotenv import load_dotenv

load_dotenv()
import os
from contextlib import asynccontextmanager
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import PlainTextResponse
from starlette.middleware.gzip import GZipMiddleware

# Internal Modules
from app.core.config import settings
from app.core.logging_config import setup_logging
from app.api.middleware import RequestTracingMiddleware, SecurityHeadersMiddleware
from app.core.errors import APIError, api_error_handler, generic_exception_handler
from app.services.metrics import PrometheusMiddleware, get_metrics
from app.api.routers import auth, repos, files, sessions, chat, guest, websocket, export, diff, streaming, upload, feedback
from app.api.routers import admin, billing, settings_router, oauth

# Configure Logging (Explicitly call setup)
setup_logging(level=os.getenv("LOG_LEVEL", "INFO"))
logger = logging.getLogger("CodeRAG")

# --- Observability Setup ---
# 1. Sentry
if settings.SENTRY_DSN:
    import sentry_sdk

    try:
        sentry_sdk.init(
            dsn=settings.SENTRY_DSN,
            traces_sample_rate=1.0,
            profiles_sample_rate=1.0,
            environment=os.getenv("ENV", "production"),
        )
        logger.info("Sentry initialized.")
    except Exception as e:
        logger.error(f"Failed to initialize Sentry: {e}")

# 2. OpenTelemetry
try:
    from app.core.tracing import setup_tracing
    logger.info("OpenTelemetry configuration imported.")
except ImportError as e:
    setup_tracing = None
    logger.error(f"Failed to import OpenTelemetry setup: {e}")


@asynccontextmanager
async def lifespan(app: FastAPI):
    # Startup: Initialize DB
    logger.info("Starting CodeRAG API...")
    try:
        from app.core.database import init_db, recover_stale_repos_async

        await init_db()
        await recover_stale_repos_async()
    except Exception as e:
        logger.critical(f"Failed to initialize database or recover repos: {e}")

    yield

    logger.info("Shutting down CodeRAG API...")


app = FastAPI(
    title=settings.APP_NAME,
    version="5.0",
    lifespan=lifespan,
    docs_url="/docs",
    redoc_url="/redoc",
)

if setup_tracing:
    try:
        setup_tracing(app)
    except Exception as e:
        logger.error(f"Failed to initialize OpenTelemetry app instrumentation: {e}")


@app.get("/")
def read_root():
    return {"message": "Welcome to CodeRAG API", "status": "running"}


@app.get("/health")
async def health_check():
    """Health check endpoint for monitoring and load balancers."""
    return {
        "status": "healthy",
        "version": settings.APP_VERSION,
        "service": settings.APP_NAME,
    }


@app.get("/ready")
async def readiness_check():
    """Readiness probe to verify critical dependencies are reachable."""
    from sqlalchemy import text
    from app.core.database import AsyncSessionLocal
    import redis

    checks = {"database": "unknown", "redis": "unknown"}

    try:
        async with AsyncSessionLocal() as session:
            await session.execute(text("SELECT 1"))
        checks["database"] = "ok"
    except Exception as exc:
        checks["database"] = f"error:{type(exc).__name__}"

    try:
        redis_client = redis.from_url(settings.REDIS_URL)
        if redis_client.ping():
            checks["redis"] = "ok"
    except Exception as exc:
        checks["redis"] = f"error:{type(exc).__name__}"

    is_ready = all(value == "ok" for value in checks.values())
    return {
        "status": "ready" if is_ready else "degraded",
        "checks": checks,
        "version": settings.APP_VERSION,
    }


@app.get("/health/ai")
async def ai_health_check():
    """
    Check AI service health.
    Returns status of the configured LLM provider.
    """
    from app.services.llm_config import check_ai_service_health

    return await check_ai_service_health()


@app.get("/health/cache")
async def cache_health():
    """
    Get cache statistics and health information.
    """
    from app.core.cache import cache_stats

    stats = cache_stats()

    # Also get file tree cache stats if available
    try:
        from app.api.routers.files import _file_tree_cache

        file_tree_count = len(_file_tree_cache)
        stats["file_tree_cache_items"] = file_tree_count
    except Exception:
        pass

    return {"status": "healthy", "cache_stats": stats}


@app.get("/metrics")
async def metrics():
    """Prometheus metrics endpoint for observability."""
    return PlainTextResponse(content=get_metrics(), media_type="text/plain")


# CORS
app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.CORS_ORIGINS,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Add GZip compression for responses > 500 bytes
app.add_middleware(GZipMiddleware, minimum_size=500)

# Add Prometheus Metrics Middleware
app.add_middleware(PrometheusMiddleware)

# Add Security Headers Middleware
app.add_middleware(SecurityHeadersMiddleware)

# Add Request Tracing Middleware
app.add_middleware(RequestTracingMiddleware)

app.add_exception_handler(APIError, api_error_handler)
app.add_exception_handler(Exception, generic_exception_handler)

# Include Existing Routers (backward-compatible, keep existing prefixes)
app.include_router(auth.router)
app.include_router(repos.router)
app.include_router(files.router)
app.include_router(sessions.router)
app.include_router(chat.router)
app.include_router(guest.router)
app.include_router(websocket.router)
app.include_router(export.router)
app.include_router(diff.router)
app.include_router(streaming.router)
app.include_router(upload.router)
app.include_router(feedback.router)

# v5.0 Routers (all under /api/v1/)
app.include_router(admin.router)
app.include_router(billing.router)
app.include_router(settings_router.router)
app.include_router(oauth.router)

if __name__ == "__main__":
    import uvicorn

    uvicorn.run(app, host="0.0.0.0", port=8000)
