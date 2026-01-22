"""
Environment Variable Validation Utility
Validates required environment variables on startup.
"""
import os
import sys
import logging
from typing import List, Dict, Optional

logger = logging.getLogger(__name__)

class EnvValidator:
    """Validates required environment variables."""
    
    def __init__(self):
        self.errors: List[str] = []
        self.warnings: List[str] = []
    
    def require(self, var_name: str, description: str = "") -> Optional[str]:
        """Check if required environment variable exists."""
        value = os.getenv(var_name)
        if not value:
            msg = f"Missing required environment variable: {var_name}"
            if description:
                msg += f" - {description}"
            self.errors.append(msg)
            return None
        return value
    
    def warn_if_default(self, var_name: str, default_value: str, description: str = "") -> str:
        """Warn if environment variable is using default value."""
        value = os.getenv(var_name, default_value)
        if value == default_value:
            msg = f"Using default value for {var_name}: '{default_value}'"
            if description:
                msg += f" - {description}"
            self.warnings.append(msg)
        return value
    
    def validate_google_api_key(self) -> bool:
        """Validate Google API key."""
        api_key = self.require(
            "GOOGLE_API_KEY",
            "Required for cloud-based LLM (Gemini)."
        )
        return api_key is not None
    
    def validate_secret_key(self) -> bool:
        """Validate SECRET_KEY is not using default."""
        secret = self.warn_if_default(
            "SECRET_KEY",
            "supersecretkey_change_me_in_prod",
            "INSECURE! Generate with: python -c \"import secrets; print(secrets.token_urlsafe(32))\""
        )
        return secret != "supersecretkey_change_me_in_prod"
    
    def validate_all(self, strict: bool = False) -> bool:
        """
        Validate all required environment variables.
        
        Args:
            strict: If True, treat warnings as errors
            
        Returns:
            True if validation passes, False otherwise
        """
        # Validate Google API Key
        self.validate_google_api_key()
        
        # Validate Secret Key (warning only in non-strict mode)
        secret_valid = self.validate_secret_key()
        if strict and not secret_valid:
            self.errors.append("SECRET_KEY cannot use default value in strict mode")
        
        # Check for errors
        if self.errors:
            logger.error("❌ Environment validation failed:")
            for error in self.errors:
                logger.error(f"  - {error}")
            return False
        
        # Print warnings
        if self.warnings:
            logger.warning("⚠️  Environment warnings:")
            for warning in self.warnings:
                logger.warning(f"  - {warning}")
        
        logger.info("✅ Environment validation passed")
        return True
    
    def get_summary(self) -> Dict[str, List[str]]:
        """Get validation summary."""
        return {
            "errors": self.errors,
            "warnings": self.warnings
        }


def validate_environment(strict: bool = False, exit_on_error: bool = True) -> bool:
    """
    Convenience function to validate environment.
    
    Args:
        strict: Treat warnings as errors
        exit_on_error: Exit application if validation fails
        
    Returns:
        True if validation passes
    """
    validator = EnvValidator()
    is_valid = validator.validate_all(strict=strict)
    
    if not is_valid and exit_on_error:
        logger.critical("Exiting due to environment validation failure")
        sys.exit(1)
    
    return is_valid


if __name__ == "__main__":
    # Test validation
    logging.basicConfig(level=logging.INFO)
    validate_environment(strict=False, exit_on_error=False)
