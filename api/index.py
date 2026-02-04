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

# LangGraph agents
from api.agents.graph import report_graph
from api.agents.state import create_initial_state

# Suppress SSL warnings
urllib3.disable_warnings(urllib3.exceptions.InsecureRequestWarning)

logger = logging.getLogger(__name__)

# ============== Environment Variables ==============
GROQ_API_KEY = os.environ.get("GROQ_API_KEY", "").strip()
LLM_MODEL = os.environ.get("LLM_MODEL", "llama-3.3-70b-versatile")

# Vercel KV (Redis-compatible persistent storage)
KV_REST_API_URL = os.environ.get("KV_REST_API_URL", "").strip()
KV_REST_API_TOKEN = os.environ.get("KV_REST_API_TOKEN", "").strip()

# Vercel Blob (for HTML report storage)
BLOB_READ_WRITE_TOKEN = os.environ.get("BLOB_READ_WRITE_TOKEN", "").strip()

# In-memory fallback storage (for local dev or KV errors)
# Note: This will be replaced by ConversationState typed dict after model is defined
conversations_storage: dict = {}


# ============== Vercel KV Persistence ==============

def kv_get(key: str) -> Optional[dict]:
    """Get value from Vercel KV (falls back to in-memory for local dev)"""
    if not KV_REST_API_URL or not KV_REST_API_TOKEN:
        # Fallback to in-memory storage for local development
        return conversations_storage.get(key)

    try:
        # Upstash REST API format: POST with Redis command array
        resp = requests.post(
            KV_REST_API_URL,
            headers={
                "Authorization": f"Bearer {KV_REST_API_TOKEN}",
                "Content-Type": "application/json"
            },
            json=["GET", key],
            timeout=10
        )
        if resp.status_code == 200:
            data = resp.json().get("result")
            if data:
                return json.loads(data)
        return None
    except Exception as e:
        logger.error(f"KV get error: {e}")
        # Fallback to in-memory
        return conversations_storage.get(key)


def kv_set(key: str, value: dict, ex: int = 86400) -> bool:
    """Set value in Vercel KV with TTL (default 24h)"""
    if not KV_REST_API_URL or not KV_REST_API_TOKEN:
        # Fallback to in-memory storage for local development
        conversations_storage[key] = value
        return True

    try:
        # Upstash REST API format: POST with Redis command array
        # SET key value EX seconds
        json_value = json.dumps(value, default=str)
        resp = requests.post(
            KV_REST_API_URL,
            headers={
                "Authorization": f"Bearer {KV_REST_API_TOKEN}",
                "Content-Type": "application/json"
            },
            json=["SET", key, json_value, "EX", ex],
            timeout=10
        )
        success = resp.status_code == 200
        if success:
            # Also update in-memory for faster access
            conversations_storage[key] = value
        else:
            logger.error(f"KV set failed: {resp.status_code} - {resp.text}")
        return success
    except Exception as e:
        logger.error(f"KV set error: {e}")
        # Fallback to in-memory
        conversations_storage[key] = value
        return True


def kv_delete(key: str) -> bool:
    """Delete key from Vercel KV"""
    if not KV_REST_API_URL or not KV_REST_API_TOKEN:
        conversations_storage.pop(key, None)
        return True

    try:
        # Upstash REST API format: POST with Redis command array
        resp = requests.post(
            KV_REST_API_URL,
            headers={
                "Authorization": f"Bearer {KV_REST_API_TOKEN}",
                "Content-Type": "application/json"
            },
            json=["DEL", key],
            timeout=10
        )
        # Also remove from in-memory
        conversations_storage.pop(key, None)
        return resp.status_code == 200
    except Exception as e:
        logger.error(f"KV delete error: {e}")
        conversations_storage.pop(key, None)
        return True


def get_conversation_state(conversation_id: str) -> Optional["ConversationState"]:
    """Load conversation from persistent storage"""
    data = kv_get(f"conv:{conversation_id}")
    if data:
        try:
            # Import happens at runtime when ConversationState is defined
            return ConversationState(**data)
        except Exception as e:
            logger.error(f"Error parsing conversation state: {e}")
    return None


def save_conversation_state(state: "ConversationState") -> None:
    """Save conversation to persistent storage"""
    kv_set(f"conv:{state.id}", state.model_dump(mode='json'), ex=86400)


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

