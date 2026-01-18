"""
VistaTrek Geo Utilities
Geographic calculations and helpers
"""

from math import radians, sin, cos, sqrt, atan2, degrees
from typing import Optional

from app.models.schemas import Coordinates


def haversine_distance(coord1: Coordinates, coord2: Coordinates) -> float:
    """
    Calculate the great-circle distance between two points in meters.

    Args:
        coord1: First coordinate
        coord2: Second coordinate

    Returns:
        Distance in meters
    """
    R = 6371000  # Earth radius in meters

    lat1, lat2 = radians(coord1.lat), radians(coord2.lat)
    dlat = radians(coord2.lat - coord1.lat)
    dlon = radians(coord2.lon - coord1.lon)

    a = sin(dlat / 2) ** 2 + cos(lat1) * cos(lat2) * sin(dlon / 2) ** 2
    c = 2 * atan2(sqrt(a), sqrt(1 - a))

    return R * c


def point_to_line_distance(
    point: Coordinates,
    line_start: Coordinates,
    line_end: Coordinates,
) -> float:
    """
    Calculate perpendicular distance from point to line segment in meters.
    Uses cross-track distance formula.

    Args:
        point: The point to measure from
        line_start: Start of line segment
        line_end: End of line segment

    Returns:
        Distance in meters
    """
    R = 6371000  # Earth radius in meters

    # Convert to radians
    lat1 = radians(line_start.lat)
    lon1 = radians(line_start.lon)
    lat2 = radians(line_end.lat)
    lon2 = radians(line_end.lon)
    lat3 = radians(point.lat)
    lon3 = radians(point.lon)

    # Angular distance from start to point
    d13 = haversine_distance(line_start, point) / R

    # Initial bearing from start to end
    theta12 = atan2(
        sin(lon2 - lon1) * cos(lat2),
        cos(lat1) * sin(lat2) - sin(lat1) * cos(lat2) * cos(lon2 - lon1),
    )

    # Initial bearing from start to point
    theta13 = atan2(
        sin(lon3 - lon1) * cos(lat3),
        cos(lat1) * sin(lat3) - sin(lat1) * cos(lat3) * cos(lon3 - lon1),
    )

    # Cross-track distance
    dxt = abs(asin(sin(d13) * sin(theta13 - theta12)))

    return R * dxt


def asin(x: float) -> float:
    """Safe asin that clamps input to [-1, 1]."""
    from math import asin as _asin
    return _asin(max(-1, min(1, x)))


def interpolate_along_route(
    route_coords: list[Coordinates],
    fraction: float,
) -> Coordinates:
    """
    Find point at given fraction along route.

    Args:
        route_coords: List of coordinates forming the route
        fraction: 0.0 to 1.0 position along route

    Returns:
        Interpolated coordinate
    """
    if not route_coords:
        raise ValueError("Route must have at least one coordinate")

    if fraction <= 0:
        return route_coords[0]
    if fraction >= 1:
        return route_coords[-1]

    # Calculate total distance
    total_dist = 0.0
    segment_dists = []

    for i in range(len(route_coords) - 1):
        d = haversine_distance(route_coords[i], route_coords[i + 1])
        segment_dists.append(d)
        total_dist += d

    # Find target distance
    target_dist = total_dist * fraction

    # Find segment containing target
    cumulative = 0.0
    for i, seg_dist in enumerate(segment_dists):
        if cumulative + seg_dist >= target_dist:
            # Interpolate within this segment
            seg_fraction = (target_dist - cumulative) / seg_dist if seg_dist > 0 else 0

            start = route_coords[i]
            end = route_coords[i + 1]

            return Coordinates(
                lat=start.lat + (end.lat - start.lat) * seg_fraction,
                lon=start.lon + (end.lon - start.lon) * seg_fraction,
            )

        cumulative += seg_dist

    return route_coords[-1]


def find_meso_points(
    route_coords: list[Coordinates],
    count: int = 5,
) -> list[Coordinates]:
    """
    Find evenly-spaced meso-points along a route.
    Used in Macro-Meso-Micro algorithm.

    Args:
        route_coords: Route coordinates
        count: Number of meso-points to find

    Returns:
        List of meso-point coordinates
    """
    if count <= 0:
        return []

    meso_points = []
    for i in range(1, count + 1):
        fraction = i / (count + 1)
        point = interpolate_along_route(route_coords, fraction)
        meso_points.append(point)

    return meso_points


def is_off_route(
    current: Coordinates,
    route_coords: list[Coordinates],
    threshold_meters: float = 500,
) -> bool:
    """
    Check if current position is off-route.

    Args:
        current: Current position
        route_coords: Route coordinates
        threshold_meters: Distance threshold for off-route detection

    Returns:
        True if off-route
    """
    if not route_coords:
        return True

    # Find minimum distance to any route segment
    min_dist = float("inf")

    for i in range(len(route_coords) - 1):
        dist = point_to_line_distance(current, route_coords[i], route_coords[i + 1])
        min_dist = min(min_dist, dist)

    return min_dist > threshold_meters
