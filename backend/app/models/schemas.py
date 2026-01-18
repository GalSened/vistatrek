"""
VistaTrek - Pydantic Schemas
Data validation and serialization for API requests/responses
"""

from datetime import datetime
from enum import Enum
from typing import Optional
from pydantic import BaseModel, Field, field_validator


# =============================================================================
# Enums
# =============================================================================

class StopType(str, Enum):
    VIEWPOINT = "viewpoint"
    COFFEE = "coffee"
    FOOD = "food"
    SPRING = "spring"
    PARKING = "parking"
    HOTEL = "hotel"
    CUSTOM = "custom"


class TripStatus(str, Enum):
    DRAFT = "draft"
    ACTIVE = "active"
    COMPLETED = "completed"


class PacingStatus(str, Enum):
    EARLY = "early"
    ON_TIME = "on_time"
    LATE = "late"


class NavApp(str, Enum):
    WAZE = "waze"
    GOOGLE = "google"
    APPLE = "apple"


class ChatActionType(str, Enum):
    ADD_STOP = "add_stop"
    REMOVE_STOP = "remove_stop"
    REORDER = "reorder"
    RECALCULATE = "recalculate"
    NONE = "none"


# =============================================================================
# Base Models
# =============================================================================

class Coordinates(BaseModel):
    lat: float = Field(..., ge=-90, le=90, description="Latitude")
    lon: float = Field(..., ge=-180, le=180, description="Longitude")

    @field_validator("lat", "lon")
    @classmethod
    def validate_coordinates(cls, v: float) -> float:
        if not isinstance(v, (int, float)):
            raise ValueError("Coordinate must be a number")
        return float(v)


class Route(BaseModel):
    polyline: list[tuple[float, float]] = Field(..., description="Array of [lon, lat]")
    duration_seconds: float = Field(..., ge=0)
    distance_meters: float = Field(..., ge=0)


# =============================================================================
# POI Models
# =============================================================================

class POI(BaseModel):
    id: str
    osm_id: int
    name: str
    type: StopType
    coordinates: Coordinates
    tags: Optional[dict[str, str]] = None
    distance_from_route_km: Optional[float] = None
    match_score: Optional[float] = Field(None, ge=0, le=100)


class GoldenCluster(BaseModel):
    id: str
    center: Coordinates
    viewpoint: POI
    parking: Optional[POI] = None
    coffee: Optional[POI] = None
    total_score: float = Field(..., ge=0, le=100)


# =============================================================================
# Stop Models
# =============================================================================

class StopBase(BaseModel):
    name: str = Field(..., min_length=1, max_length=200)
    type: StopType
    coordinates: Coordinates
    duration_minutes: int = Field(..., ge=5, le=480)  # 5 min to 8 hours
    is_anchor: bool = False
    osm_id: Optional[int] = None
    tags: Optional[dict[str, str]] = None


class StopCreate(StopBase):
    pass


class Stop(StopBase):
    id: str
    planned_arrival: datetime
    planned_departure: datetime
    actual_arrival: Optional[datetime] = None
    actual_departure: Optional[datetime] = None
    skipped: bool = False


# =============================================================================
# Trip Models
# =============================================================================

class TripExecutionState(BaseModel):
    started_at: datetime
    current_stop_index: int = 0
    completed_stops: list[str] = []


class TripBase(BaseModel):
    name: str = Field(..., min_length=1, max_length=200)
    start_location: Coordinates
    end_location: Coordinates
    date: str = Field(..., pattern=r"^\d{4}-\d{2}-\d{2}$")  # YYYY-MM-DD
    vibes: Optional[list[str]] = None


class TripCreate(TripBase):
    pass


class Trip(TripBase):
    id: str
    status: TripStatus = TripStatus.DRAFT
    created_at: datetime
    updated_at: datetime
    route: Route
    stops: list[Stop]
    suggestions: Optional[list[POI]] = None
    execution: Optional[TripExecutionState] = None


# =============================================================================
# User Profile Models
# =============================================================================

