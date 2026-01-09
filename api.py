# CRITICAL: Load environment variables FIRST before any other imports that use them
from dotenv import load_dotenv
load_dotenv()

# Standard Library
from contextlib import asynccontextmanager
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
import logging
import os

# Internal Modules
from database import init_db
# Import Config
from config import settings
from logging_config import setup_logging
from middleware import RequestTracingMiddleware
from errors import APIError, api_error_handler

# Configure Logging (Explicitly call setup)
setup_logging(level=os.getenv("LOG_LEVEL", "INFO"))
logger = logging.getLogger("CodeRAG")

@asynccontextmanager
async def lifespan(app: FastAPI):
    # Startup: Initialize DB
    logger.info("🚀 Starting CodeRAG API...")
    try:
        from database import init_db, recover_stale_repos
        init_db()
        recover_stale_repos()
    except Exception as e:
        logger.critical(f"Failed to initialize database or recover repos: {e}")
        # We might want to exit here, but let's allow it to start so logs are visible
    
    yield
    
    # Shutdown
    logger.info("🛑 Shutting down CodeRAG API...")

app = FastAPI(
    title=settings.APP_NAME, 
    version=settings.APP_VERSION,
    lifespan=lifespan
)

@app.get("/")
def read_root():
    return {"message": "Welcome to CodeRAG API", "status": "running"}

# Import Routers (after app creation to avoid circular deps if they imported app, but they don't here)
from routers import auth, repos, files, sessions, chat, guest

# CORS
if os.getenv("CORS_ORIGINS") == "*":
    cors_origins = ["*"]
else:
    cors_origins = settings.CORS_ORIGINS

app.add_middleware(
    CORSMiddleware,
    allow_origins=cors_origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Add Request Tracing Middleware
app.add_middleware(RequestTracingMiddleware)

# Add Custom Exception Handler
app.add_exception_handler(APIError, api_error_handler)

# Include Routers
app.include_router(auth.router)
app.include_router(repos.router)
app.include_router(files.router)
app.include_router(sessions.router)
app.include_router(chat.router)
app.include_router(guest.router)

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8000)
