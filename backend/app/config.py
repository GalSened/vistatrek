"""
VistaTrek Backend Configuration
Environment variables and settings management
"""

from functools import lru_cache
from typing import Optional

from pydantic_settings import BaseSettings


class Settings(BaseSettings):
    """Application settings loaded from environment variables."""

    # Server
    debug: bool = False
    host: str = "0.0.0.0"
    port: int = 8000

    # Database
    database_url: str = "sqlite:///./vistatrek.db"

    # CORS
    cors_origins: str = "http://localhost:5173,http://localhost:3000"

    # LLM Configuration (Groq API)
    llm_api_key: Optional[str] = None
    llm_provider: str = "groq"  # groq, openai, gemini
    llm_model: str = "llama-3.3-70b-versatile"  # Fast, multilingual, Hebrew-capable

    # Conversation Settings
    conversation_ttl_hours: int = 24  # How long to keep conversation state

    # Rate Limiting
    rate_limit_requests: int = 100
    rate_limit_window_seconds: int = 60

    # External Service URLs
    osrm_base_url: str = "http://router.project-osrm.org"
    overpass_base_url: str = "http://overpass-api.de/api/interpreter"
    nominatim_base_url: str = "https://nominatim.openstreetmap.org"

    @property
    def cors_origins_list(self) -> list[str]:
        """Parse CORS origins string into list."""
        return [origin.strip() for origin in self.cors_origins.split(",")]

    class Config:
        env_file = ".env"
        env_file_encoding = "utf-8"
        case_sensitive = False


@lru_cache
def get_settings() -> Settings:
    """Get cached settings instance."""
    return Settings()