# Note: conversations_storage is declared at the top of the file for forward reference compatibility
# It uses Vercel KV for persistence when available, falls back to in-memory for local dev


# System prompt for the AI assistant - enforces strict conversation flow
SYSTEM_PROMPT = """You are VistaTrek, a friendly trip planning assistant.

## STRICT CONVERSATION FLOW - FOLLOW EXACTLY

You MUST follow this exact sequence. ONE question per message. Do NOT skip phases.

### Current State
- Phase: {phase}
- Destination: {destination}
- Dates: {dates}
- Preferences: {preferences}
- Approved stops: {stops_count}

### Phase Rules

**GREETING phase:**
- First message only. Warmly greet and ask: "Where would you like to go?"
- Transition to DESTINATION after greeting

**DESTINATION phase:**
- Wait for a clear location (city, country, region)
- If user gives dates without destination, ask for destination first
- Confirm: "Great, you want to visit [location]. Is that correct?"
- Do NOT proceed until you have a valid destination
- Exit: Move to DATES when destination is confirmed

**DATES phase:**
- Ask: "When are you planning to travel? And for how many days?"
- Accept formats like "April 1st for 3 days" or "May 10-15" or "next week for 5 days"
- Confirm: "So you'll be traveling [start] to [end], that's [X] days"
- Exit: Move to PREFERENCES when dates are confirmed

**PREFERENCES phase:**
- Ask: "What experiences interest you most? (nature, food, history, adventure, relaxation)"
- Wait for at least one clear preference
- Confirm what you understood
- Exit: Move to PLANNING when at least one preference is captured

**PLANNING phase:**
- Suggest 3-5 specific, real places that match their preferences in the destination
- IMPORTANT: ALWAYS format suggestions as a NUMBERED LIST with this exact format in your message:
  1. Place Name - Brief description
  2. Place Name - Brief description
  (etc.)
- IMPORTANT: Also include the suggested places in the "extracted" field as "stops" array
- Example extracted: "stops": [{{"name": "Sagrada Familia", "reason": "Iconic Gaudí architecture"}}]
- If user approves the suggestions, keep the stops in extracted
- If user wants changes, suggest alternatives as a new numbered list
- When user says "done", "enough", "that's it", "finish", or similar, move to FINALIZE

**FINALIZE phase:**
- Say: "Perfect! I've gathered all the info for your trip. Click the button below to generate your shareable trip report!"
- Set next_phase to "finalize"

## RULES
- ONE question per message
- NEVER skip phases
- Be conversational but focused
- Match the user's language (English or Hebrew)
- Extract information from user messages even if embedded in conversation

## OUTPUT FORMAT
Output valid JSON:
{{
  "message": "Your response to user",
  "phase": "current_phase_name",
  "next_phase": "phase_to_transition_to (optional)",
  "extracted": {{
    "destination": "location if mentioned",
    "start_date": "YYYY-MM-DD if mentioned",
    "end_date": "YYYY-MM-DD if mentioned",
    "duration_days": number if mentioned,
    "vibes": ["interests"],
    "pace": "relaxed|moderate|active",
    "stops": [{{"name": "Place Name", "reason": "Why visit"}}]
  }},
  "quick_replies": ["Option1", "Option2"]
}}

Only include fields relevant to the response."""


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


