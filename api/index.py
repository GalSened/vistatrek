"""
VistaTrek API - Vercel Serverless Function
Scenic route planning with Golden Cluster recommendations.
"""

from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field
from typing import Optional, Literal
import requests
import uuid
from datetime import datetime
from geopy.distance import geodesic
import math
import urllib3
import re

# Suppress SSL warnings
urllib3.disable_warnings(urllib3.exceptions.InsecureRequestWarning)


# ============== Pydantic Models ==============

class GeoPoint(BaseModel):
    lat: float = Field(..., ge=-90, le=90)
    lon: float = Field(..., ge=-180, le=180)


class TripRequest(BaseModel):
    start: GeoPoint
    end: GeoPoint


class GoldenSpot(BaseModel):
    id: int
    name: Optional[str] = None
    lat: float
    lon: float
    score: int
    tags: dict
    reasons: list[str]


class TripSummary(BaseModel):
    duration_min: int
    distance_km: float


class TripResponse(BaseModel):
    trip_summary: TripSummary
    route_geometry: list[list[float]]
    recommended_stops: list[GoldenSpot]
    search_area: GeoPoint


# ============== Frontend-Compatible Models ==============

StopType = Literal["viewpoint", "coffee", "food", "spring", "parking", "hotel", "custom"]


class FrontendPlanRequest(BaseModel):
    """Request format expected by the frontend"""
    start_lat: float = Field(..., ge=-90, le=90)
    start_lon: float = Field(..., ge=-180, le=180)
    end_lat: float = Field(..., ge=-90, le=90)
    end_lon: float = Field(..., ge=-180, le=180)
    date: Optional[str] = None
    vibes: Optional[list[str]] = None


class Coordinates(BaseModel):
    lat: float
    lon: float


class Route(BaseModel):
    polyline: list[list[float]]  # Array of [lon, lat]
    duration_seconds: int
    distance_meters: int


class POI(BaseModel):
    id: str
    osm_id: int
    name: str
    type: StopType
    coordinates: Coordinates
    tags: Optional[dict] = None
    distance_from_route_km: Optional[float] = None
    match_score: Optional[int] = None


class GoldenCluster(BaseModel):
    id: str
    center: Coordinates
    viewpoint: POI
    parking: Optional[POI] = None
    coffee: Optional[POI] = None
    total_score: int


class FrontendPlanResponse(BaseModel):
    """Response format expected by the frontend"""
    macro_route: Route
    micro_stops: list[POI]
    golden_clusters: list[GoldenCluster]


# ============== Trip CRUD Models ==============

TripStatus = Literal["draft", "active", "completed"]


class Stop(BaseModel):
    id: str
    name: str
    type: StopType
    coordinates: Coordinates
    planned_arrival: str
    planned_departure: str
    duration_minutes: int
    osm_id: Optional[int] = None
    tags: Optional[dict] = None
    is_anchor: bool = False
    actual_arrival: Optional[str] = None
    actual_departure: Optional[str] = None
    skipped: Optional[bool] = None


class TripExecution(BaseModel):
    started_at: str
    current_stop_index: int
    completed_stops: list[str]


class TripCreateRequest(BaseModel):
    """Request to create a new trip"""
    name: str = Field(..., max_length=100)
    start_location: Coordinates
    end_location: Coordinates
    date: str
    vibes: Optional[list[str]] = None


class Trip(BaseModel):
    """Full trip model for CRUD operations"""
    id: str
    name: str
    status: TripStatus
    created_at: str
    updated_at: str
    start_location: Coordinates
    end_location: Coordinates
    date: str
    vibes: Optional[list[str]] = None
    route: Route
    stops: list[Stop]
    suggestions: Optional[list[POI]] = None
    execution: Optional[TripExecution] = None


# ============== Chat Models ==============

class ChatActionRequest(BaseModel):
    text: str = Field(..., max_length=500)
    current_trip_id: Optional[str] = None
    user_location: Optional[Coordinates] = None


class ChatAction(BaseModel):
    type: Literal["add_stop", "remove_stop", "reorder", "recalculate", "none"]
    payload: Optional[dict] = None


class ChatActionResponse(BaseModel):
    reply: str
    action: Optional[ChatAction] = None
    updated_trip: Optional[Trip] = None


# ============== FastAPI App ==============

