"""
Centralized Logging Configuration
Provides consistent logging setup across the application.
"""
import logging
import sys
from pathlib import Path
from datetime import datetime
from typing import Optional

# Log directory
LOG_DIR = Path("logs")
LOG_DIR.mkdir(exist_ok=True)

# Log file with timestamp
LOG_FILE = LOG_DIR / f"coderag_{datetime.now().strftime('%Y%m%d')}.log"

class ColoredFormatter(logging.Formatter):
    """Custom formatter with colors for console output."""
    
    COLORS = {
        'DEBUG': '\033[36m',      # Cyan
        'INFO': '\033[32m',       # Green
        'WARNING': '\033[33m',    # Yellow
        'ERROR': '\033[31m',      # Red
        'CRITICAL': '\033[35m',   # Magenta
        'RESET': '\033[0m'        # Reset
    }
    
    def format(self, record):
        if record.levelname in self.COLORS:
            record.levelname = f"{self.COLORS[record.levelname]}{record.levelname}{self.COLORS['RESET']}"
        return super().format(record)


def setup_logging(
    level: str = "INFO",
    log_to_file: bool = True,
    log_to_console: bool = True,
    colored_console: bool = True
) -> None:
    """
    Configure logging for the application.
    
    Args:
        level: Logging level (DEBUG, INFO, WARNING, ERROR, CRITICAL)
        log_to_file: Whether to log to file
        log_to_console: Whether to log to console
        colored_console: Whether to use colored output in console
    """
    # Get numeric level
    numeric_level = getattr(logging, level.upper(), logging.INFO)
    
    # Root logger configuration
    root_logger = logging.getLogger()
    root_logger.setLevel(numeric_level)
    
    # Clear existing handlers
    root_logger.handlers.clear()
    
    # Console handler
    if log_to_console:
        console_handler = logging.StreamHandler(sys.stdout)
        console_handler.setLevel(numeric_level)
        
        if colored_console:
            console_format = ColoredFormatter(
                '%(asctime)s - %(name)s - %(levelname)s - %(message)s',
                datefmt='%H:%M:%S'
            )
        else:
            console_format = logging.Formatter(
                '%(asctime)s - %(name)s - %(levelname)s - %(message)s',
                datefmt='%H:%M:%S'
            )
        
        console_handler.setFormatter(console_format)
        root_logger.addHandler(console_handler)
    
    # File handler
    if log_to_file:
        file_handler = logging.FileHandler(LOG_FILE, encoding='utf-8')
        file_handler.setLevel(numeric_level)
        
        file_format = logging.Formatter(
            '%(asctime)s - %(name)s - %(levelname)s - %(pathname)s:%(lineno)d - %(message)s',
            datefmt='%Y-%m-%d %H:%M:%S'
        )
        file_handler.setFormatter(file_format)
        root_logger.addHandler(file_handler)
    
    # Silence noisy third-party loggers
    logging.getLogger("httpx").setLevel(logging.WARNING)
    logging.getLogger("httpcore").setLevel(logging.WARNING)
    logging.getLogger("urllib3").setLevel(logging.WARNING)
    logging.getLogger("git").setLevel(logging.WARNING)
    logging.getLogger("faiss").setLevel(logging.WARNING)
    
    logger = logging.getLogger(__name__)
    logger.info(f"✅ Logging configured at {level.upper()} level")
    if log_to_file:
        logger.info(f"📝 Log file: {LOG_FILE}")


def get_logger(name: str, level: Optional[str] = None) -> logging.Logger:
    """
    Get a logger instance with optional custom level.
    
    Args:
        name: Logger name (typically __name__)
        level: Optional custom log level for this logger
        
    Returns:
        Configured logger instance
    """
    logger = logging.getLogger(name)
    if level:
        numeric_level = getattr(logging, level.upper(), logging.INFO)
        logger.setLevel(numeric_level)
    return logger


# Auto-configure logging if run as main, otherwise let caller handle it
if __name__ == "__main__":
    import os
    log_level = os.getenv("LOG_LEVEL", "INFO")
    setup_logging(level=log_level)
