"""
VistaTrek Geo Utilities Tests
"""

import pytest

from app.models.schemas import Coordinates
from app.utils.geo import (
    haversine_distance,
    interpolate_along_route,
    find_meso_points,
    is_off_route,
)


class TestHaversineDistance:
    """Tests for haversine distance calculation."""

    def test_same_point(self):
        """Distance between same point should be 0."""
        coord = Coordinates(lat=32.0853, lon=34.7818)
        assert haversine_distance(coord, coord) == 0

    def test_known_distance(self):
        """Test against known distance (Tel Aviv to Jerusalem ~55-65km)."""
        tel_aviv = Coordinates(lat=32.0853, lon=34.7818)
        jerusalem = Coordinates(lat=31.7683, lon=35.2137)

        distance = haversine_distance(tel_aviv, jerusalem)

        # Should be approximately 55-65km (straight line distance)
        assert 50000 < distance < 70000

    def test_short_distance(self):
        """Test short distance calculation."""
        point1 = Coordinates(lat=32.0853, lon=34.7818)
        point2 = Coordinates(lat=32.0863, lon=34.7828)  # ~140m away

        distance = haversine_distance(point1, point2)

        assert 100 < distance < 200


class TestInterpolateAlongRoute:
    """Tests for route interpolation."""

    @pytest.fixture
    def simple_route(self):
        """Simple route for testing."""
        return [
            Coordinates(lat=32.0, lon=34.0),
            Coordinates(lat=32.5, lon=34.5),
            Coordinates(lat=33.0, lon=35.0),
        ]

    def test_interpolate_start(self, simple_route):
        """Interpolation at 0 should return first point."""
        result = interpolate_along_route(simple_route, 0.0)
        assert result.lat == simple_route[0].lat
        assert result.lon == simple_route[0].lon

    def test_interpolate_end(self, simple_route):
        """Interpolation at 1 should return last point."""
        result = interpolate_along_route(simple_route, 1.0)
        assert result.lat == simple_route[-1].lat
        assert result.lon == simple_route[-1].lon

    def test_interpolate_middle(self, simple_route):
        """Interpolation at 0.5 should be roughly in the middle."""
        result = interpolate_along_route(simple_route, 0.5)

        # Should be somewhere between start and end
        assert simple_route[0].lat < result.lat < simple_route[-1].lat
        assert simple_route[0].lon < result.lon < simple_route[-1].lon


class TestFindMesoPoints:
    """Tests for meso-point discovery."""

    @pytest.fixture
    def route_coords(self):
        """Route for meso-point testing."""
        return [
            Coordinates(lat=32.0, lon=34.0),
            Coordinates(lat=32.2, lon=34.2),
            Coordinates(lat=32.4, lon=34.4),
            Coordinates(lat=32.6, lon=34.6),
            Coordinates(lat=32.8, lon=34.8),
            Coordinates(lat=33.0, lon=35.0),
        ]

    def test_find_meso_points_count(self, route_coords):
        """Should return requested number of meso-points."""
        meso_points = find_meso_points(route_coords, count=3)
        assert len(meso_points) == 3

    def test_meso_points_distributed(self, route_coords):
        """Meso-points should be distributed along route."""
        meso_points = find_meso_points(route_coords, count=4)

        # Each point should be further along than the previous
        for i in range(len(meso_points) - 1):
            assert meso_points[i].lat < meso_points[i + 1].lat

    def test_zero_meso_points(self, route_coords):
        """Requesting 0 meso-points should return empty list."""
        meso_points = find_meso_points(route_coords, count=0)
        assert len(meso_points) == 0


class TestIsOffRoute:
    """Tests for off-route detection."""

    @pytest.fixture
    def route(self):
        """Simple route for off-route testing."""
        return [
            Coordinates(lat=32.0, lon=34.0),
            Coordinates(lat=32.0, lon=35.0),  # East-west line
        ]

    def test_on_route_point(self, route):
        """Point very close to route should not be off-route."""
        # Point exactly on the line
        on_point = Coordinates(lat=32.0, lon=34.5)
        # Use a generous threshold since the point is on the line
        assert not is_off_route(on_point, route, threshold_meters=1000)

    def test_off_route(self, route):
        """Point far from route should be off-route."""
        # Point 1 degree north (~111km away)
        off_point = Coordinates(lat=33.0, lon=34.5)
        assert is_off_route(off_point, route, threshold_meters=500)

    def test_near_route(self, route):
        """Point near route should not be off-route with appropriate threshold."""
        # Point slightly north of route (about 1km north)
        near_point = Coordinates(lat=32.01, lon=34.5)

        # Should be on-route with large threshold
        assert not is_off_route(near_point, route, threshold_meters=5000)

    def test_empty_route(self):
        """Empty route should always be off-route."""
        point = Coordinates(lat=32.0, lon=34.0)
        assert is_off_route(point, [], threshold_meters=1000)
