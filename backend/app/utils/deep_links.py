"""
VistaTrek Deep Links
Navigation app deep link generation
"""

from urllib.parse import quote

from app.models.schemas import Coordinates, NavApp


def generate_nav_link(
    destination: Coordinates,
    app: NavApp,
    destination_name: str = "",
) -> str:
    """
    Generate deep link for navigation app.

    Args:
        destination: Target coordinates
        app: Navigation app (waze, google, apple)
        destination_name: Optional name for the destination

    Returns:
        Deep link URL string
    """
    lat, lon = destination.lat, destination.lon
    name_encoded = quote(destination_name) if destination_name else ""

    if app == NavApp.WAZE:
        # Waze deep link
        return f"https://waze.com/ul?ll={lat},{lon}&navigate=yes"

    elif app == NavApp.GOOGLE:
        # Google Maps deep link
        if destination_name:
            return f"https://www.google.com/maps/dir/?api=1&destination={lat},{lon}&destination_place_id={name_encoded}&travelmode=driving"
        return f"https://www.google.com/maps/dir/?api=1&destination={lat},{lon}&travelmode=driving"

    elif app == NavApp.APPLE:
        # Apple Maps deep link
        if destination_name:
            return f"https://maps.apple.com/?daddr={lat},{lon}&dirflg=d&t=m&q={name_encoded}"
        return f"https://maps.apple.com/?daddr={lat},{lon}&dirflg=d&t=m"

    else:
        # Default to Google Maps
        return f"https://www.google.com/maps/dir/?api=1&destination={lat},{lon}&travelmode=driving"


def generate_nav_link_with_waypoints(
    origin: Coordinates,
    destination: Coordinates,
    waypoints: list[Coordinates],
    app: NavApp,
) -> str:
    """
    Generate navigation link with multiple waypoints.
    Note: Not all apps support waypoints equally well.

    Args:
        origin: Starting point
        destination: End point
        waypoints: Intermediate stops
        app: Navigation app

    Returns:
        Deep link URL string
    """
    if app == NavApp.GOOGLE:
        # Google Maps supports waypoints
        waypoints_str = "|".join(f"{wp.lat},{wp.lon}" for wp in waypoints)
        return (
            f"https://www.google.com/maps/dir/?api=1"
            f"&origin={origin.lat},{origin.lon}"
            f"&destination={destination.lat},{destination.lon}"
            f"&waypoints={waypoints_str}"
            f"&travelmode=driving"
        )

    elif app == NavApp.WAZE:
        # Waze doesn't support waypoints in deep links
        # Navigate to first waypoint, user will need to continue manually
        if waypoints:
            return generate_nav_link(waypoints[0], NavApp.WAZE)
        return generate_nav_link(destination, NavApp.WAZE)

    elif app == NavApp.APPLE:
        # Apple Maps has limited waypoint support
        # Use the first waypoint as a via point
        if waypoints:
            return (
                f"https://maps.apple.com/?saddr={origin.lat},{origin.lon}"
                f"&daddr={waypoints[0].lat},{waypoints[0].lon}+to:{destination.lat},{destination.lon}"
                f"&dirflg=d"
            )
        return (
            f"https://maps.apple.com/?saddr={origin.lat},{origin.lon}"
            f"&daddr={destination.lat},{destination.lon}"
            f"&dirflg=d"
        )

    return generate_nav_link(destination, app)
