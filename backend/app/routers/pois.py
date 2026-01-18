"""
VistaTrek POIs Router
Points of Interest discovery and caching
"""

from typing import Optional

from fastapi import APIRouter, Depends, Query
from sqlalchemy.orm import Session

from app.models.database import POICacheModel, get_db
from app.models.schemas import POI, Coordinates, GoldenCluster
from app.services.pois import POIService

router = APIRouter()


@router.get("/search", response_model=list[POI])
async def search_pois(
    lat: float = Query(..., ge=-90, le=90),
    lon: float = Query(..., ge=-180, le=180),
    radius: int = Query(default=5000, ge=100, le=50000),
    types: Optional[str] = Query(default=None, description="Comma-separated POI types"),
    limit: int = Query(default=20, ge=1, le=100),
    db: Session = Depends(get_db),
):
    """
    Search for POIs near a location.
    Uses Overpass API with local caching.

    Types can include: viewpoint, cafe, restaurant, parking, picnic_site, etc.
    """
    poi_types = types.split(",") if types else None
    location = Coordinates(lat=lat, lon=lon)

    poi_service = POIService(db=db)
    pois = await poi_service.search_near(
        location=location,
        radius_meters=radius,
        poi_types=poi_types,
        limit=limit,
    )

    return pois


@router.get("/cluster", response_model=list[dict])
async def get_poi_clusters(
    lat: float = Query(..., ge=-90, le=90),
    lon: float = Query(..., ge=-180, le=180),
    radius: int = Query(default=2000, ge=100, le=10000),
    db: Session = Depends(get_db),
):
    """
    Get Golden Triangle clusters (viewpoint + coffee + parking).
    Returns clusters scored by completeness and quality.
    """
    location = Coordinates(lat=lat, lon=lon)
    poi_service = POIService(db=db)

    # Search for all POI types needed for golden clusters
    cluster_types = ["viewpoint", "cafe", "restaurant", "parking"]
    pois = await poi_service.search_near(
        location=location,
        radius_meters=radius,
        poi_types=cluster_types,
        limit=100,  # Get more POIs for clustering
    )

    # Find golden clusters
    clusters = poi_service.find_golden_clusters(pois, cluster_radius_meters=500)

    # Convert to dict format for response
    return [
        {
            "viewpoint": cluster["viewpoint"].model_dump() if cluster["viewpoint"] else None,
            "coffee": cluster["coffee"].model_dump() if cluster["coffee"] else None,
            "parking": cluster["parking"].model_dump() if cluster["parking"] else None,
            "center": {"lat": cluster["center"].lat, "lon": cluster["center"].lon},
            "score": cluster["score"],
        }
        for cluster in clusters
    ]


@router.get("/along-route", response_model=list[POI])
async def get_pois_along_route(
    route_geometry: str = Query(..., description="JSON array of [lon, lat] coordinates"),
    buffer_meters: int = Query(default=1000, ge=100, le=5000),
    types: Optional[str] = Query(default=None),
    limit: int = Query(default=50, ge=1, le=200),
    db: Session = Depends(get_db),
):
    """
    Get POIs within buffer distance of a route.
    Used for Meso-point discovery in Macro-Meso-Micro algorithm.
    """
    import json

    try:
        # Parse route coordinates from JSON
        coords_list = json.loads(route_geometry)
        route_coords = [
            Coordinates(lat=coord[1], lon=coord[0])
            for coord in coords_list
        ]
    except (json.JSONDecodeError, IndexError, KeyError):
        return []

    if not route_coords:
        return []

    poi_types = types.split(",") if types else None
    poi_service = POIService(db=db)

    pois = await poi_service.search_along_route(
        route_coords=route_coords,
        buffer_meters=buffer_meters,
        poi_types=poi_types,
        limit=limit,
    )

    return pois


@router.get("/{osm_id}", response_model=POI)
async def get_poi_details(
    osm_id: int,
    db: Session = Depends(get_db),
):
    """
    Get detailed information about a specific POI.
    """
    # Check cache first
    cached = db.query(POICacheModel).filter(POICacheModel.osm_id == osm_id).first()

    if cached:
        return POI(
            id=str(cached.osm_id),
            name=cached.name or "Unknown",
            type=cached.type or "unknown",
            location=Coordinates(lat=cached.lat, lon=cached.lon),
            tags={} if not cached.tags else eval(cached.tags),  # TODO: Use JSON
        )

    # TODO: Fetch from Overpass if not cached

    return POI(
        id=str(osm_id),
        name="Unknown POI",
        type="unknown",
        location=Coordinates(lat=0, lon=0),
    )


@router.post("/cache/clear")
async def clear_poi_cache(
    older_than_days: int = Query(default=7, ge=1),
    db: Session = Depends(get_db),
):
    """
    Clear old POI cache entries.
    """
    from datetime import datetime, timedelta

    cutoff = datetime.utcnow() - timedelta(days=older_than_days)
    deleted = db.query(POICacheModel).filter(
        POICacheModel.fetched_at < cutoff
    ).delete()

    db.commit()

    return {"deleted": deleted}
