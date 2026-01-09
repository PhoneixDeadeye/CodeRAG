#!/usr/bin/env python3
"""
CodeRAG Application Startup Script
Run this to start the backend server
"""

if __name__ == "__main__":
    import uvicorn
    import logging
    import sys
    from dotenv import load_dotenv

    # Load environment variables from .env file
    load_dotenv()
    
    # Configure logging first
    logging.basicConfig(
        level=logging.INFO,
        format='%(asctime)s - %(name)s - %(levelname)s - %(message)s'
    )
    
    logger = logging.getLogger("CodeRAG")
    
    # Validate environment before starting
    try:
        from env_validator import validate_environment
        if not validate_environment(strict=False, exit_on_error=False):
            logger.warning("⚠️  Environment validation warnings detected - continuing anyway")
    except ImportError:
        logger.warning("env_validator module not found - skipping validation")
    
    logger.info("=" * 80)
    logger.info("🚀 Starting CodeRAG Backend Server")
    logger.info("=" * 80)
    logger.info("📍 Backend URL: http://localhost:8000")
    logger.info("📖 API Docs: http://localhost:8000/docs")
    logger.info("🔧 Make sure frontend is running on http://localhost:5173")
    logger.info("=" * 80)
    
    # Start server
    uvicorn.run(
        "api:app",
        host="0.0.0.0",
        port=8000,
        reload=True,
        log_level="info"
    )
