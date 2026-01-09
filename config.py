import os
try:
    from pydantic_settings import BaseSettings, SettingsConfigDict
except ImportError:
    from pydantic import BaseSettings
    SettingsConfigDict = None

from pydantic import field_validator

from typing import List, Dict, Optional, Union

class Settings(BaseSettings):
    # App Info
    APP_NAME: str = "CodeRAG SaaS API"
    APP_VERSION: str = "3.0"
    
    # Paths
    # Use environment variable for DATA_DIR if set, otherwise default to relative "data"
    DATA_DIR: str = os.getenv("DATA_DIR", os.path.abspath("data"))
    
    # Security
    # Load CORS origins from env as CSV or JSON, default to dev list
    CORS_ORIGINS: List[str] = [
        "http://localhost:5173",
        "http://localhost:3000",
        "http://127.0.0.1:5173"
    ]

    @field_validator("CORS_ORIGINS", mode="before")
    @classmethod
    def assemble_cors_origins(cls, v: Union[str, List[str]]) -> Union[List[str], str]:
        if isinstance(v, str) and not v.startswith("["):
            return [i.strip() for i in v.split(",")]
        elif isinstance(v, (list, str)):
            return v
        raise ValueError(v)
    
    # Limits
    MAX_FILE_SIZE: int = 10 * 1024 * 1024  # 10MB
    MAX_DEP_FILE_SIZE: int = 2 * 1024 * 1024 # 2MB

    # LLM Configuration (Gemini 2.0)
    GOOGLE_API_KEY: Optional[str] = None
    
    # Regex Patterns
    LANGUAGE_PATTERNS: Dict[str, List[str]] = {
        'python': [r'class\s+([a-zA-Z0-9_]+)', r'def\s+([a-zA-Z0-9_]+)'],
        'typescript': [r'class\s+([a-zA-Z0-9_]+)', r'function\s+([a-zA-Z0-9_]+)', r'const\s+([a-zA-Z0-9_]+)\s*=', r'interface\s+([a-zA-Z0-9_]+)', r'type\s+([a-zA-Z0-9_]+)\s*='],
        'javascript': [r'class\s+([a-zA-Z0-9_]+)', r'function\s+([a-zA-Z0-9_]+)', r'const\s+([a-zA-Z0-9_]+)\s*='],
        'java': [r'class\s+([a-zA-Z0-9_]+)', r'interface\s+([a-zA-Z0-9_]+)', r'enum\s+([a-zA-Z0-9_]+)', r'(?:public|private|protected|static|\s) +[\w\<\>\[\]]+\s+([a-zA-Z0-9_]+)\s*\('],
        'go': [r'func\s+([a-zA-Z0-9_]+)\s*\(', r'type\s+([a-zA-Z0-9_]+)\s+struct'],
        'rust': [r'fn\s+([a-zA-Z0-9_]+)\s*\(', r'struct\s+([a-zA-Z0-9_]+)', r'enum\s+([a-zA-Z0-9_]+)', r'trait\s+([a-zA-Z0-9_]+)'],
        'cpp': [r'class\s+([a-zA-Z0-9_]+)', r'struct\s+([a-zA-Z0-9_]+)', r'void\s+([a-zA-Z0-9_]+)\s*\(', r'int\s+([a-zA-Z0-9_]+)\s*\('],
        'c': [r'struct\s+([a-zA-Z0-9_]+)', r'(?:void|int|char|float|double)\s+([a-zA-Z0-9_]+)\s*\('],
    }
    
    if SettingsConfigDict:
        model_config = SettingsConfigDict(
            env_file=".env", 
            case_sensitive=True,
            extra="ignore"
        )
    else:
        class Config:
            env_file = ".env"
            case_sensitive = True

settings = Settings()

# Ensure Data Dir exists
os.makedirs(settings.DATA_DIR, exist_ok=True)
