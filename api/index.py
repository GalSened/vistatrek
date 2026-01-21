"""
VistaTrek API - Vercel Serverless Function
Scenic route planning with Golden Cluster recommendations.
"""

from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import StreamingResponse
from pydantic import BaseModel, Field
from typing import Optional, Literal, AsyncGenerator
from enum import Enum
import requests
import uuid
import os
import json
import logging
from datetime import datetime, timedelta
from geopy.distance import geodesic
import math
import urllib3
import re

# Suppress SSL warnings
urllib3.disable_warnings(urllib3.exceptions.InsecureRequestWarning)

logger = logging.getLogger(__name__)

# ============== Environment Variables ==============
GROQ_API_KEY = os.environ.get("GROQ_API_KEY", "").strip()
LLM_MODEL = os.environ.get("LLM_MODEL", "llama-3.3-70b-versatile")


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


# ============== Conversation Planning Models ==============

class ConversationPhase(str, Enum):
    """State machine phases for conversational planning"""
    GREETING = "greeting"
    DESTINATION = "destination"
    CLARIFY_LOCATION = "clarify_location"
    DATES = "dates"
    PREFERENCES = "preferences"
    PLANNING = "planning"
    PROPOSE_STOP = "propose_stop"
    AWAIT_APPROVAL = "await_approval"
    MODIFY_STOP = "modify_stop"
    FINALIZE = "finalize"
    COMPLETE = "complete"


class StopDecision(str, Enum):
    """User's decision on a proposed stop"""
    APPROVE = "approve"
    REJECT = "reject"
    MODIFY = "modify"


class TripPace(str, Enum):
    """Trip pacing preference"""
    RELAXED = "relaxed"
    MODERATE = "moderate"
    ACTIVE = "active"


class DateRange(BaseModel):
    """Date range for multi-day trips"""
    start: str  # YYYY-MM-DD
    end: str    # YYYY-MM-DD


class LocationEntity(BaseModel):
    """Extracted location from user input"""
    raw_text: str
    normalized: str
    coordinates: Coordinates
    confidence: float = 0.8
    alternatives: Optional[list["LocationEntity"]] = None
    display_name: Optional[str] = None
    country: Optional[str] = None


class QuickReply(BaseModel):
    """Quick reply suggestion for chat UI"""
    label: str
    value: str
    icon: Optional[str] = None


class ProposedStop(BaseModel):
    """A stop proposed by AI for user approval"""
    id: str
    poi: POI
    reason: str
    estimated_duration_minutes: int = 30
    order_in_trip: int = 0
    alternatives: Optional[list[POI]] = None


class ConversationMessage(BaseModel):
    """A message in the conversation"""
    id: str
    role: str  # user, assistant, system
    content: str
    timestamp: datetime
    phase: Optional[ConversationPhase] = None
    proposed_stop: Optional[ProposedStop] = None
    quick_replies: Optional[list[QuickReply]] = None
    is_streaming: bool = False


class UserPreferences(BaseModel):
    """Extracted preferences from conversation"""
    vibes: list[str] = []
    pace: TripPace = TripPace.MODERATE
    interests: list[str] = []


class ConversationState(BaseModel):
    """Full state of a planning conversation"""
    id: str
    phase: ConversationPhase
    messages: list[ConversationMessage] = []
    created_at: datetime
    updated_at: datetime
    destination: Optional[LocationEntity] = None
    start_location: Optional[LocationEntity] = None
    date_range: Optional[DateRange] = None
    preferences: Optional[UserPreferences] = None
    approved_stops: list[Stop] = []
    current_proposal: Optional[ProposedStop] = None
    trip_id: Optional[str] = None


class ChatPlanRequest(BaseModel):
    """Request to send a message in conversation planning"""
    conversation_id: Optional[str] = None
    message: str = Field(..., min_length=1, max_length=2000)
    user_location: Optional[Coordinates] = None
    language: str = "he"


