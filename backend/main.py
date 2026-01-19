"""
VistaTrek Backend - FastAPI application implementing the Macro-Meso-Micro algorithm
for scenic route planning with Golden Cluster recommendations.
"""

from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field
from typing import Optional
import requests
from requests.adapters import HTTPAdapter
from geopy.distance import geodesic
import math
import urllib3

# Suppress SSL warnings for development (OSRM demo server has SSL issues with old LibreSSL)
urllib3.disable_warnings(urllib3.exceptions.InsecureRequestWarning)

# Create a session with retries for resilience
http_session = requests.Session()

# ============== Pydantic Models ==============

class GeoPoint(BaseModel):
    lat: float = Field(..., ge=-90, le=90, description="Latitude")
    lon: float = Field(..., ge=-180, le=180, description="Longitude")


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
    route_geometry: list[list[float]]  # [[lon, lat], ...]
    recommended_stops: list[GoldenSpot]
    search_area: GeoPoint


# ============== FastAPI App ==============

app = FastAPI(
    title="VistaTrek API",
    description="Scenic route planning with Golden Cluster recommendations",
    version="1.0.0"
)

# CORS - allow all origins (restrict in production)
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


# ============== MACRO Layer: OSRM Route ==============

def get_osrm_route(start: GeoPoint, end: GeoPoint) -> dict:
    """
    Calls OSRM API to get route between two points.
    Returns polyline geometry, duration, and distance.
    """
    # Use HTTP for OSRM demo server (SSL issues with old LibreSSL on macOS)
    # In production, use HTTPS with a properly configured environment
    osrm_url = (
        f"http://router.project-osrm.org/route/v1/driving/"
        f"{start.lon},{start.lat};{end.lon},{end.lat}"
        f"?overview=full&geometries=geojson"
    )
    
    try:
        response = requests.get(osrm_url, timeout=10, verify=False)
        response.raise_for_status()
        data = response.json()

        if data.get("code") != "Ok" or not data.get("routes"):
            raise HTTPException(status_code=400, detail="Could not find route")

        route = data["routes"][0]
        return {
            "geometry": route["geometry"]["coordinates"],  # [[lon, lat], ...]
            "duration_sec": route["duration"],
            "distance_m": route["distance"]
        }
    except requests.RequestException as e:
        raise HTTPException(status_code=502, detail=f"OSRM service error: {str(e)}")


# ============== MESO Layer: Midpoint Calculation ==============

def find_route_midpoint(geometry: list[list[float]]) -> GeoPoint:
    """
    Find the approximate midpoint along the route geometry.
    """
    if not geometry:
        raise HTTPException(status_code=400, detail="Empty route geometry")
    
    # Calculate total distance
    total_distance = 0
    distances = []
    
    for i in range(len(geometry) - 1):
        p1 = (geometry[i][1], geometry[i][0])  # (lat, lon)
        p2 = (geometry[i + 1][1], geometry[i + 1][0])
        dist = geodesic(p1, p2).meters
        distances.append(dist)
        total_distance += dist
    
    # Find the point at half the total distance
    half_distance = total_distance / 2
    accumulated = 0
    
    for i, dist in enumerate(distances):
        if accumulated + dist >= half_distance:
            # Interpolate between geometry[i] and geometry[i+1]
            remaining = half_distance - accumulated
            ratio = remaining / dist if dist > 0 else 0
            
            lon = geometry[i][0] + ratio * (geometry[i + 1][0] - geometry[i][0])
            lat = geometry[i][1] + ratio * (geometry[i + 1][1] - geometry[i][1])
            
            return GeoPoint(lat=lat, lon=lon)
        accumulated += dist
    
    # Fallback to last point
    return GeoPoint(lat=geometry[-1][1], lon=geometry[-1][0])


# ============== MICRO Layer: Golden Clusters ==============

