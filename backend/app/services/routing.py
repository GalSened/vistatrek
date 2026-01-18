"""
VistaTrek Routing Service
OSRM integration for route calculation
"""

from typing import Optional

import httpx

from app.config import get_settings
from app.models.schemas import Coordinates, Route


class RoutingService:
    """Service for route calculation using OSRM."""

    def __init__(self):
        self.settings = get_settings()
        self.base_url = self.settings.osrm_base_url

    async def get_route(
        self,
        origin: Coordinates,
        destination: Coordinates,
        waypoints: Optional[list[Coordinates]] = None,
    ) -> Optional[Route]:
        """
        Get driving route from OSRM.

        Args:
            origin: Starting point
            destination: End point
            waypoints: Optional intermediate points

        Returns:
            Route object with geometry and metadata
        """
        # Build coordinates string
        coords = [f"{origin.lon},{origin.lat}"]

        if waypoints:
            for wp in waypoints:
                coords.append(f"{wp.lon},{wp.lat}")

        coords.append(f"{destination.lon},{destination.lat}")
        coords_str = ";".join(coords)

        # OSRM API call
        url = f"{self.base_url}/route/v1/driving/{coords_str}"
        params = {
            "overview": "full",
            "geometries": "geojson",
            "steps": "true",
            "annotations": "duration,distance",
        }

        async with httpx.AsyncClient() as client:
            try:
                response = await client.get(url, params=params, timeout=30.0)
                response.raise_for_status()
                data = response.json()

                if data.get("code") != "Ok" or not data.get("routes"):
                    return None

                route_data = data["routes"][0]
                geometry = route_data.get("geometry", {})

                # Convert GeoJSON coordinates to polyline format [lon, lat]
                polyline = []
                if isinstance(geometry, dict) and "coordinates" in geometry:
                    polyline = [
                        (coord[0], coord[1])  # [lon, lat]
                        for coord in geometry["coordinates"]
                    ]

                return Route(
                    polyline=polyline,
                    distance_meters=route_data["distance"],
                    duration_seconds=route_data["duration"],
                )

            except (httpx.HTTPError, KeyError, IndexError):
                return None

    async def get_distance_matrix(
        self,
        origins: list[Coordinates],
        destinations: list[Coordinates],
    ) -> Optional[list[list[float]]]:
        """
        Get distance/duration matrix between multiple points.
        Useful for optimizing stop order.
        """
        # Build coordinates
        all_coords = origins + destinations
        coords_str = ";".join(f"{c.lon},{c.lat}" for c in all_coords)

        # Source and destination indices
        sources = ";".join(str(i) for i in range(len(origins)))
        destinations_idx = ";".join(
            str(i) for i in range(len(origins), len(all_coords))
        )

        url = f"{self.base_url}/table/v1/driving/{coords_str}"
        params = {
            "sources": sources,
            "destinations": destinations_idx,
            "annotations": "duration",
        }

        async with httpx.AsyncClient() as client:
            try:
                response = await client.get(url, params=params, timeout=30.0)
                response.raise_for_status()
                data = response.json()

                if data.get("code") != "Ok":
                    return None

                return data.get("durations")

            except (httpx.HTTPError, KeyError):
                return None

    def decode_polyline(self, encoded: str, precision: int = 5) -> list[Coordinates]:
        """Decode a polyline string into coordinates."""
        coordinates = []
        index = lat = lon = 0
        factor = 10 ** precision

        while index < len(encoded):
            # Latitude
            shift = result = 0
            while True:
                b = ord(encoded[index]) - 63
                index += 1
                result |= (b & 0x1F) << shift
                shift += 5
                if b < 0x20:
                    break
            lat += (~(result >> 1) if result & 1 else result >> 1)

            # Longitude
            shift = result = 0
            while True:
                b = ord(encoded[index]) - 63
                index += 1
                result |= (b & 0x1F) << shift
                shift += 5
                if b < 0x20:
                    break
            lon += (~(result >> 1) if result & 1 else result >> 1)

            coordinates.append(Coordinates(lat=lat / factor, lon=lon / factor))

        return coordinates