class ChatPlanResponse(BaseModel):
    """Response from conversation planning"""
    conversation_id: str
    phase: ConversationPhase
    message: ConversationMessage
    state: Optional[ConversationState] = None
    is_complete: bool = False


class StopDecisionRequest(BaseModel):
    """Request to approve/reject a proposed stop"""
    conversation_id: str
    stop_id: str
    decision: StopDecision
    modifications: Optional[dict] = None


class StopDecisionResponse(BaseModel):
    """Response after stop decision"""
    success: bool
    next_phase: ConversationPhase
    message: ConversationMessage
    new_proposal: Optional[ProposedStop] = None


# Update forward references
LocationEntity.model_rebuild()
ConversationState.model_rebuild()


# ============== Conversation Service ==============

# In-memory conversation storage (serverless - recreated per cold start)
conversations_storage: dict[str, ConversationState] = {}


# System prompt for the AI assistant
SYSTEM_PROMPT = """You are VistaTrek's friendly trip planning assistant. You help users plan amazing road trips in a conversational, collaborative way.

LANGUAGE: Respond in the same language the user uses. If they write in Hebrew, respond in Hebrew. If English, respond in English.

PERSONALITY:
- Warm, enthusiastic, and knowledgeable about travel
- Speak naturally, like a friend who loves travel planning
- Keep responses concise but engaging (2-3 sentences usually)
- Use emojis sparingly to add warmth

YOUR ROLE:
- Guide users through trip planning step by step
- Ask ONE question at a time
- Confirm understanding before moving on
- Suggest interesting stops based on their preferences

PHASES (follow this order):
1. GREETING: Welcome the user, ask where they want to go
2. DESTINATION: Understand their destination, clarify if ambiguous
3. DATES: Ask for travel dates (when and how long)
4. PREFERENCES: Ask about their travel style (pace, interests)
5. PROPOSE_STOP: Suggest ONE stop at a time with a brief reason
6. Continue proposing stops until user says they have enough

IMPORTANT RULES:
- Extract location names, dates, and preferences from user input
- If a location is ambiguous, ask for clarification
- Propose stops ONE at a time, wait for approval
- When user approves all stops, summarize the trip

OUTPUT FORMAT:
For each response, output valid JSON with these fields:
{
  "message": "Your response text to the user",
  "phase": "current_phase",
  "next_phase": "phase to transition to (optional)",
  "extracted": {
    "destination": "location name if mentioned",
    "start_date": "YYYY-MM-DD if mentioned",
    "end_date": "YYYY-MM-DD if mentioned",
    "duration_days": number if mentioned,
    "vibes": ["list", "of", "interests"],
    "pace": "relaxed|moderate|active"
  },
  "quick_replies": ["Suggested", "Quick", "Replies"]
}

Only include fields that are relevant to the current response."""


def call_groq_api(messages: list[dict], stream: bool = False) -> str:
    """Call Groq API using requests (synchronous for Vercel compatibility)"""
    if not GROQ_API_KEY:
        logger.error("GROQ_API_KEY is not set")
        raise HTTPException(
            status_code=503,
            detail="Chat planning not configured (missing GROQ_API_KEY)"
        )

    try:
        logger.info(f"Calling Groq API with model {LLM_MODEL}")
        response = requests.post(
            "https://api.groq.com/openai/v1/chat/completions",
            headers={
                "Authorization": f"Bearer {GROQ_API_KEY}",
                "Content-Type": "application/json"
            },
            json={
                "model": LLM_MODEL,
                "messages": messages,
                "temperature": 0.7,
                "max_tokens": 500,
            },
            timeout=30
        )
        logger.info(f"Groq API response status: {response.status_code}")

        if response.status_code != 200:
            logger.error(f"Groq API error: {response.status_code} - {response.text}")
            raise HTTPException(status_code=502, detail=f"LLM service error: {response.status_code}")

        data = response.json()
        content = data["choices"][0]["message"]["content"]
        logger.info(f"Groq API returned content of length {len(content)}")
        return content
    except requests.RequestException as e:
        logger.error(f"Groq API request error: {type(e).__name__}: {e}")
        raise HTTPException(status_code=502, detail=f"LLM service error: {str(e)}")
    except (KeyError, IndexError) as e:
        logger.error(f"Groq API response parsing error: {type(e).__name__}: {e}")
        raise HTTPException(status_code=502, detail=f"LLM service response error: {str(e)}")
    except Exception as e:
        logger.error(f"Groq API unexpected error: {type(e).__name__}: {e}")
        raise HTTPException(status_code=502, detail=f"LLM service unexpected error: {str(e)}")


