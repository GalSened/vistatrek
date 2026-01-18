"""
Tests for TripPlannerService
"""

import pytest
from unittest.mock import AsyncMock, MagicMock, patch

from app.models.schemas import (
    Coordinates,
    Route,
    POI,
    StopType,
    PlanTripRequest,
    GoldenCluster,
)
from app.services.trip_planner import TripPlannerService


@pytest.fixture
def trip_planner():
    """Create TripPlannerService instance."""
    return TripPlannerService(db_session=None)


@pytest.fixture
def sample_route():
    """Sample route for testing."""
    return Route(
        polyline=[
            (34.7818, 32.0853),  # Tel Aviv (lon, lat)
            (34.85, 32.0),
            (34.95, 31.9),
            (35.0, 31.85),
            (35.1, 31.8),
            (35.2137, 31.7683),  # Jerusalem
        ],
        duration_seconds=3600,
        distance_meters=60000,  # 60km
    )


@pytest.fixture
def sample_pois():
    """Sample POIs for testing."""
    return [
        POI(
            id="1",
            osm_id=1001,
            name="Mountain View",
            type=StopType.VIEWPOINT,
            coordinates=Coordinates(lat=31.9, lon=34.95),
            tags={"tourism": "viewpoint"},
            distance_from_route_km=0.5,
            match_score=None,
        ),
        POI(
            id="2",
            osm_id=1002,
            name="Cafe Oasis",
            type=StopType.COFFEE,
            coordinates=Coordinates(lat=31.901, lon=34.951),
            tags={"amenity": "cafe"},
            distance_from_route_km=0.6,
            match_score=None,
        ),
        POI(
            id="3",
            osm_id=1003,
            name="Rest Area Parking",
            type=StopType.PARKING,
            coordinates=Coordinates(lat=31.899, lon=34.949),
            tags={"amenity": "parking"},
            distance_from_route_km=0.4,
            match_score=None,
        ),
        POI(
            id="4",
            osm_id=1004,
            name="Valley Viewpoint",
            type=StopType.VIEWPOINT,
            coordinates=Coordinates(lat=31.85, lon=35.0),
            tags={"tourism": "viewpoint"},
            distance_from_route_km=0.3,
            match_score=None,
        ),
    ]


class TestMesoPointCalculation:
    """Tests for meso-point calculation logic."""

    def test_calculate_meso_count_short_trip(self, trip_planner):
        """Short trips should have minimum meso-points."""
        # 20km trip
        count = trip_planner._calculate_meso_count(20000)
        assert count == 2  # Minimum

    def test_calculate_meso_count_medium_trip(self, trip_planner):
        """Medium trips should have proportional meso-points."""
        # 90km trip -> 3 meso-points
        count = trip_planner._calculate_meso_count(90000)
        assert count == 3

    def test_calculate_meso_count_long_trip(self, trip_planner):
        """Long trips should be capped at maximum."""
        # 300km trip -> should be capped at 8
        count = trip_planner._calculate_meso_count(300000)
        assert count == 8  # Maximum


class TestVibesMapping:
    """Tests for vibes to POI type mapping."""

    def test_vibes_to_poi_types_nature(self, trip_planner):
        """Nature vibe should map to nature POI types."""
        types = trip_planner._vibes_to_poi_types(["nature"])
        assert "viewpoint" in types
        assert "peak" in types
        assert "waterfall" in types
        assert "parking" in types  # Always included

    def test_vibes_to_poi_types_foodie(self, trip_planner):
        """Foodie vibe should map to food POI types."""
        types = trip_planner._vibes_to_poi_types(["foodie"])
        assert "cafe" in types
        assert "restaurant" in types
        assert "parking" in types

    def test_vibes_to_poi_types_multiple(self, trip_planner):
        """Multiple vibes should combine POI types."""
        types = trip_planner._vibes_to_poi_types(["nature", "chill"])
        assert "viewpoint" in types
        assert "cafe" in types
        assert "picnic_site" in types

    def test_vibes_to_poi_types_none(self, trip_planner):
        """No vibes should return default POI types."""
        types = trip_planner._vibes_to_poi_types(None)
        assert "viewpoint" in types
        assert "cafe" in types
        assert "parking" in types
        assert "picnic_site" in types

    def test_vibes_to_poi_types_unknown(self, trip_planner):
        """Unknown vibes should only return parking."""
        types = trip_planner._vibes_to_poi_types(["unknown_vibe"])
        assert types == ["parking"]


class TestGoldenClusters:
    """Tests for Golden Triangle clustering."""

    def test_create_golden_clusters_complete(self, trip_planner, sample_pois):
        """Complete cluster with viewpoint, coffee, and parking."""
        meso_points = [Coordinates(lat=31.9, lon=34.95)]
        clusters = trip_planner._create_golden_clusters(sample_pois, meso_points)

        assert len(clusters) >= 1
        # First cluster should have highest score (complete triangle)
        cluster = clusters[0]
        assert cluster.viewpoint is not None
        assert cluster.total_score >= 30  # At least viewpoint score

    def test_create_golden_clusters_sorted_by_score(self, trip_planner, sample_pois):
        """Clusters should be sorted by score descending."""
        meso_points = [Coordinates(lat=31.9, lon=34.95)]
        clusters = trip_planner._create_golden_clusters(sample_pois, meso_points)

        if len(clusters) > 1:
            for i in range(len(clusters) - 1):
                assert clusters[i].total_score >= clusters[i + 1].total_score

    def test_create_golden_clusters_no_viewpoints(self, trip_planner):
        """No viewpoints should result in no clusters."""
        pois = [
            POI(
                id="1",
                osm_id=1001,
                name="Cafe Only",
                type=StopType.COFFEE,
                coordinates=Coordinates(lat=31.9, lon=34.95),
                tags={},
                distance_from_route_km=0.5,
                match_score=None,
            )
        ]
        meso_points = [Coordinates(lat=31.9, lon=34.95)]
        clusters = trip_planner._create_golden_clusters(pois, meso_points)
        assert len(clusters) == 0