def extract_stops_from_text(message: str, destination: LocationEntity) -> list[dict]:
    """Extract place names from LLM conversational text using pattern matching.
    Uses multiple strategies: numbered lists, bold text, comma lists, and
    proper noun extraction as a robust fallback."""
    stops = []

    # Pattern 1: Numbered items with dash description: "1. Place Name - description"
    numbered = re.findall(r'\d+[\.\)]\s*(.+?)(?:\s*[-–—]\s)', message)
    for name in numbered:
        name = name.strip().rstrip('.,;:')
        if name and len(name) > 2 and len(name) < 80:
            stops.append({"name": name})

    # Pattern 1b: Numbered items on separate lines without dash
    if not stops:
        numbered2 = re.findall(r'\d+[\.\)]\s*(.+?)(?:\n|,\s*\d|$)', message)
        for name in numbered2:
            name = name.strip().rstrip('.,;:')
            if name and len(name) > 2 and len(name) < 80:
                stops.append({"name": name})

    # Pattern 2: Bold names: **Place Name**
    if not stops:
        bold = re.findall(r'\*\*(.+?)\*\*', message)
        for name in bold:
            name = name.strip()
            if name and len(name) > 2 and len(name) < 80:
                stops.append({"name": name})

    # Pattern 3: Proper noun extraction (robust fallback for conversational text)
    # Extracts capitalized multi-word phrases like "La Sagrada Familia", "Park Güell"
    if not stops:
        # Match proper noun phrases: optional article/prefix + capitalized words
        candidates = re.findall(
            r'((?:(?:La |El |Les |The |Park |Camp |Casa |Palau |Plaça |Passeig |Mont)[A-ZÀ-Üa-zà-ü]+\s)?[A-ZÀ-Ü][a-zà-ü\'éèêëàâîïôùûüñç]+(?:\s+(?:de |del |la |el |di |d\')?[A-ZÀ-Ü][a-zà-ü\'éèêëàâîïôùûüñç]+){1,3})',
            message
        )

        # Build exclusion set from destination name
        dest_name = ""
        if destination:
            dest_name = (destination.display_name or destination.normalized or "").lower()
        exclude_lower = {
            'barcelona', 'spain', 'catalonia', 'paris', 'france', 'rome', 'italy',
            'antoni gaudí', 'gaudí', 'don\'t miss',
        }
        # Also exclude words from the destination display name
        if dest_name:
            for part in dest_name.split(','):
                exclude_lower.add(part.strip().lower())

        seen = set()
        for phrase in candidates:
            clean = phrase.strip()
            # Strip leading verbs and English articles
            clean = re.sub(
                r'^(?:Visit|See|Check out|Explore|Try|Head to|Don\'t miss|The|A)\s+',
                '', clean
            ).strip()
            if (clean.lower() not in exclude_lower
                    and clean not in seen
                    and len(clean) > 3
                    and len(clean) < 80):
                seen.add(clean)
                stops.append({"name": clean})

    logger.info(f"Pattern-extracted {len(stops)} stop names from text")
    return stops[:8]  # Cap at 8 stops


def build_llm_messages(state: ConversationState) -> list[dict]:
    """Build message history for LLM with state injected into system prompt"""
    # Prepare state values for template
    destination = state.destination.display_name if state.destination else "Not set"
    dates = f"{state.date_range.start} to {state.date_range.end}" if state.date_range else "Not set"
    preferences = ", ".join(state.preferences.vibes) if state.preferences and state.preferences.vibes else "Not set"
    stops_count = len(state.approved_stops)

    # Inject state into system prompt
    formatted_prompt = SYSTEM_PROMPT.format(
        phase=state.phase.value,
        destination=destination,
        dates=dates,
        preferences=preferences,
        stops_count=stops_count
    )

    messages = [{"role": "system", "content": formatted_prompt}]

    # Add recent messages (last 10)
    for msg in state.messages[-10:]:
        messages.append({
            "role": msg.role if msg.role != "system" else "assistant",
            "content": msg.content,
        })

    return messages


def geocode_location_fast(query: str, language: str = "he") -> Optional[LocationEntity]:
    """Fast geocode with short timeout for batch stop geocoding"""
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
            timeout=3
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
                confidence=0.8,
                display_name=data.get("display_name"),
            )
    except Exception as e:
        logger.warning(f"Fast geocoding failed for '{query}': {e}")
    return None


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


