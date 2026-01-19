"""
Unit tests for VistaTrek API core functions.
Tests the Macro-Meso-Micro algorithm components with mocked external APIs.
"""
import pytest
from unittest.mock import patch, MagicMock
from fastapi import HTTPException
import sys
import os

# Add parent directory to path to import from index.py
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from index import (
    GeoPoint,
    find_route_midpoint,
    find_golden_clusters,
    get_osrm_route,
)


# ============== Midpoint Calculation Tests ==============

class TestFindRouteMidpoint:
    """Tests for the MESO layer midpoint calculation."""

    def test_midpoint_simple_line(self, simple_two_point_geometry):
        """Two points should return the geographic center."""
        result = find_route_midpoint(simple_two_point_geometry)
        # Midpoint of [34.0, 32.0] to [35.0, 33.0]
        assert 32.4 <= result.lat <= 32.6  # Approximately 32.5
        assert 34.4 <= result.lon <= 34.6  # Approximately 34.5

    def test_midpoint_three_points(self, sample_route_geometry):
        """Multi-segment route should find midpoint by distance."""
        result = find_route_midpoint(sample_route_geometry)
        # Should be somewhere between start and end
        assert 32.0 <= result.lat <= 33.0
        assert 34.5 <= result.lon <= 35.5

    def test_midpoint_empty_geometry(self):
        """Empty geometry should raise HTTPException."""
        with pytest.raises(HTTPException) as exc_info:
            find_route_midpoint([])
        assert exc_info.value.status_code == 400
        assert "Empty route geometry" in str(exc_info.value.detail)

    def test_midpoint_single_point(self):
        """Single point geometry should return that point."""
        geometry = [[34.7818, 32.0853]]
        result = find_route_midpoint(geometry)
        assert result.lat == 32.0853
        assert result.lon == 34.7818


# ============== OSRM Integration Tests (Mocked) ==============

class TestGetOsrmRoute:
    """Tests for OSRM API integration with mocked responses."""

    @patch('index.requests.get')
    def test_osrm_success(self, mock_get, mock_osrm_success_response):
        """Successful OSRM call returns geometry, duration, distance."""
        mock_response = MagicMock()
        mock_response.json.return_value = mock_osrm_success_response
        mock_response.raise_for_status = MagicMock()
        mock_get.return_value = mock_response

        start = GeoPoint(lat=32.0853, lon=34.7818)
        end = GeoPoint(lat=32.7940, lon=34.9896)

        result = get_osrm_route(start, end)

        assert "geometry" in result
        assert "duration_sec" in result
        assert "distance_m" in result
        assert result["duration_sec"] == 5400
        assert result["distance_m"] == 95000
        assert len(result["geometry"]) == 3

    @patch('index.requests.get')
    def test_osrm_no_route(self, mock_get, mock_osrm_no_route_response):
        """No route found should raise 400 error."""
        mock_response = MagicMock()
        mock_response.json.return_value = mock_osrm_no_route_response
        mock_response.raise_for_status = MagicMock()
        mock_get.return_value = mock_response

        start = GeoPoint(lat=32.0853, lon=34.7818)
        end = GeoPoint(lat=32.7940, lon=34.9896)

        with pytest.raises(HTTPException) as exc_info:
            get_osrm_route(start, end)
        assert exc_info.value.status_code == 400
        assert "Could not find route" in str(exc_info.value.detail)

    @patch('index.requests.get')
    def test_osrm_timeout(self, mock_get):
        """OSRM timeout should raise 502 error."""
        import requests
        mock_get.side_effect = requests.RequestException("Connection timeout")

        start = GeoPoint(lat=32.0853, lon=34.7818)
        end = GeoPoint(lat=32.7940, lon=34.9896)

        with pytest.raises(HTTPException) as exc_info:
            get_osrm_route(start, end)
        assert exc_info.value.status_code == 502
        assert "OSRM service error" in str(exc_info.value.detail)


# ============== Golden Cluster Scoring Tests ==============

