"""
VistaTrek Constraint Solver Tests
"""

from datetime import datetime, timedelta

import pytest

from app.services.constraint_solver import ConstraintSolver, recalculate_trip_times


@pytest.fixture
def sample_stops():
    """Create sample stop data for testing."""
    return [
        {
            "id": "stop-1",
            "name": "Viewpoint",
            "type": "viewpoint",
            "coordinates": {"lat": 31.9, "lon": 35.0},
            "duration_minutes": 30,
            "is_anchor": False,
        },
        {
            "id": "stop-2",
            "name": "Coffee Shop",
            "type": "coffee",
            "coordinates": {"lat": 31.85, "lon": 35.1},
            "duration_minutes": 20,
            "is_anchor": False,
        },
    ]


@pytest.fixture
def basic_trip_data(sample_stops):
    """Create basic trip data for testing."""
    now = datetime.now().replace(hour=9, minute=0, second=0, microsecond=0)

    return {
        "id": "test-trip-1",
        "name": "Test Trip",
        "start_location": {"lat": 32.0853, "lon": 34.7818},
        "end_location": {"lat": 31.7683, "lon": 35.2137},
        "date": "2024-06-15",
        "status": "draft",
        "created_at": now.isoformat(),
        "updated_at": now.isoformat(),
        "route": {
            "polyline": [],
            "duration_seconds": 3600,
            "distance_meters": 60000,
        },
        "stops": sample_stops,
    }


@pytest.fixture
def empty_trip_data():
    """Create trip data with no stops."""
    return {
        "id": "empty-trip",
        "name": "Empty Trip",
        "start_location": {"lat": 32.0, "lon": 34.0},
        "end_location": {"lat": 31.0, "lon": 35.0},
        "date": "2024-06-15",
        "status": "draft",
        "stops": [],
    }


