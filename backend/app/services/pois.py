"""
VistaTrek POI Service
Overpass API integration for POI discovery
"""

import json
from datetime import datetime
from typing import Optional

import httpx
from sqlalchemy.orm import Session

from app.config import get_settings
from app.models.database import POICacheModel
from app.models.schemas import Coordinates, POI


class POIService:
    """Service for POI discovery using Overpass API."""

    # POI type mappings to OSM tags
    POI_TYPES = {
        "viewpoint": "tourism=viewpoint",
        "cafe": "amenity=cafe",
        "restaurant": "amenity=restaurant",
        "parking": "amenity=parking",
        "picnic_site": "tourism=picnic_site",
        "peak": "natural=peak",
        "waterfall": "waterway=waterfall",
        "spring": "natural=spring",
        "information": "tourism=information",
        "camp_site": "tourism=camp_site",
        "fuel": "amenity=fuel",
        "toilet": "amenity=toilets",
    }

    def __init__(self, db: Optional[Session] = None):
        self.settings = get_settings()
        self.base_url = self.settings.overpass_base_url
        self.db = db

    async def search_near(
        self,
        location: Coordinates,
        radius_meters: int = 5000,
        poi_types: Optional[list[str]] = None,
        limit: int = 20,
    ) -> list[POI]:
        """
        Search for POIs near a location.

        Args:
            location: Center point
            radius_meters: Search radius
            poi_types: Filter by POI types
            limit: Maximum results

        Returns:
            List of POI objects
        """
        # Build Overpass query
        filters = []
        types_to_search = poi_types or list(self.POI_TYPES.keys())

        for poi_type in types_to_search:
            if poi_type in self.POI_TYPES:
                tag = self.POI_TYPES[poi_type]
                key, value = tag.split("=")
                filters.append(f'node["{key}"="{value}"](around:{radius_meters},{location.lat},{location.lon});')

        query = f"""
        [out:json][timeout:25];
        (
            {chr(10).join(filters)}
        );
        out body {limit};
        """

        async with httpx.AsyncClient() as client:
            try:
                response = await client.post(
                    self.base_url,
                    data={"data": query},
                    timeout=30.0,
                )
                response.raise_for_status()
                data = response.json()

                pois = []
                for element in data.get("elements", []):
                    poi = self._element_to_poi(element)
                    if poi:
                        pois.append(poi)
                        self._cache_poi(poi, element)

                return pois[:limit]

            except (httpx.HTTPError, json.JSONDecodeError):
                return []

    async def search_along_route(
        self,
        route_coords: list[Coordinates],
        buffer_meters: int = 1000,
        poi_types: Optional[list[str]] = None,
        limit: int = 50,
    ) -> list[POI]:
        """
        Search for POIs along a route.

        Args:
            route_coords: Route coordinates
            buffer_meters: Buffer distance from route
            poi_types: Filter by POI types
            limit: Maximum results

        Returns:
            List of POI objects sorted by distance from route start
        """
        # Sample route to reduce query complexity
        sampled = self._sample_coords(route_coords, max_points=20)

        # Build poly string for Overpass
        poly_str = " ".join(f"{c.lat} {c.lon}" for c in sampled)

        filters = []
        types_to_search = poi_types or list(self.POI_TYPES.keys())

        for poi_type in types_to_search:
            if poi_type in self.POI_TYPES:
                tag = self.POI_TYPES[poi_type]
                key, value = tag.split("=")
                filters.append(f'node["{key}"="{value}"](poly:"{poly_str}");')

        query = f"""
        [out:json][timeout:30];
        (
            {chr(10).join(filters)}
        );
        out body {limit};
        """

        async with httpx.AsyncClient() as client:
            try:
                response = await client.post(
                    self.base_url,
                    data={"data": query},
                    timeout=35.0,
                )
                response.raise_for_status()
                data = response.json()

                pois = []
                for element in data.get("elements", []):
                    poi = self._element_to_poi(element)
                    if poi:
                        pois.append(poi)

                return pois[:limit]

            except (httpx.HTTPError, json.JSONDecodeError):
                return []

    def find_golden_clusters(
        self,
        pois: list[POI],
        cluster_radius_meters: int = 500,
    ) -> list[dict]:
        """
        Find Golden Triangle clusters (viewpoint + coffee + parking).

        Returns clusters scored by completeness and quality.
        """
        from math import radians, sin, cos, sqrt, atan2

        def haversine(c1: Coordinates, c2: Coordinates) -> float:
            """Calculate distance in meters between two coordinates."""
            R = 6371000  # Earth radius in meters
            lat1, lat2 = radians(c1.lat), radians(c2.lat)
            dlat = radians(c2.lat - c1.lat)
            dlon = radians(c2.lon - c1.lon)

            a = sin(dlat / 2) ** 2 + cos(lat1) * cos(lat2) * sin(dlon / 2) ** 2
            c = 2 * atan2(sqrt(a), sqrt(1 - a))
            return R * c

        # Group POIs by type (handle both string and enum types)
        viewpoints = [p for p in pois if str(p.type) == "viewpoint" or getattr(p.type, 'value', None) == "viewpoint"]
        coffees = [p for p in pois if str(p.type) in ("cafe", "restaurant", "coffee", "food") or getattr(p.type, 'value', None) in ("cafe", "restaurant", "coffee", "food")]
        parkings = [p for p in pois if str(p.type) == "parking" or getattr(p.type, 'value', None) == "parking"]

        clusters = []

        # Build clusters around viewpoints
        for vp in viewpoints:
            cluster = {
                "viewpoint": vp,
                "coffee": None,
                "parking": None,
                "center": vp.coordinates,
                "score": 0,
            }

            # Find nearest coffee
            nearest_coffee = None
            min_coffee_dist = float("inf")
            for coffee in coffees:
                dist = haversine(vp.coordinates, coffee.coordinates)
                if dist < cluster_radius_meters and dist < min_coffee_dist:
                    nearest_coffee = coffee
                    min_coffee_dist = dist

            if nearest_coffee:
                cluster["coffee"] = nearest_coffee
                cluster["score"] += 40

            # Find nearest parking
            nearest_parking = None
            min_parking_dist = float("inf")
            for parking in parkings:
                dist = haversine(vp.coordinates, parking.coordinates)
                if dist < cluster_radius_meters and dist < min_parking_dist:
                    nearest_parking = parking
                    min_parking_dist = dist

            if nearest_parking:
                cluster["parking"] = nearest_parking
                cluster["score"] += 30

            # Base score for viewpoint
            cluster["score"] += 30

            clusters.append(cluster)

        # Sort by score
        clusters.sort(key=lambda c: c["score"], reverse=True)

        return clusters

    def _element_to_poi(self, element: dict) -> Optional[POI]:
        """Convert Overpass element to POI object."""
        from app.models.schemas import StopType

        tags = element.get("tags", {})
        osm_id = element.get("id", 0)

        # Determine type
        poi_type = StopType.CUSTOM
        for type_name, tag_query in self.POI_TYPES.items():
            key, value = tag_query.split("=")
            if tags.get(key) == value:
                try:
                    poi_type = StopType(type_name)
                except ValueError:
                    poi_type = StopType.CUSTOM
                break

        return POI(
            id=str(osm_id),
            osm_id=osm_id,
            name=tags.get("name", f"Unnamed {poi_type.value}"),
            type=poi_type,
            coordinates=Coordinates(
                lat=element.get("lat", 0),
                lon=element.get("lon", 0),
            ),
            tags=tags,
            distance_from_route_km=None,
            match_score=None,
        )

    def _cache_poi(self, poi: POI, element: dict) -> None:
        """Cache POI to database."""
        if not self.db:
            return

        try:
            existing = (
                self.db.query(POICacheModel)
                .filter(POICacheModel.osm_id == int(poi.id))
                .first()
            )

            if existing:
                existing.name = poi.name
                existing.type = poi.type
                existing.lat = poi.coordinates.lat
                existing.lon = poi.coordinates.lon
                existing.tags = json.dumps(poi.tags)
                existing.fetched_at = datetime.utcnow()
            else:
                cache_entry = POICacheModel(
                    osm_id=int(poi.id),
                    name=poi.name,
                    type=poi.type,
                    lat=poi.coordinates.lat,
                    lon=poi.coordinates.lon,
                    tags=json.dumps(poi.tags),
                )
                self.db.add(cache_entry)

            self.db.commit()
        except Exception:
            self.db.rollback()

    def _sample_coords(
        self,
        coords: list[Coordinates],
        max_points: int = 20,
    ) -> list[Coordinates]:
        """Sample coordinates to reduce complexity."""
        if len(coords) <= max_points:
            return coords

        step = len(coords) // max_points
        sampled = [coords[i] for i in range(0, len(coords), step)]

        # Always include last point
        if sampled[-1] != coords[-1]:
            sampled.append(coords[-1])

        return sampled