app = FastAPI(title="VistaTrek API", version="1.0.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


# ============== MACRO Layer ==============

def get_osrm_route(start: GeoPoint, end: GeoPoint) -> dict:
    osrm_url = (
        f"https://router.project-osrm.org/route/v1/driving/"
        f"{start.lon},{start.lat};{end.lon},{end.lat}"
        f"?overview=full&geometries=geojson"
    )
    
    try:
        response = requests.get(osrm_url, timeout=10)
        response.raise_for_status()
        data = response.json()

        if data.get("code") != "Ok" or not data.get("routes"):
            raise HTTPException(status_code=400, detail="Could not find route")

        route = data["routes"][0]
        return {
            "geometry": route["geometry"]["coordinates"],
            "duration_sec": route["duration"],
            "distance_m": route["distance"]
        }
    except requests.RequestException as e:
        raise HTTPException(status_code=502, detail=f"OSRM service error: {str(e)}")


# ============== MESO Layer ==============

def find_route_midpoint(geometry: list[list[float]]) -> GeoPoint:
    if not geometry:
        raise HTTPException(status_code=400, detail="Empty route geometry")
    
    total_distance = 0
    distances = []
    
    for i in range(len(geometry) - 1):
        p1 = (geometry[i][1], geometry[i][0])
        p2 = (geometry[i + 1][1], geometry[i + 1][0])
        dist = geodesic(p1, p2).meters
        distances.append(dist)
        total_distance += dist
    
    half_distance = total_distance / 2
    accumulated = 0
    
    for i, dist in enumerate(distances):
        if accumulated + dist >= half_distance:
            remaining = half_distance - accumulated
            ratio = remaining / dist if dist > 0 else 0
            lon = geometry[i][0] + ratio * (geometry[i + 1][0] - geometry[i][0])
            lat = geometry[i][1] + ratio * (geometry[i + 1][1] - geometry[i][1])
            return GeoPoint(lat=lat, lon=lon)
        accumulated += dist
    
    return GeoPoint(lat=geometry[-1][1], lon=geometry[-1][0])


# ============== MICRO Layer ==============

def find_golden_clusters(center: GeoPoint, radius_m: int = 10000) -> list[GoldenSpot]:
    lat_offset = radius_m / 111000
    lon_offset = radius_m / (111000 * math.cos(math.radians(center.lat)))
    
    south = center.lat - lat_offset
    north = center.lat + lat_offset
    west = center.lon - lon_offset
    east = center.lon + lon_offset
    
    overpass_url = "https://overpass-api.de/api/interpreter"
    overpass_query = f"""[out:json][timeout:25];
(
  node["tourism"="viewpoint"]({south},{west},{north},{east});
  node["natural"="spring"]({south},{west},{north},{east});
  node["amenity"="parking"]({south},{west},{north},{east});
  way["amenity"="parking"]({south},{west},{north},{east});
  node["amenity"="cafe"]({south},{west},{north},{east});
  node["amenity"="bench"]({south},{west},{north},{east});
);
out center;"""
    
    try:
        response = requests.post(overpass_url, data={"data": overpass_query}, timeout=30)
        response.raise_for_status()
        data = response.json()
    except Exception as e:
        print(f"Overpass API error: {e}")
        return []
    
    elements = data.get("elements", [])
    anchors, parking_spots, comforts = [], [], []
    
    for el in elements:
        tags = el.get("tags", {})
        lat = el.get("lat") or el.get("center", {}).get("lat")
        lon = el.get("lon") or el.get("center", {}).get("lon")
        
        if not lat or not lon:
            continue
        
        item = {
            "id": el.get("id"),
            "lat": lat,
            "lon": lon,
            "tags": tags,
            "name": tags.get("name") or tags.get("name:he") or tags.get("name:en")
        }
        
        if tags.get("tourism") == "viewpoint" or tags.get("natural") == "spring":
            anchors.append(item)
        elif tags.get("amenity") == "parking":
            parking_spots.append(item)
        elif tags.get("amenity") in ("cafe", "bench"):
            comforts.append(item)
    
    golden_spots = []
    
    for anchor in anchors:
        anchor_pos = (anchor["lat"], anchor["lon"])
        score = 50
        reasons = []
        
        anchor_tags = anchor.get("tags", {})
        if anchor_tags.get("tourism") == "viewpoint":
            reasons.append("יעד יפה")
        elif anchor_tags.get("natural") == "spring":
            reasons.append("מעיין טבעי")
        
        for p in parking_spots:
            if geodesic(anchor_pos, (p["lat"], p["lon"])).meters <= 400:
                score += 20
                reasons.append("🅿️ חניה קרובה")
                break
        
        has_cafe, has_bench = False, False
        for c in comforts:
            if geodesic(anchor_pos, (c["lat"], c["lon"])).meters <= 200:
                comfort_type = c.get("tags", {}).get("amenity")
                if comfort_type == "cafe" and not has_cafe:
                    has_cafe = True
                    score += 30
                    reasons.append("☕ יש קפה!")
                elif comfort_type == "bench" and not has_bench:
                    has_bench = True
                    score += 10
                    reasons.append("🪑 ספסל לנוח")
        
        if anchor.get("name"):
            score += 10
            reasons.insert(0, anchor["name"])
        
        golden_spots.append(GoldenSpot(
            id=anchor["id"],
            name=anchor.get("name"),
            lat=anchor["lat"],
            lon=anchor["lon"],
            score=score,
            tags=anchor.get("tags", {}),
            reasons=reasons
        ))
    
    golden_spots.sort(key=lambda x: x.score, reverse=True)
    return golden_spots[:5]


# ============== Endpoints ==============

@app.get("/api")
async def health_check():
    return {"status": "ok", "service": "VistaTrek API"}


@app.get("/api/health")
async def health_check_alt():
    """Alternative health endpoint for frontend compatibility"""
    return {"status": "ok"}


@app.post("/api/plan_trip", response_model=TripResponse)
async def plan_trip(request: TripRequest):
    route_data = get_osrm_route(request.start, request.end)
    midpoint = find_route_midpoint(route_data["geometry"])
    golden_spots = find_golden_clusters(midpoint)

    return TripResponse(
        trip_summary=TripSummary(
            duration_min=int(route_data["duration_sec"] / 60),
            distance_km=round(route_data["distance_m"] / 1000, 1)
        ),
        route_geometry=route_data["geometry"],
        recommended_stops=golden_spots,
        search_area=midpoint
    )


def determine_stop_type(tags: dict) -> StopType:
    """Determine the stop type from OSM tags"""
    if tags.get("tourism") == "viewpoint":
        return "viewpoint"
    if tags.get("natural") == "spring":
        return "spring"
    if tags.get("amenity") == "cafe":
        return "coffee"
    if tags.get("amenity") == "restaurant":
        return "food"
    if tags.get("amenity") == "parking":
        return "parking"
    return "viewpoint"


def golden_spot_to_poi(spot: GoldenSpot) -> POI:
    """Convert a GoldenSpot to a POI"""
    return POI(
        id=str(spot.id),
        osm_id=spot.id,
        name=spot.name or "Scenic Viewpoint",
        type=determine_stop_type(spot.tags),
        coordinates=Coordinates(lat=spot.lat, lon=spot.lon),
        tags=spot.tags,
        match_score=spot.score
    )


@app.post("/api/trips/plan", response_model=FrontendPlanResponse)
async def plan_trip_frontend(request: FrontendPlanRequest):
    """
    Frontend-compatible endpoint for trip planning.
    Accepts flat coordinates and returns response in frontend format.
    """
    # Convert flat coords to GeoPoint
    start = GeoPoint(lat=request.start_lat, lon=request.start_lon)
    end = GeoPoint(lat=request.end_lat, lon=request.end_lon)

    # Get route from OSRM
    route_data = get_osrm_route(start, end)

    # Find midpoint and golden clusters
    midpoint = find_route_midpoint(route_data["geometry"])
    golden_spots = find_golden_clusters(midpoint)

    # Convert golden spots to POIs
    micro_stops = [golden_spot_to_poi(spot) for spot in golden_spots]

    # Build golden clusters (group viewpoints with nearby parking/coffee)
    golden_clusters = []
    for spot in golden_spots:
        viewpoint_poi = golden_spot_to_poi(spot)
        golden_clusters.append(GoldenCluster(
            id=str(uuid.uuid4()),
            center=Coordinates(lat=spot.lat, lon=spot.lon),
            viewpoint=viewpoint_poi,
            total_score=spot.score
        ))

    return FrontendPlanResponse(
        macro_route=Route(
            polyline=route_data["geometry"],
            duration_seconds=int(route_data["duration_sec"]),
            distance_meters=int(route_data["distance_m"])
        ),
        micro_stops=micro_stops,
        golden_clusters=golden_clusters
    )


# ============== Trip CRUD Endpoints ==============

# In-memory storage (serverless - not persistent across invocations)
# For production, use a database like Supabase, PlanetScale, or Vercel KV
trips_storage: dict[str, Trip] = {}


@app.post("/api/trips", response_model=Trip)
async def create_trip(request: TripCreateRequest):
    """
    Create a new trip with route planning.
    Plans the route and finds golden clusters along the way.
    """
    # Validate trip name
    if len(request.name.strip()) == 0:
        raise HTTPException(status_code=400, detail="Trip name cannot be empty")

    # Clean the trip name (remove excessive whitespace)
    clean_name = re.sub(r'\s+', ' ', request.name.strip())[:100]

    # Convert coordinates to GeoPoints for routing
    start = GeoPoint(lat=request.start_location.lat, lon=request.start_location.lon)
    end = GeoPoint(lat=request.end_location.lat, lon=request.end_location.lon)

    # Get route from OSRM
    route_data = get_osrm_route(start, end)

    # Find midpoint and golden clusters
    midpoint = find_route_midpoint(route_data["geometry"])
    golden_spots = find_golden_clusters(midpoint)

    # Convert golden spots to suggested POIs
    suggestions = [golden_spot_to_poi(spot) for spot in golden_spots]

    # Generate trip ID and timestamps
    trip_id = str(uuid.uuid4())
    now = datetime.utcnow().isoformat() + "Z"

    # Create the trip object
    trip = Trip(
        id=trip_id,
        name=clean_name,
        status="draft",
        created_at=now,
        updated_at=now,
        start_location=request.start_location,
        end_location=request.end_location,
        date=request.date,
        vibes=request.vibes,
        route=Route(
            polyline=route_data["geometry"],
            duration_seconds=int(route_data["duration_sec"]),
            distance_meters=int(route_data["distance_m"])
        ),
        stops=[],
        suggestions=suggestions,
        execution=None
    )

    # Store the trip (in-memory, will be lost on cold start)
    trips_storage[trip_id] = trip

    return trip


@app.get("/api/trips/{trip_id}", response_model=Trip)
async def get_trip(trip_id: str):
    """
    Retrieve a trip by ID.
    Note: In serverless environment, trips may not persist between invocations.
    """
    if trip_id not in trips_storage:
        raise HTTPException(
            status_code=404,
            detail="Trip not found. Note: Trips are stored in memory and may be lost on server restart."
        )
    return trips_storage[trip_id]


@app.put("/api/trips/{trip_id}", response_model=Trip)
async def update_trip(trip_id: str, trip_update: Trip):
    """Update an existing trip."""
    if trip_id not in trips_storage:
        raise HTTPException(status_code=404, detail="Trip not found")

    # Update timestamp
    trip_update.updated_at = datetime.utcnow().isoformat() + "Z"
    trips_storage[trip_id] = trip_update
    return trip_update


@app.delete("/api/trips/{trip_id}")
async def delete_trip(trip_id: str):
    """Delete a trip by ID."""
    if trip_id not in trips_storage:
        raise HTTPException(status_code=404, detail="Trip not found")

    del trips_storage[trip_id]
    return {"status": "deleted", "id": trip_id}


# ============== Chat Action Endpoint ==============

@app.post("/api/chat/action", response_model=ChatActionResponse)
async def chat_action(request: ChatActionRequest):
    """
    Process a chat message and determine if it requires an action.
    This is a simplified implementation - a production version would use an LLM.
    """
    text_lower = request.text.lower().strip()

    # Simple keyword-based intent detection
    # In production, this would use an LLM like Claude or GPT

    # Check for add stop intent
    if any(word in text_lower for word in ["add", "stop at", "include", "visit"]):
        # Look for stop type keywords
        stop_type = None
        if "coffee" in text_lower or "cafe" in text_lower:
            stop_type = "coffee"
        elif "food" in text_lower or "restaurant" in text_lower or "eat" in text_lower:
            stop_type = "food"
        elif "viewpoint" in text_lower or "view" in text_lower or "scenic" in text_lower:
            stop_type = "viewpoint"
        elif "parking" in text_lower:
            stop_type = "parking"

        if stop_type:
            return ChatActionResponse(
                reply=f"I'll add a {stop_type} stop to your trip. Looking for the best options nearby...",
                action=ChatAction(
                    type="add_stop",
                    payload={"stop_type": stop_type}
                )
            )

    # Check for remove stop intent
    if any(word in text_lower for word in ["remove", "delete", "skip", "cancel"]):
        return ChatActionResponse(
            reply="Which stop would you like to remove? Please specify the stop name or number.",
            action=ChatAction(type="none")
        )

    # Check for reorder intent
    if any(word in text_lower for word in ["reorder", "move", "swap", "rearrange"]):
        return ChatActionResponse(
            reply="I can help you reorder your stops. Which stop would you like to move?",
            action=ChatAction(type="none")
        )

    # Check for recalculate intent
    if any(word in text_lower for word in ["recalculate", "update route", "new route", "optimize"]):
        return ChatActionResponse(
            reply="I'll recalculate your route with the current stops.",
            action=ChatAction(type="recalculate")
        )

    # Default response for unrecognized intents
    return ChatActionResponse(
        reply="I can help you plan your trip! Try saying things like:\n"
              "- 'Add a coffee stop'\n"
              "- 'Find a scenic viewpoint'\n"
              "- 'Recalculate my route'\n"
              "What would you like to do?",
        action=ChatAction(type="none")
    )