class TestConstraintSolver:
    """Tests for the Constraint Solver."""

    def test_drive_time_estimation(self):
        """Test drive time estimation between two points."""
        solver = ConstraintSolver.__new__(ConstraintSolver)
        solver.drive_times = {}

        # Test distance between two known points (using dicts)
        coord1 = {"lat": 32.0853, "lon": 34.7818}  # Tel Aviv
        coord2 = {"lat": 31.7683, "lon": 35.2137}  # Jerusalem

        drive_time = solver._get_drive_time(coord1, coord2)

        # Should be reasonable (roughly 60km, ~70 min drive)
        assert 2000 < drive_time < 8000  # 30 min to 2+ hours in seconds

    def test_haversine_calculation(self):
        """Test distance calculation is reasonable."""
        solver = ConstraintSolver.__new__(ConstraintSolver)
        solver.drive_times = {}

        # Same point should have very small drive time
        coord = {"lat": 32.0853, "lon": 34.7818}
        drive_time = solver._get_drive_time(coord, coord)

        assert drive_time < 100  # Should be nearly 0

    def test_haversine_km(self):
        """Test haversine distance calculation in km."""
        solver = ConstraintSolver.__new__(ConstraintSolver)

        # Tel Aviv to Jerusalem is roughly 60km
        coord1 = {"lat": 32.0853, "lon": 34.7818}
        coord2 = {"lat": 31.7683, "lon": 35.2137}

        distance = solver._haversine_km(coord1, coord2)

        assert 50 < distance < 70  # Should be around 60km

    def test_solver_initialization(self, basic_trip_data):
        """Test that solver can be initialized with trip data dict."""
        solver = ConstraintSolver(basic_trip_data)

        assert solver.trip_data is not None
        assert len(solver.warnings) == 0
        assert solver.departure_time is not None

    def test_solver_initialization_with_departure_time(self, basic_trip_data):
        """Test solver initialization with explicit departure time."""
        departure = datetime(2024, 6, 15, 10, 0)
        solver = ConstraintSolver(basic_trip_data, departure_time=departure)

        assert solver.departure_time == departure

    def test_empty_trip_solve(self, empty_trip_data):
        """Test solver handles trip with no stops."""
        solver = ConstraintSolver(empty_trip_data)
        updated_trip, warnings = solver.solve()

        assert len(warnings) == 0
        assert len(updated_trip.get("stops", [])) == 0

    def test_solve_calculates_arrival_times(self, basic_trip_data):
        """Test that solve() calculates planned arrival/departure times."""
        solver = ConstraintSolver(basic_trip_data)
        updated_trip, warnings = solver.solve()

        stops = updated_trip.get("stops", [])
        assert len(stops) == 2

        # Each stop should have planned_arrival and planned_departure
        for stop in stops:
            assert "planned_arrival" in stop
            assert "planned_departure" in stop

    def test_solve_sets_estimated_arrival(self, basic_trip_data):
        """Test that solve() sets estimated_arrival on the trip."""
        solver = ConstraintSolver(basic_trip_data)
        updated_trip, warnings = solver.solve()

        assert "estimated_arrival" in updated_trip

    def test_anchor_stops_preserve_time(self, basic_trip_data):
        """Test that anchor stops with locked times preserve their planned_arrival."""
        # Set first stop as anchor with specific time
        anchor_time = "2024-06-15T11:00:00"
        basic_trip_data["stops"][0]["is_anchor"] = True
        basic_trip_data["stops"][0]["planned_arrival"] = anchor_time

        solver = ConstraintSolver(basic_trip_data)
        updated_trip, warnings = solver.solve()

        stops = updated_trip.get("stops", [])
        # Anchor time should be preserved
        assert stops[0]["planned_arrival"] == anchor_time or anchor_time in stops[0].get("planned_arrival", "")

    def test_anchor_conflict_generates_warning(self, basic_trip_data):
        """Test that impossible anchor times generate warnings."""
        # Set first stop as anchor with time that's too early
        # (before departure + drive time)
        basic_trip_data["stops"][0]["is_anchor"] = True
        basic_trip_data["stops"][0]["planned_arrival"] = "2024-06-15T07:00:00"  # Very early

        solver = ConstraintSolver(basic_trip_data)
        updated_trip, warnings = solver.solve()

        # Should have a warning about the impossible time
        assert len(warnings) > 0

    def test_optimize_stop_order_empty(self, empty_trip_data):
        """Test optimization with no stops returns empty list."""
        solver = ConstraintSolver(empty_trip_data)
        optimized = solver.optimize_stop_order()

        assert len(optimized) == 0

    def test_optimize_stop_order_single_stop(self, empty_trip_data):
        """Test optimization with single stop returns that stop."""
        empty_trip_data["stops"] = [
            {
                "id": "stop-1",
                "name": "Only Stop",
                "coordinates": {"lat": 31.9, "lon": 35.0},
                "duration_minutes": 30,
                "is_anchor": False,
            }
        ]

        solver = ConstraintSolver(empty_trip_data)
        optimized = solver.optimize_stop_order()

        assert len(optimized) == 1
        assert optimized[0]["id"] == "stop-1"

    def test_optimize_stop_order_preserves_anchors(self, basic_trip_data):
        """Test that optimization preserves anchor stop positions."""
        # Make second stop an anchor
        basic_trip_data["stops"][1]["is_anchor"] = True

        solver = ConstraintSolver(basic_trip_data)
        optimized = solver.optimize_stop_order()

        # All stops should be present
        assert len(optimized) == 2

    def test_find_anchors(self, basic_trip_data):
        """Test finding anchor stops."""
        # Make first stop an anchor
        basic_trip_data["stops"][0]["is_anchor"] = True

        solver = ConstraintSolver(basic_trip_data)
        anchors = solver._find_anchors(basic_trip_data["stops"])

        assert len(anchors) == 1
        assert 0 in anchors

    def test_get_coordinates_from_dict(self, basic_trip_data):
        """Test extracting coordinates from dict."""
        solver = ConstraintSolver(basic_trip_data)
        coords = solver._get_coordinates({"lat": 32.0, "lon": 34.0})

        assert coords["lat"] == 32.0
        assert coords["lon"] == 34.0

    def test_get_stop_coordinates(self, basic_trip_data):
        """Test extracting coordinates from a stop dict."""
        solver = ConstraintSolver(basic_trip_data)
        stop = {"coordinates": {"lat": 31.5, "lon": 35.5}}
        coords = solver._get_stop_coordinates(stop)

        assert coords["lat"] == 31.5
        assert coords["lon"] == 35.5

    def test_parse_datetime_iso(self, basic_trip_data):
        """Test parsing ISO datetime strings."""
        solver = ConstraintSolver(basic_trip_data)

        result = solver._parse_datetime("2024-06-15T10:30:00")
        assert result is not None
        assert result.hour == 10
        assert result.minute == 30

    def test_parse_datetime_with_z(self, basic_trip_data):
        """Test parsing datetime with Z suffix."""
        solver = ConstraintSolver(basic_trip_data)

        result = solver._parse_datetime("2024-06-15T10:30:00Z")
        assert result is not None
        assert result.hour == 10

    def test_parse_datetime_with_timezone(self, basic_trip_data):
        """Test parsing datetime with timezone offset."""
        solver = ConstraintSolver(basic_trip_data)

        result = solver._parse_datetime("2024-06-15T10:30:00+03:00")
        assert result is not None
        assert result.hour == 10

    def test_parse_datetime_invalid(self, basic_trip_data):
        """Test parsing invalid datetime returns None."""
        solver = ConstraintSolver(basic_trip_data)

        result = solver._parse_datetime("not a date")
        assert result is None

    def test_parse_datetime_none(self, basic_trip_data):
        """Test parsing None returns None."""
        solver = ConstraintSolver(basic_trip_data)

        result = solver._parse_datetime(None)
        assert result is None

    def test_long_trip_warning(self, basic_trip_data):
        """Test that very long trips generate warnings."""
        # Add many stops with long durations
        basic_trip_data["stops"] = [
            {
                "id": f"stop-{i}",
                "name": f"Stop {i}",
                "coordinates": {"lat": 32.0 - i * 0.1, "lon": 35.0},
                "duration_minutes": 120,  # 2 hours each
                "is_anchor": False,
            }
            for i in range(6)  # 6 stops * 2 hours = 12 hours at stops
        ]

        solver = ConstraintSolver(basic_trip_data)
        updated_trip, warnings = solver.solve()

        # Should warn about long trip duration
        assert any("hours" in w.lower() for w in warnings)