def parse_flexible_date(date_str: str) -> Optional[str]:
    """Parse various date formats and return ISO format (YYYY-MM-DD)"""
    if not date_str:
        return None

    # Already in ISO format
    if re.match(r'^\d{4}-\d{2}-\d{2}$', date_str):
        return date_str

    # Common date formats to try
    formats = [
        "%Y-%m-%d",      # 2024-04-15
        "%d/%m/%Y",      # 15/04/2024
        "%m/%d/%Y",      # 04/15/2024
        "%B %d",         # April 15
        "%B %d, %Y",     # April 15, 2024
        "%d %B",         # 15 April
        "%d %B %Y",      # 15 April 2024
        "%b %d",         # Apr 15
        "%b %d, %Y",     # Apr 15, 2024
    ]

    # Get current year for dates without year
    current_year = datetime.utcnow().year

    for fmt in formats:
        try:
            parsed = datetime.strptime(date_str.strip(), fmt)
            # If year is 1900 (default), use current or next year
            if parsed.year == 1900:
                parsed = parsed.replace(year=current_year)
                # If date is in the past, use next year
                if parsed < datetime.utcnow():
                    parsed = parsed.replace(year=current_year + 1)
            return parsed.strftime("%Y-%m-%d")
        except ValueError:
            continue

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

    # Handle dates with flexible parsing
    start_date_raw = extracted.get("start_date")
    end_date_raw = extracted.get("end_date")
    duration = extracted.get("duration_days")

    start_date = parse_flexible_date(start_date_raw) if start_date_raw else None
    end_date = parse_flexible_date(end_date_raw) if end_date_raw else None

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

    # Handle stops from PLANNING phase
    stops_data = extracted.get("stops", [])
    if stops_data and state.phase in (ConversationPhase.PLANNING, ConversationPhase.FINALIZE):
        dest_name = ""
        if state.destination:
            dest_name = state.destination.display_name or state.destination.normalized or ""

        # Get existing stop names to avoid duplicates
        existing_names = {s.name.lower() for s in state.approved_stops}

        for stop_info in stops_data[:5]:  # Cap at 5 stops to stay within timeout
            stop_name = stop_info.get("name", "")
            if not stop_name or stop_name.lower() in existing_names:
                continue

            # Geocode the stop name (with destination context for better results)
            search_query = f"{stop_name}, {dest_name}" if dest_name else stop_name
            try:
                location = geocode_location_fast(search_query, language)
            except Exception:
                location = None
            if location:
                stop = Stop(
                    id=str(uuid.uuid4()),
                    name=stop_name,
                    type="attraction",
                    coordinates=location.coordinates,
                    planned_arrival=datetime.utcnow().isoformat(),
                    planned_departure=datetime.utcnow().isoformat(),
                    duration_minutes=30,
                )
                state.approved_stops.append(stop)
                existing_names.add(stop_name.lower())
                logger.info(f"Added stop: {stop_name} at ({location.coordinates.lat}, {location.coordinates.lon})")


def auto_advance_phase(state: ConversationState):
    """Auto-advance phase based on completed data"""
    # If we have destination during GREETING, skip straight to DATES
    if state.phase == ConversationPhase.GREETING and state.destination:
        if state.destination.alternatives:
            state.phase = ConversationPhase.CLARIFY_LOCATION
        else:
            state.phase = ConversationPhase.DATES

    # Handle DESTINATION phase
    if state.phase == ConversationPhase.DESTINATION:
        if state.destination and not state.destination.alternatives:
            state.phase = ConversationPhase.DATES
        elif state.destination and state.destination.alternatives:
            state.phase = ConversationPhase.CLARIFY_LOCATION

    # Move from DATES to PREFERENCES when we have date_range
    if state.phase == ConversationPhase.DATES and state.date_range:
        state.phase = ConversationPhase.PREFERENCES

    # Move from PREFERENCES to PLANNING only when we have actual vibes
    if state.phase == ConversationPhase.PREFERENCES and state.preferences and state.preferences.vibes:
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

    # Create or get conversation from persistent storage
    state = None
    if request.conversation_id:
        state = get_conversation_state(request.conversation_id)

    if state is None:
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

        # Save new conversation to persistent storage
        save_conversation_state(state)

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
        # Note: user message is already in state.messages (added above),
        # so build_llm_messages will include it - don't add it again
        llm_messages = build_llm_messages(state)

        ai_response = call_groq_api(llm_messages)
        parsed = parse_ai_response(ai_response)

        # Update state from extracted data
        if "extracted" in parsed:
            update_state_from_extracted(state, parsed["extracted"], request.language)

        # Handle phase transition from LLM suggestion
        if parsed.get("next_phase"):
            try:
                state.phase = ConversationPhase(parsed["next_phase"])
            except ValueError:
                pass

        # ALWAYS auto-advance based on extracted data
        # This ensures we move forward when data is complete, regardless of LLM suggestion
        auto_advance_phase(state)

        # Fallback: extract stops from message text in PLANNING/FINALIZE phases
        # if the LLM mentioned stops but didn't include them in extracted.stops
        if state.phase in (ConversationPhase.PLANNING, ConversationPhase.FINALIZE) and len(state.approved_stops) == 0:
            msg_text = parsed.get("message", "")
            if msg_text and state.destination:
                extracted_stops = extract_stops_from_text(msg_text, state.destination)
                if extracted_stops:
                    update_state_from_extracted(
                        state,
                        {"stops": extracted_stops},
                        request.language
                    )
                    logger.info(f"Fallback extracted {len(extracted_stops)} stops from text")

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

        # Save state to persistent storage
        save_conversation_state(state)

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

        # Save state even on error
        save_conversation_state(state)

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
    state = get_conversation_state(conversation_id)
    if state is None:
        raise HTTPException(
            status_code=404,
            detail="Conversation not found"
        )
    return state


