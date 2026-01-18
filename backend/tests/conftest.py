"""
VistaTrek Test Configuration
Pytest fixtures and test database setup
"""

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool

from app.main import app
from app.models.database import Base, get_db


# Test database - in-memory SQLite
SQLALCHEMY_DATABASE_URL = "sqlite://"

engine = create_engine(
    SQLALCHEMY_DATABASE_URL,
    connect_args={"check_same_thread": False},
    poolclass=StaticPool,
)

TestingSessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)


@pytest.fixture(scope="function")
def db_session():
    """Create a fresh database for each test."""
    Base.metadata.create_all(bind=engine)
    session = TestingSessionLocal()
    try:
        yield session
    finally:
        session.close()
        Base.metadata.drop_all(bind=engine)


@pytest.fixture(scope="function")
def client(db_session):
    """Create a test client with database override."""

    def override_get_db():
        try:
            yield db_session
        finally:
            pass

    app.dependency_overrides[get_db] = override_get_db
    yield TestClient(app)
    app.dependency_overrides.clear()


@pytest.fixture
def sample_coordinates():
    """Sample coordinates for testing."""
    return {
        "tel_aviv": {"lat": 32.0853, "lon": 34.7818},
        "jerusalem": {"lat": 31.7683, "lon": 35.2137},
        "haifa": {"lat": 32.7940, "lon": 34.9896},
        "eilat": {"lat": 29.5577, "lon": 34.9519},
    }


@pytest.fixture
def sample_trip_request(sample_coordinates):
    """Sample trip creation request."""
    return {
        "name": "Test Trip",
        "origin": {
            "lat": sample_coordinates["tel_aviv"]["lat"],
            "lon": sample_coordinates["tel_aviv"]["lon"],
            "name": "Tel Aviv",
        },
        "destination": {
            "lat": sample_coordinates["jerusalem"]["lat"],
            "lon": sample_coordinates["jerusalem"]["lon"],
            "name": "Jerusalem",
        },
        "departure_time": "2024-06-15T09:00:00",
        "user_id": "test-user-123",
    }