class TestGoldenClusterScoring:
    """Tests for the MICRO layer golden cluster scoring algorithm."""

    @patch('index.requests.post')
    def test_golden_spot_base_score(self, mock_post, mock_overpass_viewpoint_only):
        """Viewpoint alone should have base score of 50."""
        mock_response = MagicMock()
        mock_response.json.return_value = mock_overpass_viewpoint_only
        mock_response.raise_for_status = MagicMock()
        mock_post.return_value = mock_response

        center = GeoPoint(lat=32.5, lon=35.0)
        result = find_golden_clusters(center, radius_m=5000)

        assert len(result) == 1
        assert result[0].score == 50
        assert "viewpoint" in result[0].tags.get("tourism", "")

    @patch('index.requests.post')
    def test_golden_spot_with_parking(self, mock_post, mock_overpass_viewpoint_with_parking):
        """Viewpoint with nearby parking should have score 50 + 20 = 70."""
        mock_response = MagicMock()
        mock_response.json.return_value = mock_overpass_viewpoint_with_parking
        mock_response.raise_for_status = MagicMock()
        mock_post.return_value = mock_response

        center = GeoPoint(lat=32.5, lon=35.0)
        result = find_golden_clusters(center, radius_m=5000)

        assert len(result) == 1
        assert result[0].score == 70  # base 50 + parking 20
        assert any("parking" in r.lower() or "חניה" in r for r in result[0].reasons)

    @patch('index.requests.post')
    def test_golden_spot_with_cafe(self, mock_post, mock_overpass_viewpoint_with_cafe):
        """Viewpoint with nearby cafe should have score 50 + 30 = 80."""
        mock_response = MagicMock()
        mock_response.json.return_value = mock_overpass_viewpoint_with_cafe
        mock_response.raise_for_status = MagicMock()
        mock_post.return_value = mock_response

        center = GeoPoint(lat=32.5, lon=35.0)
        result = find_golden_clusters(center, radius_m=5000)

        assert len(result) == 1
        assert result[0].score == 80  # base 50 + cafe 30
        assert any("cafe" in r.lower() or "קפה" in r for r in result[0].reasons)

    @patch('index.requests.post')
    def test_golden_spot_with_bench(self, mock_post, mock_overpass_viewpoint_with_bench):
        """Viewpoint with nearby bench should have score 50 + 10 = 60."""
        mock_response = MagicMock()
        mock_response.json.return_value = mock_overpass_viewpoint_with_bench
        mock_response.raise_for_status = MagicMock()
        mock_post.return_value = mock_response

        center = GeoPoint(lat=32.5, lon=35.0)
        result = find_golden_clusters(center, radius_m=5000)

        assert len(result) == 1
        assert result[0].score == 60  # base 50 + bench 10
        assert any("bench" in r.lower() or "ספסל" in r for r in result[0].reasons)

    @patch('index.requests.post')
    def test_golden_spot_with_name(self, mock_post, mock_overpass_named_viewpoint):
        """Named viewpoint should have score 50 + 10 = 60."""
        mock_response = MagicMock()
        mock_response.json.return_value = mock_overpass_named_viewpoint
        mock_response.raise_for_status = MagicMock()
        mock_post.return_value = mock_response

        center = GeoPoint(lat=32.5, lon=35.0)
        result = find_golden_clusters(center, radius_m=5000)

        assert len(result) == 1
        assert result[0].score == 60  # base 50 + name 10
        assert result[0].name == "Scenic Point"

    @patch('index.requests.post')
    def test_golden_spot_max_score(self, mock_post, mock_overpass_full_cluster):
        """Viewpoint with parking + cafe + name should have max score 120."""
        mock_response = MagicMock()
        mock_response.json.return_value = mock_overpass_full_cluster
        mock_response.raise_for_status = MagicMock()
        mock_post.return_value = mock_response

        center = GeoPoint(lat=32.5, lon=35.0)
        result = find_golden_clusters(center, radius_m=5000)

        assert len(result) == 1
        # base 50 + parking 20 + cafe 30 + name 10 = 110
        assert result[0].score == 110
        assert result[0].name == "Best View"

    @patch('index.requests.post')
    def test_overpass_empty_response(self, mock_post, mock_overpass_empty_response):
        """Empty Overpass response should return empty list."""
        mock_response = MagicMock()
        mock_response.json.return_value = mock_overpass_empty_response
        mock_response.raise_for_status = MagicMock()
        mock_post.return_value = mock_response

        center = GeoPoint(lat=32.5, lon=35.0)
        result = find_golden_clusters(center, radius_m=5000)

        assert result == []

    @patch('index.requests.post')
    def test_overpass_timeout(self, mock_post):
        """Overpass timeout should return empty list (graceful degradation)."""
        mock_post.side_effect = Exception("Connection timeout")

        center = GeoPoint(lat=32.5, lon=35.0)
        result = find_golden_clusters(center, radius_m=5000)

        # Should return empty list, not raise exception
        assert result == []

    @patch('index.requests.post')
    def test_spring_as_anchor(self, mock_post, mock_overpass_spring):
        """Natural spring should be recognized as anchor with base score."""
        mock_response = MagicMock()
        mock_response.json.return_value = mock_overpass_spring
        mock_response.raise_for_status = MagicMock()
        mock_post.return_value = mock_response

        center = GeoPoint(lat=32.5, lon=35.0)
        result = find_golden_clusters(center, radius_m=5000)

        assert len(result) == 1
        assert result[0].score == 60  # base 50 + name 10
        assert "spring" in result[0].tags.get("natural", "")
        assert result[0].name == "Ein Gedi"