def parse_ai_response(response: str) -> dict:
    """Parse AI response JSON or extract text"""
    try:
        json_match = re.search(r'\{[\s\S]*\}', response)
        if json_match:
            return json.loads(json_match.group())
    except json.JSONDecodeError:
        pass
    return {"message": response}


def build_llm_messages(state: ConversationState) -> list[dict]:
    """Build message history for LLM"""
    messages = [{"role": "system", "content": SYSTEM_PROMPT}]

    # Add context summary
    context_parts = [f"Phase: {state.phase.value}"]
    if state.destination:
        context_parts.append(f"Destination: {state.destination.normalized}")
    if state.date_range:
        context_parts.append(f"Dates: {state.date_range.start} to {state.date_range.end}")
    if state.preferences:
        context_parts.append(f"Vibes: {', '.join(state.preferences.vibes)}")
    if state.approved_stops:
        context_parts.append(f"Approved stops: {len(state.approved_stops)}")

    if context_parts:
        messages.append({"role": "system", "content": f"Current context:\n" + "\n".join(context_parts)})

    # Add recent messages (last 10)
    for msg in state.messages[-10:]:
        messages.append({
            "role": msg.role if msg.role != "system" else "assistant",
            "content": msg.content,
        })

    return messages


def geocode_location(query: str, language: str = "he") -> Optional[LocationEntity]:
    """Geocode a location using Nominatim (synchronous for Vercel compatibility)"""
    try:
        response = requests.get(
            "https://nominatim.openstreetmap.org/search",
            params={
                "q": query,
                "format": "json",
                "limit": 1,
                "accept-language": language
            },
            headers={"User-Agent": "VistaTrek/1.0"},
            timeout=10
        )

        if response.status_code == 200 and response.json():
            data = response.json()[0]
            return LocationEntity(
                raw_text=query,
                normalized=data.get("display_name", query).split(",")[0],
                coordinates=Coordinates(
                    lat=float(data["lat"]),
                    lon=float(data["lon"])
                ),
                confidence=0.9,
                display_name=data.get("display_name"),
                country=data.get("address", {}).get("country")
            )
    except Exception as e:
        logger.error(f"Geocoding error: {e}")
    return None


def update_state_from_extracted(
    state: ConversationState,
    extracted: dict,
    language: str
):
    """Update conversation state from extracted data (synchronous for Vercel compatibility)"""
    # Handle destination
    if extracted.get("destination"):
        location = geocode_location(extracted["destination"], language)
        if location:
            state.destination = location

    # Handle dates
    start_date = extracted.get("start_date")
    end_date = extracted.get("end_date")
    duration = extracted.get("duration_days")

    if start_date:
        if end_date:
            state.date_range = DateRange(start=start_date, end=end_date)
        elif duration:
            try:
                start = datetime.strptime(start_date, "%Y-%m-%d")
                end = start + timedelta(days=int(duration) - 1)
                state.date_range = DateRange(
                    start=start_date,
                    end=end.strftime("%Y-%m-%d")
                )
            except ValueError:
                pass

    # Handle preferences
    vibes = extracted.get("vibes", [])
    pace = extracted.get("pace")

    if vibes or pace:
        if not state.preferences:
            state.preferences = UserPreferences(vibes=[], pace=TripPace.MODERATE, interests=[])
        if vibes:
            state.preferences.vibes = vibes
        if pace:
            try:
                state.preferences.pace = TripPace(pace)
            except ValueError:
                pass


