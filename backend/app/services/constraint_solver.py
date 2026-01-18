"""
VistaTrek Constraint Solver
Automatic time recalculation when stops are reordered
"""

from datetime import datetime, timedelta
from typing import Optional, Union
from math import radians, sin, cos, sqrt, atan2


class ConstraintSolver:
    """
    Solves time constraints when stops are reordered.

    Algorithm:
    1. Find anchors (stops with is_anchor=True)
    2. Forward pass: propagate times from start
    3. Validate all constraints
    4. Return warnings if constraints violated

    Works with both dict and Pydantic model data structures.
    """

    def __init__(
        self,
        trip_data: dict,
        drive_times: Optional[dict] = None,
        departure_time: Optional[datetime] = None,
    ):
        """
        Initialize solver with trip data.

        Args:
            trip_data: Trip data dict with start_location, end_location, stops
            drive_times: Dict mapping (stop_id, stop_id) to duration_seconds
            departure_time: Optional explicit departure time (defaults to 08:00 on trip date)
        """
        self.trip_data = trip_data
        self.drive_times = drive_times or {}
        self.warnings: list[str] = []

        # Set departure time
        if departure_time:
            self.departure_time = departure_time
        else:
            # Default to 08:00 on trip date
            trip_date = trip_data.get("date", datetime.now().strftime("%Y-%m-%d"))
            self.departure_time = datetime.strptime(f"{trip_date} 08:00", "%Y-%m-%d %H:%M")

    def solve(self) -> tuple[dict, list[str]]:
        """
        Solve constraints and return updated trip data with warnings.

        Returns:
            Tuple of (updated_trip_data, warnings)
        """
        self.warnings = []

        stops = self.trip_data.get("stops", [])
        if not stops:
            return self.trip_data, []

        # Get start/end locations
        start_location = self._get_coordinates(self.trip_data.get("start_location", {}))
        end_location = self._get_coordinates(self.trip_data.get("end_location", {}))

        # Step 1: Find anchors
        anchors = self._find_anchors(stops)

        # Step 2: Forward pass from departure
        updated_stops = self._forward_pass(stops, start_location, end_location, anchors)

        # Step 3: Validate constraints
        self._validate_constraints(updated_stops)

        # Update trip data
        self.trip_data["stops"] = updated_stops

        return self.trip_data, self.warnings

    def _get_coordinates(self, location: Union[dict, object]) -> dict:
        """Extract lat/lon from location dict or object."""
        if isinstance(location, dict):
            return {"lat": location.get("lat", 0), "lon": location.get("lon", 0)}
        return {"lat": getattr(location, "lat", 0), "lon": getattr(location, "lon", 0)}

    def _get_stop_coordinates(self, stop: dict) -> dict:
        """Get coordinates from a stop dict."""
        coords = stop.get("coordinates", {})
        if isinstance(coords, dict):
            return {"lat": coords.get("lat", 0), "lon": coords.get("lon", 0)}
        return {"lat": getattr(coords, "lat", 0), "lon": getattr(coords, "lon", 0)}

    def _find_anchors(self, stops: list[dict]) -> list[int]:
        """Find indices of stops with is_anchor=True."""
        anchors = []
        for i, stop in enumerate(stops):
            if stop.get("is_anchor", False):
                anchors.append(i)
        return anchors

    def _forward_pass(
        self,
        stops: list[dict],
        start_location: dict,
        end_location: dict,
        anchors: list[int],
    ) -> list[dict]:
        """
        Propagate times forward from departure.
        """
        current_time = self.departure_time
        prev_location = start_location
        updated_stops = []

        for i, stop in enumerate(stops):
            stop_copy = stop.copy()
            stop_coords = self._get_stop_coordinates(stop)

            # Get drive time to this stop
            drive_seconds = self._get_drive_time(prev_location, stop_coords)

            if i in anchors and stop.get("planned_arrival"):
                # This is an anchor - use locked time
                try:
                    anchor_time = self._parse_datetime(stop["planned_arrival"])
                    expected_arrival = current_time + timedelta(seconds=drive_seconds)

                    if anchor_time < expected_arrival:
                        self.warnings.append(
                            f"Stop '{stop.get('name', 'Unknown')}' has locked time "
                            f"{anchor_time.strftime('%H:%M')} but earliest arrival is "
                            f"{expected_arrival.strftime('%H:%M')}"
                        )

                    current_time = anchor_time
                except (ValueError, TypeError):
                    # Invalid datetime, calculate normally
                    current_time = current_time + timedelta(seconds=drive_seconds)
            else:
                # Calculate arrival based on previous departure
                arrival_time = current_time + timedelta(seconds=drive_seconds)
                stop_copy["planned_arrival"] = arrival_time.isoformat()
                current_time = arrival_time

            # Calculate departure from this stop
            duration_minutes = stop.get("duration_minutes", 30)
            departure_time = current_time + timedelta(minutes=duration_minutes)
            stop_copy["planned_departure"] = departure_time.isoformat()
            current_time = departure_time

            prev_location = stop_coords
            updated_stops.append(stop_copy)

        # Calculate final arrival at destination
        final_drive = self._get_drive_time(prev_location, end_location)
        final_arrival = current_time + timedelta(seconds=final_drive)

        # Store estimated arrival in trip metadata
        self.trip_data["estimated_arrival"] = final_arrival.isoformat()

        return updated_stops

    def _validate_constraints(self, stops: list[dict]) -> None:
        """Validate all time constraints and add warnings."""
        total_duration_minutes = 0

        for i, stop in enumerate(stops):
            total_duration_minutes += stop.get("duration_minutes", 30)

            # Check if stop has opening hours metadata
            tags = stop.get("tags", {}) or {}
            opening_hours = tags.get("opening_hours")

            if opening_hours:
                # Basic opening hours check (simplified)
                try:
                    arrival = self._parse_datetime(stop.get("planned_arrival"))
                    if arrival:
                        arrival_hour = arrival.hour
                        # Simple check: warn if arriving before 7am or after 8pm
                        if arrival_hour < 7:
                            self.warnings.append(
                                f"Stop '{stop.get('name', 'Unknown')}' arrives at "
                                f"{arrival.strftime('%H:%M')} which may be too early"
                            )
                        elif arrival_hour >= 20:
                            self.warnings.append(
                                f"Stop '{stop.get('name', 'Unknown')}' arrives at "
                                f"{arrival.strftime('%H:%M')} which may be too late"
                            )
                except (ValueError, TypeError):
                    pass

        # Calculate total trip duration
        if stops:
            try:
                first_arrival = self._parse_datetime(stops[0].get("planned_arrival"))
                last_departure = self._parse_datetime(stops[-1].get("planned_departure"))
                if first_arrival and last_departure:
                    trip_duration = last_departure - first_arrival
                    hours = trip_duration.total_seconds() / 3600
                    if hours > 10:
                        self.warnings.append(
                            f"Trip duration at stops is {hours:.1f} hours - consider reducing stops"
                        )
            except (ValueError, TypeError):
                pass

    def _parse_datetime(self, dt_str: Optional[str]) -> Optional[datetime]:
        """Parse datetime from ISO string."""
        if not dt_str:
            return None
        try:
            # Handle ISO format with or without timezone
            if dt_str.endswith('Z'):
                dt_str = dt_str[:-1]
            if '+' in dt_str:
                dt_str = dt_str.split('+')[0]
            return datetime.fromisoformat(dt_str)
        except (ValueError, TypeError):
            return None

    def _get_drive_time(self, from_loc: dict, to_loc: dict) -> float:
        """
        Get drive time between two locations.
        Uses pre-computed times or estimates based on distance.
        """
        # Check pre-computed times
        key = (f"{from_loc['lat']},{from_loc['lon']}", f"{to_loc['lat']},{to_loc['lon']}")
        if key in self.drive_times:
            return self.drive_times[key]

        # Estimate based on straight-line distance
        # Assumes average speed of 50 km/h with 1.3x road factor
        distance_km = self._haversine_km(from_loc, to_loc)

        # Estimate: distance * 1.3 road factor / 50 km/h, converted to seconds
        estimated_seconds = (distance_km * 1.3 / 50) * 3600

        return estimated_seconds

    def _haversine_km(self, c1: dict, c2: dict) -> float:
        """Calculate distance in km between two coordinate dicts."""
        R = 6371  # Earth radius in km
        lat1, lat2 = radians(c1["lat"]), radians(c2["lat"])
        dlat = radians(c2["lat"] - c1["lat"])
        dlon = radians(c2["lon"] - c1["lon"])

        a = sin(dlat / 2) ** 2 + cos(lat1) * cos(lat2) * sin(dlon / 2) ** 2
        c = 2 * atan2(sqrt(a), sqrt(1 - a))
        return R * c

    def optimize_stop_order(self) -> list[dict]:
        """
        Optimize stop order to minimize total drive time.
        Uses simple nearest-neighbor heuristic.

        Returns:
            Reordered list of stops
        """
        stops = self.trip_data.get("stops", [])
        if len(stops) <= 2:
            return stops

        start_location = self._get_coordinates(self.trip_data.get("start_location", {}))

        # Separate locked and unlocked stops
        locked = [(i, s) for i, s in enumerate(stops) if s.get("is_anchor", False)]
        unlocked = [s for s in stops if not s.get("is_anchor", False)]

        if not unlocked:
            return stops

        # Nearest neighbor for unlocked stops
        current = start_location
        ordered = []
        remaining = unlocked.copy()

        while remaining:
            # Find nearest stop
            min_time = float("inf")
            nearest_idx = 0

            for i, stop in enumerate(remaining):
                stop_coords = self._get_stop_coordinates(stop)
                drive_time = self._get_drive_time(current, stop_coords)
                if drive_time < min_time:
                    min_time = drive_time
                    nearest_idx = i

            nearest = remaining.pop(nearest_idx)
            ordered.append(nearest)
            current = self._get_stop_coordinates(nearest)

        # Merge locked stops back at their positions
        result = ordered.copy()
        for orig_idx, stop in locked:
            # Insert at original relative position
            insert_idx = min(orig_idx, len(result))
            result.insert(insert_idx, stop)

        return result


def recalculate_trip_times(
    trip_data: dict,
    departure_time: Optional[datetime] = None,
) -> tuple[dict, list[str]]:
    """
    Convenience function to recalculate trip times.

    Args:
        trip_data: Trip data dict
        departure_time: Optional departure time

    Returns:
        Tuple of (updated_trip_data, warnings)
    """
    solver = ConstraintSolver(trip_data, departure_time=departure_time)
    return solver.solve()