@app.post("/api/chat/plan/{conversation_id}/stop-decision", response_model=StopDecisionResponse)
async def handle_stop_decision(conversation_id: str, request: StopDecisionRequest):
    """Handle user's decision on a proposed stop."""
    state = get_conversation_state(conversation_id)
    if state is None:
        raise HTTPException(status_code=404, detail="Conversation not found")

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

    # Save state to persistent storage
    save_conversation_state(state)

    return StopDecisionResponse(
        success=True,
        next_phase=state.phase,
        message=message,
        new_proposal=state.current_proposal
    )


# ============== Report Generation ==============

class ReportRequest(BaseModel):
    """Request to generate a trip report"""
    conversation_id: str


class ReportResponse(BaseModel):
    """Response with generated report URL"""
    status: str
    report_url: str
    trip_summary: dict


def generate_trip_html(state: ConversationState) -> str:
    """Generate comprehensive HTML trip report"""
    destination = state.destination.display_name if state.destination else "Your Trip"
    date_range = state.date_range
    stops = state.approved_stops

    # Build stops HTML
    stops_html = ""
    for i, stop in enumerate(stops, 1):
        coords = stop.coordinates
        maps_url = f"https://www.google.com/maps?q={coords.lat},{coords.lon}" if coords else "#"
        stops_html += f'''
        <div class="stop-card">
            <div class="stop-number">{i}</div>
            <div class="stop-content">
                <h3>{stop.name or "Stop"}</h3>
                <p class="stop-type">{stop.type or ""}</p>
                <a href="{maps_url}" target="_blank" class="maps-link">Open in Maps →</a>
            </div>
        </div>
        '''

    if not stops_html:
        stops_html = '<p class="no-stops">No stops have been added yet. Continue planning your trip!</p>'

    # Build preferences section if available
    preferences_html = ""
    if state.preferences and state.preferences.vibes:
        vibes = ", ".join(state.preferences.vibes)
        preferences_html = f'<p class="preferences"><strong>Interests:</strong> {vibes}</p>'

    # Date formatting
    date_display = ""
    if date_range:
        date_display = f'{date_range.start} → {date_range.end}'

    return f'''<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Trip to {destination} | VistaTrek</title>
    <style>
        * {{ margin: 0; padding: 0; box-sizing: border-box; }}
        body {{
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
            background: linear-gradient(135deg, #1a1a2e 0%, #16213e 100%);
            min-height: 100vh;
            color: #fff;
            padding: 2rem;
        }}
        .container {{ max-width: 800px; margin: 0 auto; }}
        .header {{
            text-align: center;
            padding: 2rem;
            background: rgba(255,255,255,0.1);
            border-radius: 20px;
            margin-bottom: 2rem;
            backdrop-filter: blur(10px);
        }}
        .header h1 {{
            font-size: 2.5rem;
            margin-bottom: 0.5rem;
            background: linear-gradient(90deg, #4CAF50, #8BC34A);
            -webkit-background-clip: text;
            -webkit-text-fill-color: transparent;
        }}
        .dates {{ color: #a0a0a0; font-size: 1.1rem; margin-bottom: 0.5rem; }}
        .preferences {{ color: #888; font-size: 0.95rem; }}
        .section-title {{
            font-size: 1.3rem;
            margin-bottom: 1rem;
            display: flex;
            align-items: center;
            gap: 0.5rem;
        }}
        .stop-card {{
            display: flex;
            gap: 1rem;
            background: rgba(255,255,255,0.05);
            border-radius: 12px;
            padding: 1.5rem;
            margin-bottom: 1rem;
            transition: transform 0.2s, background 0.2s;
        }}
        .stop-card:hover {{
            transform: translateX(5px);
            background: rgba(255,255,255,0.08);
        }}
        .stop-number {{
            width: 40px;
            height: 40px;
            background: linear-gradient(135deg, #4CAF50, #8BC34A);
            border-radius: 50%;
            display: flex;
            align-items: center;
            justify-content: center;
            font-weight: bold;
            flex-shrink: 0;
        }}
        .stop-content h3 {{ margin-bottom: 0.25rem; }}
        .stop-type {{ color: #888; font-size: 0.9rem; margin-bottom: 0.5rem; }}
        .maps-link {{
            color: #4CAF50;
            text-decoration: none;
            font-size: 0.9rem;
        }}
        .maps-link:hover {{ text-decoration: underline; }}
        .no-stops {{
            text-align: center;
            color: #666;
            padding: 2rem;
            background: rgba(255,255,255,0.03);
            border-radius: 12px;
        }}
        .footer {{
            text-align: center;
            padding: 2rem;
            color: #666;
            font-size: 0.9rem;
        }}
        .footer a {{ color: #4CAF50; text-decoration: none; }}
        .footer a:hover {{ text-decoration: underline; }}
    </style>
</head>
<body>
    <div class="container">
        <div class="header">
            <h1>🗺️ {destination}</h1>
            <p class="dates">{date_display}</p>
            {preferences_html}
        </div>
        <h2 class="section-title">📍 Your Stops ({len(stops)})</h2>
        {stops_html}
        <div class="footer">
            Generated by <a href="https://vistatrek.vercel.app" target="_blank">VistaTrek</a> • Plan your next adventure
        </div>
    </div>
</body>
</html>'''


