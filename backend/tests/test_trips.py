"""
VistaTrek Trips API Tests
"""

import pytest


@pytest.fixture
def sample_trip_create():
    """Sample trip creation request matching TripCreate schema."""
    return {
        "name": "Test Trip",
        "start_location": {"lat": 32.0853, "lon": 34.7818},
        "end_location": {"lat": 31.7683, "lon": 35.2137},
        "date": "2024-06-15",
        "vibes": ["nature", "chill"],
    }


class TestTripsAPI:
    """Tests for /api/trips endpoints."""

    def test_list_trips_empty(self, client):
        """Test listing trips when none exist."""
        response = client.get("/api/trips")

        assert response.status_code == 200
        assert response.json() == []

    def test_create_trip(self, client, sample_trip_create):
        """Test creating a new trip."""
        response = client.post("/api/trips", json=sample_trip_create)

        assert response.status_code == 201
        data = response.json()

        assert data["name"] == "Test Trip"
        assert data["status"] == "draft"
        assert data["start_location"]["lat"] == sample_trip_create["start_location"]["lat"]
        assert data["end_location"]["lat"] == sample_trip_create["end_location"]["lat"]
        assert "id" in data

    def test_get_trip(self, client, sample_trip_create):
        """Test retrieving a specific trip."""
        # Create a trip first
        create_response = client.post("/api/trips", json=sample_trip_create)
        trip_id = create_response.json()["id"]

        # Get the trip
        response = client.get(f"/api/trips/{trip_id}")

        assert response.status_code == 200
        data = response.json()
        assert data["id"] == trip_id
        assert data["name"] == "Test Trip"

    def test_get_trip_not_found(self, client):
        """Test getting a non-existent trip."""
        response = client.get("/api/trips/non-existent-id")

        assert response.status_code == 404

    def test_delete_trip(self, client, sample_trip_create):
        """Test deleting a trip."""
        # Create a trip first
        create_response = client.post("/api/trips", json=sample_trip_create)
        trip_id = create_response.json()["id"]

        # Delete the trip
        response = client.delete(f"/api/trips/{trip_id}")
        assert response.status_code == 204

        # Verify it's gone
        get_response = client.get(f"/api/trips/{trip_id}")
        assert get_response.status_code == 404

    def test_list_trips_with_data(self, client, sample_trip_create):
        """Test listing trips after creating some."""
        # Create multiple trips
        client.post("/api/trips", json=sample_trip_create)
        sample_trip_create["name"] = "Second Trip"
        client.post("/api/trips", json=sample_trip_create)

        # List trips
        response = client.get("/api/trips")

        assert response.status_code == 200
        data = response.json()
        assert len(data) == 2

    def test_plan_trip_route(self, client):
        """Test planning a route with POI discovery."""
        plan_request = {
            "start_lat": 32.0853,
            "start_lon": 34.7818,
            "end_lat": 31.7683,
            "end_lon": 35.2137,
            "date": "2024-06-15",
            "vibes": ["nature"],
        }

        response = client.post("/api/trips/plan", json=plan_request)

        assert response.status_code == 200
        data = response.json()
        assert "macro_route" in data
        assert "micro_stops" in data
        assert "golden_clusters" in data
