"""
VistaTrek Deep Links Tests
"""

import pytest

from app.models.schemas import Coordinates, NavApp
from app.utils.deep_links import generate_nav_link, generate_nav_link_with_waypoints


class TestGenerateNavLink:
    """Tests for navigation deep link generation."""

    @pytest.fixture
    def destination(self):
        """Sample destination coordinate."""
        return Coordinates(lat=31.7683, lon=35.2137)

    def test_waze_link(self, destination):
        """Test Waze deep link generation."""
        link = generate_nav_link(destination, NavApp.WAZE)

        assert "waze.com/ul" in link
        assert f"ll={destination.lat},{destination.lon}" in link
        assert "navigate=yes" in link

    def test_google_link(self, destination):
        """Test Google Maps deep link generation."""
        link = generate_nav_link(destination, NavApp.GOOGLE)

        assert "google.com/maps" in link
        assert f"destination={destination.lat},{destination.lon}" in link
        assert "travelmode=driving" in link

    def test_apple_link(self, destination):
        """Test Apple Maps deep link generation."""
        link = generate_nav_link(destination, NavApp.APPLE)

        assert "maps.apple.com" in link
        assert f"daddr={destination.lat},{destination.lon}" in link
        assert "dirflg=d" in link

    def test_link_with_name(self, destination):
        """Test link generation with destination name."""
        link = generate_nav_link(destination, NavApp.GOOGLE, "Jerusalem Old City")

        assert "google.com/maps" in link
        assert "Jerusalem" in link or "destination_place_id" in link


class TestGenerateNavLinkWithWaypoints:
    """Tests for multi-waypoint navigation links."""

    @pytest.fixture
    def route_points(self):
        """Sample route with waypoints."""
        return {
            "origin": Coordinates(lat=32.0853, lon=34.7818),
            "destination": Coordinates(lat=29.5577, lon=34.9519),
            "waypoints": [
                Coordinates(lat=31.7683, lon=35.2137),
                Coordinates(lat=31.2530, lon=34.7915),
            ],
        }

    def test_google_with_waypoints(self, route_points):
        """Test Google Maps with waypoints."""
        link = generate_nav_link_with_waypoints(
            route_points["origin"],
            route_points["destination"],
            route_points["waypoints"],
            NavApp.GOOGLE,
        )

        assert "google.com/maps" in link
        assert "waypoints=" in link
        assert f"origin={route_points['origin'].lat}" in link

    def test_waze_without_waypoint_support(self, route_points):
        """Test Waze falls back to first waypoint."""
        link = generate_nav_link_with_waypoints(
            route_points["origin"],
            route_points["destination"],
            route_points["waypoints"],
            NavApp.WAZE,
        )

        # Waze should navigate to first waypoint
        assert "waze.com/ul" in link
        assert f"ll={route_points['waypoints'][0].lat}" in link