def upload_to_blob(content: str, filename: str) -> str:
    """Upload HTML content to Vercel Blob and return public URL"""
    if not BLOB_READ_WRITE_TOKEN:
        # Fallback for local dev: return data URL
        import base64
        encoded = base64.b64encode(content.encode('utf-8')).decode('utf-8')
        return f"data:text/html;base64,{encoded}"

    try:
        response = requests.put(
            f"https://blob.vercel-storage.com/{filename}",
            headers={
                "Authorization": f"Bearer {BLOB_READ_WRITE_TOKEN}",
                "Content-Type": "text/html; charset=utf-8",
                "x-api-version": "7"
            },
            data=content.encode('utf-8'),
            timeout=30
        )

        if response.status_code == 200:
            result = response.json()
            return result.get("url", "")
        else:
            logger.error(f"Blob upload failed: {response.status_code} - {response.text}")
            raise HTTPException(status_code=502, detail="Failed to upload report")
    except requests.RequestException as e:
        logger.error(f"Blob upload error: {e}")
        raise HTTPException(status_code=502, detail=f"Report upload error: {str(e)}")


class ReportResponseV2(BaseModel):
    """Enhanced response with LangGraph validation info"""
    status: str
    report_url: str
    trip_summary: dict
    validation_status: Optional[str] = None
    validation_errors: Optional[list] = None
    stops_included: Optional[int] = None
    optimized_route: Optional[dict] = None  # {polyline, duration_seconds, distance_meters}


