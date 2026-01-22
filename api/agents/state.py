"""State schema for the LangGraph trip report pipeline."""

from typing import TypedDict, Literal, Optional, List, Dict, Any


class TripReportState(TypedDict):
    """State shared across all agents in the report generation pipeline."""

    # Input from conversation
    conversation_id: str
    destination: Dict[str, Any]  # {display_name, coordinates: {lat, lon}, country}
    date_range: Dict[str, str]  # {start, end} in ISO format
    preferences: Dict[str, Any]  # {vibes: [], pace: str}
    approved_stops: List[Dict[str, Any]]  # User-approved stops from planning phase

    # Research phase
    enriched_stops: List[Dict[str, Any]]  # Stops with additional API data
    research_complete: bool
    research_attempts: int

    # Validation phase
    validation_status: Literal["pending", "valid", "invalid", "partial"]
    validation_errors: List[str]
    validated_stops: List[Dict[str, Any]]  # Stops that passed validation

    # Route optimization
    optimized_route: Optional[Dict[str, Any]]  # {polyline, duration_seconds, distance_meters}

    # Output
    html_report: str
    report_url: Optional[str]
    generation_status: Literal["pending", "complete", "failed"]


def create_initial_state(
    conversation_id: str,
    destination: Dict[str, Any],
    date_range: Dict[str, str],
    preferences: Dict[str, Any],
    approved_stops: List[Dict[str, Any]],
) -> TripReportState:
    """Create initial state for the agent pipeline."""
    return TripReportState(
        conversation_id=conversation_id,
        destination=destination,
        date_range=date_range,
        preferences=preferences,
        approved_stops=approved_stops,
        enriched_stops=[],
        research_complete=False,
        research_attempts=0,
        validation_status="pending",
        validation_errors=[],
        validated_stops=[],
        optimized_route=None,
        html_report="",
        report_url=None,
        generation_status="pending",
    )
