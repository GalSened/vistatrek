"""
VistaTrek Database Setup
SQLAlchemy ORM models and database connection
"""

from datetime import datetime
from typing import Generator

from sqlalchemy import Column, DateTime, Float, ForeignKey, Integer, String, Text, create_engine
from sqlalchemy.ext.declarative import declarative_base
from sqlalchemy.orm import Session, sessionmaker

from app.config import get_settings

# Get settings
settings = get_settings()

# Create engine
engine = create_engine(
    settings.database_url,
    connect_args={"check_same_thread": False} if "sqlite" in settings.database_url else {},
)

# Create session factory
SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)

# Create base class for models
Base = declarative_base()


# =============================================================================
# ORM Models
# =============================================================================


class UserModel(Base):
    """User profile ORM model."""

    __tablename__ = "users"

    id = Column(String, primary_key=True, index=True)
    name = Column(String(100), nullable=True)
    hiking_score = Column(Float, default=5.0)
    foodie_score = Column(Float, default=5.0)
    patience_score = Column(Float, default=5.0)
    preferred_nav_app = Column(String(20), default="waze")
    onboarding_completed = Column(Integer, default=0)  # SQLite doesn't have boolean
    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)


class TripModel(Base):
    """Trip ORM model."""

    __tablename__ = "trips"

    id = Column(String, primary_key=True, index=True)
    user_id = Column(String, ForeignKey("users.id"), nullable=True)
    name = Column(String(200), nullable=False)
    status = Column(String(20), default="draft")
    data = Column(Text, nullable=False)  # JSON stored as text
    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)


class POICacheModel(Base):
    """Cached POI data to reduce API calls."""

    __tablename__ = "poi_cache"

    id = Column(Integer, primary_key=True, autoincrement=True)
    osm_id = Column(Integer, unique=True, index=True)
    name = Column(String(200))
    type = Column(String(50))
    lat = Column(Float, nullable=False)
    lon = Column(Float, nullable=False)
    tags = Column(Text)  # JSON stored as text
    fetched_at = Column(DateTime, default=datetime.utcnow)


# =============================================================================
# Database Functions
# =============================================================================


def create_tables() -> None:
    """Create all database tables."""
    Base.metadata.create_all(bind=engine)


def get_db() -> Generator[Session, None, None]:
    """Get database session dependency."""
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()
