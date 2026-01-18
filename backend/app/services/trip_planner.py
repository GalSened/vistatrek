"""
VistaTrek Trip Planner Service
Implements the Macro-Meso-Micro algorithm for intelligent trip planning
"""

import uuid
from typing import Optional

from app.models.schemas import (
    Coordinates,
    Route,
    POI,
    GoldenCluster,
    PlanTripRequest,
    PlanTripResponse,
    StopType,
)
from app.services.routing import RoutingService
from app.services.pois import POIService
from app.utils.geo import find_meso_points, haversine_distance


class TripPlannerService:
    """
    Implements the Macro-Meso-Micro algorithm:

    1. MACRO: Get main route from OSRM (A to B)
    2. MESO: Identify strategic midpoints along route
    3. MICRO: Find "micro-gems" (POIs) near meso-points
    4. CLUSTER: Group into Golden Triangles (viewpoint + coffee + parking)
    """

    def __init__(self, db_session=None):
        self.routing = RoutingService()
        self.poi_service = POIService(db=db_session)

    async def plan_trip(self, request: PlanTripRequest) -> PlanTripResponse:
        """
        Plan a trip using the Macro-Meso-Micro algorithm.

        Args:
            request: Trip planning request with start/end coordinates

        Returns:
            PlanTripResponse with route, POIs, and golden clusters
        """
        start = Coordinates(lat=request.start_lat, lon=request.start_lon)
        end = Coordinates(lat=request.end_lat, lon=request.end_lon)

        # MACRO: Get main route
        route = await self._get_macro_route(start, end)

        if not route or not route.polyline:
            # Return empty response if routing fails
            return PlanTripResponse(
                macro_route=Route(polyline=[], duration_seconds=0, distance_meters=0),
                micro_stops=[],
                golden_clusters=[],
                weather=None,
            )

        # Convert polyline to Coordinates for processing
        route_coords = [
            Coordinates(lat=coord[1], lon=coord[0])
            for coord in route.polyline
        ]

        # MESO: Find strategic midpoints
        meso_count = self._calculate_meso_count(route.distance_meters)
        meso_points = find_meso_points(route_coords, count=meso_count)

        # MICRO: Find POIs near meso-points
        micro_stops = await self._find_micro_gems(meso_points, request.vibes)

        # CLUSTER: Create Golden Triangle clusters
        golden_clusters = self._create_golden_clusters(micro_stops, meso_points)

        return PlanTripResponse(
            macro_route=route,
            micro_stops=micro_stops,
            golden_clusters=golden_clusters,
            weather=None,  # TODO: Integrate weather API
        )

    async def _get_macro_route(
        self,
        start: Coordinates,
        end: Coordinates,
    ) -> Optional[Route]:
        """Get the main route from OSRM."""
        return await self.routing.get_route(start, end)

    def _calculate_meso_count(self, distance_meters: float) -> int:
        """
        Calculate number of meso-points based on trip distance.

        Rules:
        - 1 meso-point per ~30km of route
        - Minimum 2, maximum 8 meso-points
        """
        distance_km = distance_meters / 1000
        count = int(distance_km / 30)
        return max(2, min(8, count))

    async def _find_micro_gems(
        self,
        meso_points: list[Coordinates],
        vibes: Optional[list[str]] = None,
    ) -> list[POI]:
        """
        Find POIs (micro-gems) near each meso-point.

        Args:
            meso_points: Strategic points along route
            vibes: User preferences to filter POI types

        Returns:
            List of unique POIs discovered
        """
        all_pois: dict[int, POI] = {}  # Use osm_id as key for deduplication

        # Map vibes to POI types
        poi_types = self._vibes_to_poi_types(vibes)

        for meso in meso_points:
            # Search for POIs near this meso-point
            pois = await self.poi_service.search_near(
                location=meso,
                radius_meters=3000,  # 3km radius
                poi_types=poi_types,
                limit=10,
            )

            for poi in pois:
                if poi.osm_id not in all_pois:
                    # Calculate distance from this meso-point
                    dist_km = haversine_distance(meso, poi.coordinates) / 1000
                    poi.distance_from_route_km = dist_km
                    all_pois[poi.osm_id] = poi

        return list(all_pois.values())

    def _vibes_to_poi_types(self, vibes: Optional[list[str]]) -> list[str]:
        """Convert user vibes to POI types."""
        if not vibes:
            return ["viewpoint", "cafe", "parking", "picnic_site"]

        type_map = {
            "nature": ["viewpoint", "peak", "waterfall", "spring", "picnic_site"],
            "chill": ["cafe", "restaurant", "picnic_site"],
            "hiking": ["viewpoint", "peak", "information", "parking"],
            "foodie": ["cafe", "restaurant"],
            "adventure": ["viewpoint", "peak", "waterfall", "camp_site"],
        }

        types = set()
        for vibe in vibes:
            if vibe.lower() in type_map:
                types.update(type_map[vibe.lower()])

        # Always include parking for convenience
        types.add("parking")

        return list(types)

    def _create_golden_clusters(
        self,
        pois: list[POI],
        meso_points: list[Coordinates],
    ) -> list[GoldenCluster]:
        """
        Create Golden Triangle clusters from discovered POIs.

        A Golden Cluster ideally contains:
        - A viewpoint (primary attraction)
        - A coffee/food spot nearby
        - Parking within reasonable distance
        """
        clusters = []

        # Find viewpoints as cluster anchors
        viewpoints = [p for p in pois if p.type == StopType.VIEWPOINT]
        coffees = [p for p in pois if p.type in (StopType.COFFEE, StopType.FOOD)]
        parkings = [p for p in pois if p.type == StopType.PARKING]

        for vp in viewpoints:
            cluster_id = str(uuid.uuid4())

            # Find nearest coffee within 500m
            nearest_coffee = self._find_nearest(vp.coordinates, coffees, max_distance=500)

            # Find nearest parking within 1km
            nearest_parking = self._find_nearest(vp.coordinates, parkings, max_distance=1000)

            # Calculate score
            score = 30  # Base score for having viewpoint
            if nearest_coffee:
                score += 40
            if nearest_parking:
                score += 30

            cluster = GoldenCluster(
                id=cluster_id,
                center=vp.coordinates,
                viewpoint=vp,
                parking=nearest_parking,
                coffee=nearest_coffee,
                total_score=float(score),
            )
            clusters.append(cluster)

        # Sort by score descending
        clusters.sort(key=lambda c: c.total_score, reverse=True)

        return clusters

    def _find_nearest(
        self,
        center: Coordinates,
        pois: list[POI],
        max_distance: float = 1000,
    ) -> Optional[POI]:
        """Find nearest POI within max_distance meters."""
        nearest = None
        min_dist = float("inf")

        for poi in pois:
            dist = haversine_distance(center, poi.coordinates)
            if dist < min_dist and dist <= max_distance:
                min_dist = dist
                nearest = poi

        return nearest