# ============== Sorting Tests ==============

class TestGoldenClusterSorting:
    """Tests for golden cluster sorting by score."""

    @patch('index.requests.post')
    def test_spots_sorted_by_score_descending(self, mock_post):
        """Golden spots should be sorted by score in descending order."""
        # Create response with multiple viewpoints of different scores
        mock_response_data = {
            "elements": [
                # Viewpoint 1: base only (50)
                {"type": "node", "id": 1, "lat": 32.5, "lon": 35.0, "tags": {"tourism": "viewpoint"}},
                # Viewpoint 2: with parking (70)
                {"type": "node", "id": 2, "lat": 32.6, "lon": 35.1, "tags": {"tourism": "viewpoint"}},
                {"type": "node", "id": 3, "lat": 32.6002, "lon": 35.1002, "tags": {"amenity": "parking"}},
                # Viewpoint 3: with name (60)
                {"type": "node", "id": 4, "lat": 32.7, "lon": 35.2, "tags": {"tourism": "viewpoint", "name": "Nice View"}},
            ]
        }
        mock_response = MagicMock()
        mock_response.json.return_value = mock_response_data
        mock_response.raise_for_status = MagicMock()
        mock_post.return_value = mock_response

        center = GeoPoint(lat=32.6, lon=35.1)
        result = find_golden_clusters(center, radius_m=50000)

        assert len(result) == 3
        # Should be sorted: 70, 60, 50
        assert result[0].score >= result[1].score >= result[2].score


# ============== Data Model Tests ==============

class TestGeoPointModel:
    """Tests for GeoPoint Pydantic model validation."""

    def test_valid_geopoint(self):
        """Valid coordinates should create GeoPoint."""
        point = GeoPoint(lat=32.0853, lon=34.7818)
        assert point.lat == 32.0853
        assert point.lon == 34.7818

    def test_invalid_latitude(self):
        """Latitude outside -90 to 90 should fail validation."""
        from pydantic import ValidationError
        with pytest.raises(ValidationError):
            GeoPoint(lat=91.0, lon=34.7818)

    def test_invalid_longitude(self):
        """Longitude outside -180 to 180 should fail validation."""
        from pydantic import ValidationError
        with pytest.raises(ValidationError):
            GeoPoint(lat=32.0853, lon=181.0)