class TestFindNearest:
    """Tests for nearest POI finding."""

    def test_find_nearest_within_distance(self, trip_planner, sample_pois):
        """Should find nearest POI within max distance."""
        center = Coordinates(lat=31.9, lon=34.95)
        coffees = [p for p in sample_pois if p.type == StopType.COFFEE]

        nearest = trip_planner._find_nearest(center, coffees, max_distance=1000)
        assert nearest is not None
        assert nearest.name == "Cafe Oasis"

    def test_find_nearest_beyond_distance(self, trip_planner, sample_pois):
        """Should return None if no POI within max distance."""
        center = Coordinates(lat=32.5, lon=35.5)  # Far away
        coffees = [p for p in sample_pois if p.type == StopType.COFFEE]

        nearest = trip_planner._find_nearest(center, coffees, max_distance=100)
        assert nearest is None

    def test_find_nearest_empty_list(self, trip_planner):
        """Should return None for empty POI list."""
        center = Coordinates(lat=31.9, lon=34.95)
        nearest = trip_planner._find_nearest(center, [], max_distance=1000)
        assert nearest is None


class TestPlanTrip:
    """Integration tests for full trip planning."""

    @pytest.mark.asyncio
    async def test_plan_trip_success(self, trip_planner, sample_route, sample_pois):
        """Successful trip planning with mocked services."""
        request = PlanTripRequest(
            start_lat=32.0853,
            start_lon=34.7818,
            end_lat=31.7683,
            end_lon=35.2137,
            vibes=["nature", "chill"],
        )

        with patch.object(
            trip_planner.routing, "get_route", new_callable=AsyncMock
        ) as mock_route:
            mock_route.return_value = sample_route

            with patch.object(
                trip_planner.poi_service, "search_near", new_callable=AsyncMock
            ) as mock_pois:
                mock_pois.return_value = sample_pois

                response = await trip_planner.plan_trip(request)

                assert response.macro_route is not None
                assert response.macro_route.distance_meters == 60000
                assert len(response.micro_stops) > 0

    @pytest.mark.asyncio
    async def test_plan_trip_no_route(self, trip_planner):
        """Trip planning should handle routing failure gracefully."""
        request = PlanTripRequest(
            start_lat=32.0853,
            start_lon=34.7818,
            end_lat=31.7683,
            end_lon=35.2137,
            vibes=None,
        )

        with patch.object(
            trip_planner.routing, "get_route", new_callable=AsyncMock
        ) as mock_route:
            mock_route.return_value = None

            response = await trip_planner.plan_trip(request)

            assert response.macro_route.polyline == []
            assert response.macro_route.distance_meters == 0
            assert len(response.micro_stops) == 0
            assert len(response.golden_clusters) == 0

    @pytest.mark.asyncio
    async def test_plan_trip_empty_polyline(self, trip_planner):
        """Trip planning should handle empty route polyline."""
        request = PlanTripRequest(
            start_lat=32.0853,
            start_lon=34.7818,
            end_lat=31.7683,
            end_lon=35.2137,
            vibes=None,
        )

        empty_route = Route(polyline=[], duration_seconds=0, distance_meters=0)

        with patch.object(
            trip_planner.routing, "get_route", new_callable=AsyncMock
        ) as mock_route:
            mock_route.return_value = empty_route

            response = await trip_planner.plan_trip(request)

            assert response.macro_route.polyline == []
            assert len(response.micro_stops) == 0


class TestMicroGemsDeduplication:
    """Tests for POI deduplication in micro-gems finding."""

    @pytest.mark.asyncio
    async def test_find_micro_gems_deduplicates(self, trip_planner):
        """POIs should be deduplicated by osm_id."""
        meso_points = [
            Coordinates(lat=31.9, lon=34.95),
            Coordinates(lat=31.91, lon=34.96),  # Close to first
        ]

        duplicate_poi = POI(
            id="1",
            osm_id=1001,
            name="Same POI",
            type=StopType.VIEWPOINT,
            coordinates=Coordinates(lat=31.9, lon=34.95),
            tags={},
            distance_from_route_km=None,
            match_score=None,
        )

        with patch.object(
            trip_planner.poi_service, "search_near", new_callable=AsyncMock
        ) as mock_search:
            # Return same POI for both meso points
            mock_search.return_value = [duplicate_poi]

            pois = await trip_planner._find_micro_gems(meso_points, None)

            # Should only have one POI despite searching from two points
            assert len(pois) == 1
            assert pois[0].osm_id == 1001
