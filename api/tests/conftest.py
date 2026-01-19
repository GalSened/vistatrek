"""
Pytest fixtures for VistaTrek API tests.
"""
import pytest


# Sample route geometry (Tel Aviv to Haifa area)
@pytest.fixture
def sample_route_geometry():
    """A simple route geometry for testing midpoint calculations."""
    return [
        [34.7818, 32.0853],  # Tel Aviv
        [34.8500, 32.3000],  # Midway point
        [34.9896, 32.7940],  # Haifa
    ]


@pytest.fixture
def simple_two_point_geometry():
    """Two-point geometry for simple midpoint test."""
    return [
        [34.0, 32.0],  # Start
        [35.0, 33.0],  # End
    ]


# Mock OSRM API responses
@pytest.fixture
def mock_osrm_success_response():
    """Successful OSRM route response."""
    return {
        "code": "Ok",
        "routes": [
            {
                "geometry": {
                    "coordinates": [
                        [34.7818, 32.0853],
                        [34.8500, 32.3000],
                        [34.9896, 32.7940],
                    ]
                },
                "duration": 5400,  # 90 minutes in seconds
                "distance": 95000,  # 95 km in meters
            }
        ],
    }


@pytest.fixture
def mock_osrm_no_route_response():
    """OSRM response when no route is found."""
    return {
        "code": "NoRoute",
        "routes": [],
    }


# Mock Overpass API responses
@pytest.fixture
def mock_overpass_viewpoint_only():
    """Overpass response with a single viewpoint (no parking/cafe nearby)."""
    return {
        "elements": [
            {
                "type": "node",
                "id": 12345,
                "lat": 32.5,
                "lon": 35.0,
                "tags": {"tourism": "viewpoint"},
            }
        ]
    }


@pytest.fixture
def mock_overpass_viewpoint_with_parking():
    """Overpass response with viewpoint and nearby parking."""
    return {
        "elements": [
            {
                "type": "node",
                "id": 12345,
                "lat": 32.5,
                "lon": 35.0,
                "tags": {"tourism": "viewpoint"},
            },
            {
                "type": "node",
                "id": 12346,
                "lat": 32.5002,  # ~22m away (within 400m)
                "lon": 35.0002,
                "tags": {"amenity": "parking"},
            },
        ]
    }


@pytest.fixture
def mock_overpass_viewpoint_with_cafe():
    """Overpass response with viewpoint and nearby cafe."""
    return {
        "elements": [
            {
                "type": "node",
                "id": 12345,
                "lat": 32.5,
                "lon": 35.0,
                "tags": {"tourism": "viewpoint"},
            },
            {
                "type": "node",
                "id": 12347,
                "lat": 32.5001,  # ~11m away (within 200m)
                "lon": 35.0001,
                "tags": {"amenity": "cafe"},
            },
        ]
    }


@pytest.fixture
def mock_overpass_viewpoint_with_bench():
    """Overpass response with viewpoint and nearby bench."""
    return {
        "elements": [
            {
                "type": "node",
                "id": 12345,
                "lat": 32.5,
                "lon": 35.0,
                "tags": {"tourism": "viewpoint"},
            },
            {
                "type": "node",
                "id": 12348,
                "lat": 32.5001,
                "lon": 35.0001,
                "tags": {"amenity": "bench"},
            },
        ]
    }


@pytest.fixture
def mock_overpass_named_viewpoint():
    """Overpass response with a named viewpoint."""
    return {
        "elements": [
            {
                "type": "node",
                "id": 12345,
                "lat": 32.5,
                "lon": 35.0,
                "tags": {"tourism": "viewpoint", "name": "Scenic Point"},
            }
        ]
    }


@pytest.fixture
def mock_overpass_full_cluster():
    """Overpass response with viewpoint + parking + cafe + name (max score)."""
    return {
        "elements": [
            {
                "type": "node",
                "id": 12345,
                "lat": 32.5,
                "lon": 35.0,
                "tags": {"tourism": "viewpoint", "name": "Best View"},
            },
            {
                "type": "node",
                "id": 12346,
                "lat": 32.5002,
                "lon": 35.0002,
                "tags": {"amenity": "parking"},
            },
            {
                "type": "node",
                "id": 12347,
                "lat": 32.5001,
                "lon": 35.0001,
                "tags": {"amenity": "cafe"},
            },
        ]
    }


@pytest.fixture
def mock_overpass_empty_response():
    """Empty Overpass response."""
    return {"elements": []}


@pytest.fixture
def mock_overpass_spring():
    """Overpass response with a natural spring."""
    return {
        "elements": [
            {
                "type": "node",
                "id": 12349,
                "lat": 32.5,
                "lon": 35.0,
                "tags": {"natural": "spring", "name": "Ein Gedi"},
            }
        ]
    }
