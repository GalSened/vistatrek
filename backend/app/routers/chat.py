"""
VistaTrek Chat Router
LLM-powered chat agent for trip modifications
"""

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session

from app.config import get_settings
from app.models.database import get_db
from app.models.schemas import (
    ChatActionRequest,
    ChatActionResponse,
)

router = APIRouter()


@router.post("/action", response_model=ChatActionResponse)
async def process_chat_action(
    request: ChatActionRequest,
    db: Session = Depends(get_db),
):
    """
    Process a natural language chat action for trip modification.

    Examples:
    - "Add a coffee stop near the viewpoint"
    - "Remove the gas station"
    - "Move lunch to 1pm"
    - "Find a scenic route instead"
    """
    settings = get_settings()

    if not settings.llm_api_key:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Chat agent not configured (missing LLM API key)",
        )

    # TODO: Implement LLM-powered intent parsing
    # 1. Parse user message with LLM
    # 2. Extract intent and entities
    # 3. Map to action type
    # 4. Execute action
    # 5. Return response with updated trip

    # Stub response
    return ChatActionResponse(
        reply="I understood your request, but the chat agent is not fully implemented yet. "
              "Try using the UI to modify your trip directly.",
        action=None,
        updated_trip=None,
    )


@router.post("/suggest")
async def get_suggestions(
    trip_id: str,
    context: str = "",
    db: Session = Depends(get_db),
):
    """
    Get AI-powered suggestions for a trip.

    Can suggest:
    - Better stops based on user preferences
    - Optimal timing adjustments
    - Alternative routes
    - Local tips and recommendations
    """
    settings = get_settings()

    if not settings.llm_api_key:
        return {
            "suggestions": [],
            "message": "Suggestions require LLM configuration",
        }

    # TODO: Implement LLM-powered suggestions
    # 1. Load trip and user profile
    # 2. Analyze current stops and timing
    # 3. Generate contextual suggestions

    return {
        "suggestions": [],
        "message": "Suggestion engine coming soon",
    }


@router.get("/intents")
async def list_supported_intents():
    """
    List all supported chat intents for documentation.
    """
    return {
        "intents": [
            {
                "name": "add_stop",
                "description": "Add a new stop to the trip",
                "examples": [
                    "Add a coffee stop",
                    "I want to stop for lunch",
                    "Find a viewpoint nearby",
                ],
            },
            {
                "name": "remove_stop",
                "description": "Remove a stop from the trip",
                "examples": [
                    "Remove the gas station",
                    "Skip the rest stop",
                    "Delete the last stop",
                ],
            },
            {
                "name": "modify_time",
                "description": "Change stop timing",
                "examples": [
                    "Move lunch to 1pm",
                    "Stay longer at the viewpoint",
                    "Leave earlier",
                ],
            },
            {
                "name": "reorder",
                "description": "Change stop order",
                "examples": [
                    "Swap the first two stops",
                    "Move coffee before the hike",
                    "Reverse the route",
                ],
            },
            {
                "name": "info",
                "description": "Get information about the trip",
                "examples": [
                    "How long is the drive?",
                    "When do we arrive?",
                    "What time is lunch?",
                ],
            },
        ],
    }