@app.post("/api/report/generate", response_model=ReportResponseV2)
async def generate_report(request: ReportRequest):
    """
    Generate HTML trip report using LangGraph agent pipeline.

    Pipeline:
    1. Research Agent - Enriches stops with API data, discovers new POIs
    2. Validation Agent - Verifies 100% data accuracy
    3. HTML Generator Agent - Creates polished report with AI descriptions
    """
    conv_state = get_conversation_state(request.conversation_id)
    if conv_state is None:
        raise HTTPException(status_code=404, detail="Conversation not found")

    # Build destination dict for agent pipeline
    destination_dict = {}
    if conv_state.destination:
        destination_dict = {
            "display_name": conv_state.destination.display_name or conv_state.destination.normalized,
            "coordinates": {
                "lat": conv_state.destination.coordinates.lat,
                "lon": conv_state.destination.coordinates.lon,
            },
            "country": conv_state.destination.country,
        }

    # Build date_range dict
    date_range_dict = {}
    if conv_state.date_range:
        date_range_dict = {
            "start": conv_state.date_range.start,
            "end": conv_state.date_range.end,
        }

    # Build preferences dict
    preferences_dict = {}
    if conv_state.preferences:
        preferences_dict = {
            "vibes": conv_state.preferences.vibes or [],
            "pace": conv_state.preferences.pace.value if conv_state.preferences.pace else "moderate",
        }

    # Convert approved stops to dict format for agents
    approved_stops_list = []
    for stop in conv_state.approved_stops:
        approved_stops_list.append({
            "id": stop.id,
            "name": stop.name,
            "type": stop.type,
            "coordinates": {
                "lat": stop.coordinates.lat,
                "lon": stop.coordinates.lon,
            } if stop.coordinates else {},
            "osm_id": stop.osm_id,
            "tags": stop.tags,
        })

    # Create initial state for agent pipeline
    initial_state = create_initial_state(
        conversation_id=request.conversation_id,
        destination=destination_dict,
        date_range=date_range_dict,
        preferences=preferences_dict,
        approved_stops=approved_stops_list,
    )

    # Debug: Log what we're passing to the pipeline
    logger.info(f"Pipeline input - destination: {destination_dict}")
    logger.info(f"Pipeline input - preferences: {preferences_dict}")
    logger.info(f"Pipeline input - approved_stops count: {len(approved_stops_list)}")

    try:
        # Run LangGraph agent pipeline
        logger.info(f"Starting LangGraph pipeline for conversation {request.conversation_id}")
        result = report_graph.invoke(initial_state)
        logger.info(f"LangGraph pipeline complete: status={result.get('generation_status')}")
        logger.info(f"Pipeline result - enriched_stops: {len(result.get('enriched_stops', []))}")
        logger.info(f"Pipeline result - validated_stops: {len(result.get('validated_stops', []))}")
        logger.info(f"Pipeline result - validation_status: {result.get('validation_status')}")

        # Check if report was generated
        html_content = result.get("html_report", "")
        if not html_content:
            logger.error("LangGraph pipeline produced no HTML content")
            raise HTTPException(status_code=500, detail="Report generation failed - no content produced")

        # Generate unique filename
        timestamp = datetime.utcnow().strftime("%Y%m%d-%H%M%S")
        filename = f"trip-{request.conversation_id[:8]}-{timestamp}.html"

        # Upload to Vercel Blob
        report_url = upload_to_blob(html_content, filename)

        # Build summary
        destination_name = destination_dict.get("display_name", "Unknown")
        date_display = ""
        if date_range_dict:
            date_display = f"{date_range_dict.get('start', '')} to {date_range_dict.get('end', '')}"

        return ReportResponseV2(
            status="success",
            report_url=report_url,
            trip_summary={
                "destination": destination_name,
                "dates": date_display,
                "stops_count": len(result.get("validated_stops", [])),
            },
            validation_status=result.get("validation_status"),
            validation_errors=result.get("validation_errors", []),
            stops_included=len(result.get("validated_stops", [])),
            optimized_route=result.get("optimized_route"),
        )

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"LangGraph pipeline error: {type(e).__name__}: {e}")

        # Fallback to simple HTML generation
        logger.info("Falling back to simple HTML generation")
        html_content = generate_trip_html(conv_state)

        timestamp = datetime.utcnow().strftime("%Y%m%d-%H%M%S")
        filename = f"trip-{request.conversation_id[:8]}-{timestamp}.html"
        report_url = upload_to_blob(html_content, filename)

        destination_name = conv_state.destination.display_name if conv_state.destination else "Unknown"
        date_display = ""
        if conv_state.date_range:
            date_display = f"{conv_state.date_range.start} to {conv_state.date_range.end}"

        return ReportResponseV2(
            status="success",
            report_url=report_url,
            trip_summary={
                "destination": destination_name,
                "dates": date_display,
                "stops_count": len(conv_state.approved_stops),
            },
            validation_status="fallback",
            validation_errors=[str(e)],
            stops_included=len(conv_state.approved_stops),
        )