class UserProfileBase(BaseModel):
    name: Optional[str] = Field(None, max_length=100)
    hiking_score: float = Field(5.0, ge=1, le=10)
    foodie_score: float = Field(5.0, ge=1, le=10)
    patience_score: float = Field(5.0, ge=1, le=10)
    preferred_nav_app: NavApp = NavApp.WAZE


class UserProfileCreate(UserProfileBase):
    pass


class UserProfileUpdate(BaseModel):
    name: Optional[str] = Field(None, max_length=100)
    hiking_score: Optional[float] = Field(None, ge=1, le=10)
    foodie_score: Optional[float] = Field(None, ge=1, le=10)
    patience_score: Optional[float] = Field(None, ge=1, le=10)
    preferred_nav_app: Optional[NavApp] = None


class UserProfile(UserProfileBase):
    id: str
    onboarding_completed: bool = False
    created_at: datetime
    updated_at: datetime


# =============================================================================
# API Request Models
# =============================================================================

class PlanTripRequest(BaseModel):
    start_lat: float = Field(..., ge=-90, le=90)
    start_lon: float = Field(..., ge=-180, le=180)
    end_lat: float = Field(..., ge=-90, le=90)
    end_lon: float = Field(..., ge=-180, le=180)
    date: Optional[str] = Field(None, pattern=r"^\d{4}-\d{2}-\d{2}$")
    vibes: Optional[list[str]] = None

    @field_validator("vibes")
    @classmethod
    def validate_vibes(cls, v: Optional[list[str]]) -> Optional[list[str]]:
        if v is None:
            return v
        allowed = {"nature", "chill", "hiking", "foodie", "adventure"}
        for vibe in v:
            if vibe.lower() not in allowed:
                raise ValueError(f"Invalid vibe: {vibe}. Allowed: {allowed}")
        return [vibe.lower() for vibe in v]


class SearchPOIsRequest(BaseModel):
    lat: float = Field(..., ge=-90, le=90)
    lon: float = Field(..., ge=-180, le=180)
    radius: int = Field(2000, ge=100, le=50000)  # 100m to 50km
    types: Optional[list[StopType]] = None


class ChatActionRequest(BaseModel):
    text: str = Field(..., min_length=1, max_length=500)
    current_trip_id: Optional[str] = None
    user_location: Optional[Coordinates] = None


# =============================================================================
# API Response Models
# =============================================================================

class PlanTripResponse(BaseModel):
    macro_route: Route
    micro_stops: list[POI]
    golden_clusters: list[GoldenCluster]
    weather: Optional["WeatherData"] = None


class SearchPOIsResponse(BaseModel):
    pois: list[POI]
    total: int


class ChatAction(BaseModel):
    type: ChatActionType
    payload: Optional[dict] = None


class ChatActionResponse(BaseModel):
    reply: str
    action: Optional[ChatAction] = None
    updated_trip: Optional[Trip] = None


class WeatherData(BaseModel):
    sunrise: str
    sunset: str
    temperature_celsius: float
    conditions: str
    icon: Optional[str] = None


# =============================================================================
# Constraint Solver Models
# =============================================================================

class Anchor(BaseModel):
    stop_id: str
    time: datetime


class Warning(BaseModel):
    type: str  # ANCHOR_VIOLATED, FOOD_GAP, SUNSET_EXCEEDED, OVERBOOKED
    severity: str  # warning, critical
    stop_id: Optional[str] = None
    message: str


class ConstraintSolverInput(BaseModel):
    stops: list[Stop]
    start_time: datetime
    anchors: list[Anchor] = []
    sunset_time: Optional[datetime] = None


class ConstraintSolverOutput(BaseModel):
    stops: list[Stop]
    warnings: list[Warning]
    is_valid: bool
    total_duration_minutes: int


# =============================================================================
# Health Check
# =============================================================================

class HealthCheck(BaseModel):
    status: str = "healthy"
    version: str
    timestamp: datetime


# Update forward references
PlanTripResponse.model_rebuild()
