"""Configuration settings for the application."""
import os
from functools import lru_cache
from typing import Dict, List, Optional, Union

# from pydantic import BaseModel, field_validator   # <- no se usan aquí
from pydantic_settings import BaseSettings
from dotenv import load_dotenv, find_dotenv

load_dotenv(find_dotenv())

class Settings(BaseSettings):
    """Application settings."""
    
    API_V1_STR: str = "/api/v1"
    PROJECT_NAME: str = os.getenv("PROJECT_NAME", "bktcortexproxyllm")
    DEBUG: bool = os.getenv("DEBUG", "False").lower() in ("true", "1", "t")
    ENVIRONMENT: str = os.getenv("ENVIRONMENT", "dev")
    LOG_LEVEL: str = os.getenv("LOG_LEVEL", "DEBUG")
    DEFAULT_LLM_SCORE_MODEL: str = os.getenv("DEFAULT_LLM_SCORE_MODEL")
    DEFAULT_LLM_SCORE_PROVIDER: str = os.getenv("DEFAULT_LLM_SCORE_PROVIDER", "azure")
    ENABLE_QUALITY_EVALUATION: str = "true"
    EVALUATION_SCORE_PREFIX: str = ""
    
    SECRET_KEY: str = os.getenv("SECRET_KEY", "")
    PROXY_API_KEY: str = os.getenv("PROXY_API_KEY", "")
    
    OPENAPI_URL: Optional[str] = "openapi.json"
    CORS_ORIGINS: List[str] = ["*"]

    PHOENIX_COLLECTOR_ENDPOINT: str = os.getenv("PHOENIX_COLLECTOR_ENDPOINT", "")
    PHOENIX_API_KEY: str = os.getenv("PHOENIX_API_KEY", "")

    # --- Proveedores / LLMs ---
    AZURE_OPENAI_API_KEY: str = os.getenv("AZURE_OPENAI_API_KEY")
    AZURE_OPENAI_ENDPOINT: str = os.getenv("AZURE_OPENAI_ENDPOINT")
    AZURE_OPENAI_API_VERSION: str = os.getenv("AZURE_OPENAI_API_VERSION", "2025-01-01-preview")

    class Config:
        """Configuration for the settings class."""
        env_file = ".env"
        env_file_encoding = "utf-8"
        case_sensitive = True
        extra = "allow"  # Permitir campos extra


@lru_cache
def get_settings() -> Settings:
    """Get cached settings."""
    return Settings()


settings = get_settings()