def find_golden_clusters(center: GeoPoint, radius_m: int = 10000) -> list[GoldenSpot]:
    """
    Query Overpass API for scenic spots and apply Golden Cluster scoring.
    
    Anchors: viewpoint, spring
    Logistics: parking
    Comforts: cafe, bench
    
    Scoring: base 50 + parking (+20) + cafe (+30) / bench (+10) + named (+10)
    """
    # Calculate bounding box
    lat_offset = radius_m / 111000  # ~111km per degree latitude
    lon_offset = radius_m / (111000 * math.cos(math.radians(center.lat)))
    
    south = center.lat - lat_offset
    north = center.lat + lat_offset
    west = center.lon - lon_offset
    east = center.lon + lon_offset
    
    # Overpass query for scenic elements
    # Use HTTP for compatibility with old LibreSSL on macOS
    overpass_url = "http://overpass-api.de/api/interpreter"
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
        print(f"Querying Overpass for area: ({south:.4f},{west:.4f},{north:.4f},{east:.4f})")
        response = requests.post(overpass_url, data={"data": overpass_query}, timeout=30, verify=False)
        print(f"Overpass response status: {response.status_code}")
        response.raise_for_status()
        data = response.json()
        print(f"Overpass returned {len(data.get('elements', []))} elements")
    except requests.RequestException as e:
        # Return empty list if Overpass fails - don't break the whole request
        print(f"Overpass API error: {e}")
        return []
    except Exception as e:
        print(f"Unexpected error parsing Overpass response: {e}")
        return []
    
    elements = data.get("elements", [])
    
    # Categorize elements
    anchors = []  # viewpoints, springs
    parking_spots = []
    comforts = []  # cafes, benches
    
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
    
    # Score anchors based on nearby amenities
    golden_spots = []
    
    for anchor in anchors:
        anchor_pos = (anchor["lat"], anchor["lon"])
        score = 50  # Base score
        reasons = []
        
        # Check for anchor type
        anchor_tags = anchor.get("tags", {})
        if anchor_tags.get("tourism") == "viewpoint":
            reasons.append("יעד יפה")
        elif anchor_tags.get("natural") == "spring":
            reasons.append("מעיין טבעי")
        
        # Check for parking within 400m
        has_parking = False
        for p in parking_spots:
            dist = geodesic(anchor_pos, (p["lat"], p["lon"])).meters
            if dist <= 400:
                has_parking = True
                score += 20
                reasons.append("🅿️ חניה קרובה")
                break
        
        # Check for comforts within 200m
        has_cafe = False
        has_bench = False
        for c in comforts:
            dist = geodesic(anchor_pos, (c["lat"], c["lon"])).meters
            if dist <= 200:
                comfort_type = c.get("tags", {}).get("amenity")
                if comfort_type == "cafe" and not has_cafe:
                    has_cafe = True
                    score += 30
                    reasons.append("☕ יש קפה!")
                elif comfort_type == "bench" and not has_bench:
                    has_bench = True
                    score += 10
                    reasons.append("🪑 ספסל לנוח")
        
        # Bonus for named locations
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
    
    # Sort by score descending and return top 5
    golden_spots.sort(key=lambda x: x.score, reverse=True)
    return golden_spots[:5]


# ============== Endpoints ==============

@app.get("/")
async def health_check():
    """Health check endpoint."""
    return {"status": "ok", "service": "VistaTrek API"}


@app.post("/plan_trip", response_model=TripResponse)
async def plan_trip(request: TripRequest):
    """
    Main endpoint: Given start and end coordinates, returns:
    - Route geometry
    - Trip summary (duration, distance)
    - Recommended scenic stops (Golden Clusters)
    """
    # MACRO: Get route from OSRM
    route_data = get_osrm_route(request.start, request.end)
    
    # MESO: Find midpoint for search area
    midpoint = find_route_midpoint(route_data["geometry"])
    
    # MICRO: Find Golden Clusters near midpoint
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


# ============== Run with Uvicorn ==============

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8000)
