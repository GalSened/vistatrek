"""
VistaTrek Chat Router
LLM-powered conversational trip planning and modifications
"""

from fastapi import APIRouter, Depends, HTTPException, status
from fastapi.responses import StreamingResponse
from sqlalchemy.orm import Session

from app.config import get_settings
from app.models.database import get_db
from app.models.schemas import (
    ChatActionRequest,
    ChatActionResponse,
    ChatPlanRequest,
    ChatPlanResponse,
    StopDecisionRequest,
    StopDecisionResponse,
    ConversationState,
)
from app.services.conversation import get_conversation_service

router = APIRouter()


# =============================================================================
# Conversational Planning Endpoints (NEW)
# =============================================================================

@router.post("/plan", response_model=ChatPlanResponse)
async def send_plan_message(
    request: ChatPlanRequest,
    db: Session = Depends(get_db),
):
    """
    Send a message in a planning conversation.

    - Omit conversation_id to start a new conversation
    - Include conversation_id to continue an existing one

    The AI will guide the user through trip planning step by step.
    """
    settings = get_settings()

    if not settings.llm_api_key:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Chat planning not configured (missing LLM API key)",
        )

    try:
        service = get_conversation_service(db)
        response = await service.process_message(request)
        return response
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Planning error: {str(e)}",
        )


@router.get("/plan/{conversation_id}/stream")
async def stream_plan_message(
    conversation_id: str,
    message: str,
    language: str = "he",
    db: Session = Depends(get_db),
):
    """
    Stream a planning response (Server-Sent Events).

    Use this for real-time streaming of AI responses.
    """
    settings = get_settings()

    if not settings.llm_api_key:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Chat planning not configured",
        )

    service = get_conversation_service(db)
    state = await service.get_conversation(conversation_id)

    if not state:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Conversation not found",
        )

    async def generate():
        async for chunk in service.stream_response(state, language):
            yield f"data: {chunk}\n\n"
        yield "data: [DONE]\n\n"

    return StreamingResponse(
        generate(),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "Connection": "keep-alive",
        },
    )


@router.post("/plan/{conversation_id}/stop-decision", response_model=StopDecisionResponse)
async def handle_stop_decision(
    conversation_id: str,
    request: StopDecisionRequest,
    db: Session = Depends(get_db),
):
    """
    Handle user's decision on a proposed stop.

    - approve: Add the stop to the trip
    - reject: Skip and get alternative
    - modify: Request different type of stop
    """
    if conversation_id != request.conversation_id:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Conversation ID mismatch",
        )

    try:
        service = get_conversation_service(db)
        response = await service.handle_stop_decision(request)
        return response
    except ValueError as e:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=str(e),
        )
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Decision processing error: {str(e)}",
        )


@router.get("/plan/{conversation_id}", response_model=ConversationState)
async def get_conversation(
    conversation_id: str,
    db: Session = Depends(get_db),
):
    """
    Get the current state of a planning conversation.

    Use this to resume a conversation or check its status.
    """
    service = get_conversation_service(db)
    state = await service.get_conversation(conversation_id)

    if not state:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Conversation not found",
        )

    return state


# =============================================================================
# Legacy Trip Modification Endpoints (kept for backwards compatibility)
# =============================================================================

@router.post("/action", response_model=ChatActionResponse)
async def process_chat_action(
    request: ChatActionRequest,
    db: Session = Depends(get_db),
):
    """
    Process a natural language chat action for trip modification.

    (Legacy endpoint - use /plan for new conversational planning)

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
    # For now, redirect to conversational planning
    return ChatActionResponse(
        reply="I understood your request! For the best experience, try our new conversational planning at /plan.",
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