def auto_advance_phase(state: ConversationState):
    """Auto-advance phase based on completed data"""
    if state.phase == ConversationPhase.GREETING and state.destination:
        state.phase = ConversationPhase.DESTINATION

    if state.phase == ConversationPhase.DESTINATION:
        if state.destination and not state.destination.alternatives:
            state.phase = ConversationPhase.DATES
        elif state.destination and state.destination.alternatives:
            state.phase = ConversationPhase.CLARIFY_LOCATION

    if state.phase == ConversationPhase.DATES and state.date_range:
        state.phase = ConversationPhase.PREFERENCES

    if state.phase == ConversationPhase.PREFERENCES and state.preferences:
        state.phase = ConversationPhase.PLANNING


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


# ============== Conversation Planning Endpoints ==============

@app.get("/api/chat/debug")
async def chat_debug():
    """Debug endpoint to check chat configuration"""
    return {
        "groq_api_key_set": bool(GROQ_API_KEY),
        "groq_api_key_prefix": GROQ_API_KEY[:10] + "..." if GROQ_API_KEY else None,
        "llm_model": LLM_MODEL,
        "conversations_count": len(conversations_storage)
    }


@app.post("/api/chat/plan", response_model=ChatPlanResponse)
async def send_plan_message(request: ChatPlanRequest):
    """
    Send a message in a planning conversation.
    Creates a new conversation if conversation_id is not provided.
    """
    now = datetime.utcnow()

    # Create or get conversation
    if request.conversation_id and request.conversation_id in conversations_storage:
        state = conversations_storage[request.conversation_id]
    else:
        # Create new conversation
        conversation_id = str(uuid.uuid4())
        state = ConversationState(
            id=conversation_id,
            phase=ConversationPhase.GREETING,
            messages=[],
            created_at=now,
            updated_at=now,
        )

        # If user provided location, store it
        if request.user_location:
            state.start_location = LocationEntity(
                raw_text="Current location",
                normalized="המיקום הנוכחי",
                coordinates=request.user_location,
                confidence=1.0
            )

        conversations_storage[conversation_id] = state

    # Add user message to history
    user_message = ConversationMessage(
        id=str(uuid.uuid4()),
        role="user",
        content=request.message,
        timestamp=now,
        phase=state.phase
    )
    state.messages.append(user_message)
    state.updated_at = now

    # Build LLM messages and call API
    try:
        llm_messages = build_llm_messages(state)
        llm_messages.append({"role": "user", "content": request.message})

        ai_response = call_groq_api(llm_messages)
        parsed = parse_ai_response(ai_response)

        # Update state from extracted data
        if "extracted" in parsed:
            update_state_from_extracted(state, parsed["extracted"], request.language)

        # Handle phase transition
        if parsed.get("next_phase"):
            try:
                state.phase = ConversationPhase(parsed["next_phase"])
            except ValueError:
                pass
        else:
            # Auto-advance based on extracted data
            auto_advance_phase(state)

        # Build quick replies if provided
        quick_replies = None
        if parsed.get("quick_replies"):
            quick_replies = [
                QuickReply(label=r, value=r)
                for r in parsed["quick_replies"][:4]
            ]

        # Create assistant message
        assistant_message = ConversationMessage(
            id=str(uuid.uuid4()),
            role="assistant",
            content=parsed.get("message", ai_response),
            timestamp=datetime.utcnow(),
            phase=state.phase,
            quick_replies=quick_replies
        )
        state.messages.append(assistant_message)

        # Check if complete
        is_complete = state.phase == ConversationPhase.COMPLETE

        return ChatPlanResponse(
            conversation_id=state.id,
            phase=state.phase,
            message=assistant_message,
            state=state,
            is_complete=is_complete
        )

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Chat planning error: {e}")

        # Return a fallback response
        error_message = ConversationMessage(
            id=str(uuid.uuid4()),
            role="assistant",
            content="מצטער, נתקלתי בבעיה. אנא נסה שוב." if request.language == "he" else "Sorry, I encountered an issue. Please try again.",
            timestamp=datetime.utcnow(),
            phase=state.phase
        )
        state.messages.append(error_message)

        return ChatPlanResponse(
            conversation_id=state.id,
            phase=state.phase,
            message=error_message,
            state=state,
            is_complete=False
        )