class TestRecalculateTripTimes:
    """Tests for the convenience function."""

    def test_recalculate_trip_times(self, basic_trip_data):
        """Test the convenience function works."""
        updated_trip, warnings = recalculate_trip_times(basic_trip_data)

        assert updated_trip is not None
        assert isinstance(warnings, list)
        assert len(updated_trip.get("stops", [])) == 2

    def test_recalculate_with_departure_time(self, basic_trip_data):
        """Test convenience function with explicit departure time."""
        departure = datetime(2024, 6, 15, 9, 30)
        updated_trip, warnings = recalculate_trip_times(
            basic_trip_data, departure_time=departure
        )

        assert updated_trip is not None


class TestDriveTimes:
    """Tests for drive time calculations with pre-computed times."""

    def test_precomputed_drive_times(self, basic_trip_data):
        """Test that pre-computed drive times are used."""
        # Set up pre-computed drive times
        drive_times = {
            ("32.0853,34.7818", "31.9,35.0"): 1800,  # 30 minutes
            ("31.9,35.0", "31.85,35.1"): 600,  # 10 minutes
        }

        solver = ConstraintSolver(basic_trip_data, drive_times=drive_times)

        # Check that pre-computed time is used
        result = solver._get_drive_time(
            {"lat": 32.0853, "lon": 34.7818},
            {"lat": 31.9, "lon": 35.0}
        )
        assert result == 1800

    def test_fallback_to_estimation(self, basic_trip_data):
        """Test fallback to estimation when no pre-computed time exists."""
        solver = ConstraintSolver(basic_trip_data, drive_times={})

        # Should estimate based on distance
        result = solver._get_drive_time(
            {"lat": 32.0853, "lon": 34.7818},
            {"lat": 31.7683, "lon": 35.2137}
        )

        # Should return an estimate (not 0)
        assert result > 0