@app.get("/api/chat/plan/{conversation_id}", response_model=ConversationState)
async def get_conversation(conversation_id: str):
    """Get the current state of a planning conversation."""
    if conversation_id not in conversations_storage:
        raise HTTPException(
            status_code=404,
            detail="Conversation not found. Note: Conversations are stored in memory and may be lost on server restart."
        )
    return conversations_storage[conversation_id]


@app.post("/api/chat/plan/{conversation_id}/stop-decision", response_model=StopDecisionResponse)
async def handle_stop_decision(conversation_id: str, request: StopDecisionRequest):
    """Handle user's decision on a proposed stop."""
    if conversation_id not in conversations_storage:
        raise HTTPException(status_code=404, detail="Conversation not found")

    state = conversations_storage[conversation_id]
    now = datetime.utcnow()

    # Verify there's a current proposal
    if not state.current_proposal:
        raise HTTPException(status_code=400, detail="No stop currently proposed")

    proposal = state.current_proposal
    decision = request.decision

    if decision == StopDecision.APPROVE:
        # Convert proposal to stop and add to approved list
        stop = Stop(
            id=proposal.poi.id,
            name=proposal.poi.name,
            type=proposal.poi.type,
            coordinates=proposal.poi.coordinates,
            planned_arrival=now.isoformat(),
            planned_departure=(now + timedelta(minutes=proposal.estimated_duration_minutes)).isoformat(),
            duration_minutes=proposal.estimated_duration_minutes,
            osm_id=proposal.poi.osm_id,
            tags=proposal.poi.tags,
            is_anchor=False
        )
        state.approved_stops.append(stop)
        state.current_proposal = None
        state.phase = ConversationPhase.PROPOSE_STOP

        response_text = f"מעולה! הוספתי את {proposal.poi.name} לטיול. רוצה להוסיף עוד תחנות?"
        quick_replies = [
            QuickReply(label="כן, עוד תחנות", value="כן"),
            QuickReply(label="לא, זה מספיק", value="סיימתי")
        ]

    elif decision == StopDecision.REJECT:
        state.current_proposal = None
        state.phase = ConversationPhase.PROPOSE_STOP

        response_text = f"בסדר, דילגתי על {proposal.poi.name}. רוצה שאציע משהו אחר?"
        quick_replies = [
            QuickReply(label="כן, הצע אחר", value="הצע משהו אחר"),
            QuickReply(label="לא תודה", value="סיימתי")
        ]

    else:  # MODIFY
        state.phase = ConversationPhase.MODIFY_STOP
        response_text = f"אין בעיה, מה תרצה לשנות ב{proposal.poi.name}?"
        quick_replies = [
            QuickReply(label="הזמן", value="שנה את הזמן"),
            QuickReply(label="משך הביקור", value="שנה את משך הביקור"),
            QuickReply(label="בטל", value="בטל")
        ]

    # Create response message
    message = ConversationMessage(
        id=str(uuid.uuid4()),
        role="assistant",
        content=response_text,
        timestamp=now,
        phase=state.phase,
        quick_replies=quick_replies
    )
    state.messages.append(message)
    state.updated_at = now

    return StopDecisionResponse(
        success=True,
        next_phase=state.phase,
        message=message,
        new_proposal=state.current_proposal
    )
