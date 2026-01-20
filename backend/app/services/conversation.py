"""
VistaTrek - Conversational Trip Planning Service
Manages AI-powered conversation flow using Groq LLM
"""

import re
import json
import uuid
import logging
from datetime import datetime, timedelta
from typing import Optional, AsyncGenerator

from openai import AsyncOpenAI

from ..config import get_settings
from ..models.schemas import (
    ConversationPhase,
    ConversationState,
    ConversationMessage,
    ChatPlanRequest,
    ChatPlanResponse,
    StopDecision,
    StopDecisionRequest,
    StopDecisionResponse,
    LocationEntity,
    DateRange,
    UserPreferences,
    ProposedStop,
    QuickReply,
    TripPace,
    POI,
    Stop,
    Coordinates,
    StopType,
)
from .geocoding import get_geocoding_service
from .trip_planner import TripPlannerService

logger = logging.getLogger(__name__)

# Phase transitions allowed
PHASE_TRANSITIONS: dict[ConversationPhase, list[ConversationPhase]] = {
    ConversationPhase.GREETING: [ConversationPhase.DESTINATION],
    ConversationPhase.DESTINATION: [ConversationPhase.CLARIFY_LOCATION, ConversationPhase.DATES],
    ConversationPhase.CLARIFY_LOCATION: [ConversationPhase.DESTINATION, ConversationPhase.DATES],
    ConversationPhase.DATES: [ConversationPhase.PREFERENCES],
    ConversationPhase.PREFERENCES: [ConversationPhase.PLANNING],
    ConversationPhase.PLANNING: [ConversationPhase.PROPOSE_STOP],
    ConversationPhase.PROPOSE_STOP: [ConversationPhase.AWAIT_APPROVAL],
    ConversationPhase.AWAIT_APPROVAL: [ConversationPhase.PROPOSE_STOP, ConversationPhase.MODIFY_STOP, ConversationPhase.FINALIZE],
    ConversationPhase.MODIFY_STOP: [ConversationPhase.PROPOSE_STOP],
    ConversationPhase.FINALIZE: [ConversationPhase.PROPOSE_STOP, ConversationPhase.COMPLETE],
    ConversationPhase.COMPLETE: [],
}

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


class ConversationService:
    """Manages conversational trip planning with AI"""

    def __init__(self, db_session=None):
        self.settings = get_settings()
        self.geocoding = get_geocoding_service()
        self.trip_planner = TripPlannerService(db_session)

        # Initialize Groq client (OpenAI-compatible)
        self.llm_client = AsyncOpenAI(
            api_key=self.settings.llm_api_key,
            base_url="https://api.groq.com/openai/v1"
        )

        # In-memory conversation storage (use Redis in production)
        self._conversations: dict[str, ConversationState] = {}

    async def start_conversation(self, language: str = "he") -> ConversationState:
        """Start a new planning conversation"""
        conversation_id = str(uuid.uuid4())
        now = datetime.utcnow()

        # Create greeting message
        greeting = await self._generate_greeting(language)

        state = ConversationState(
            id=conversation_id,
            phase=ConversationPhase.GREETING,
            messages=[greeting],
            created_at=now,
            updated_at=now,
            approved_stops=[],
        )

        self._conversations[conversation_id] = state
        return state

    async def process_message(
        self,
        request: ChatPlanRequest
    ) -> ChatPlanResponse:
        """Process a user message and generate response"""
        # Get or create conversation
        if request.conversation_id:
            state = self._conversations.get(request.conversation_id)
            if not state:
                # Create new if not found
                state = await self.start_conversation(request.language)
        else:
            state = await self.start_conversation(request.language)

        # Add user message
        user_msg = ConversationMessage(
            id=str(uuid.uuid4()),
            role="user",
            content=request.message,
            timestamp=datetime.utcnow(),
            phase=state.phase,
        )
        state.messages.append(user_msg)

        # Generate AI response
        ai_response = await self._generate_response(state, request.language)

        # Parse and apply response
        parsed = self._parse_ai_response(ai_response)
        assistant_msg = ConversationMessage(
            id=str(uuid.uuid4()),
            role="assistant",
            content=parsed.get("message", ai_response),
            timestamp=datetime.utcnow(),
            phase=state.phase,
            quick_replies=[
                QuickReply(label=r, value=r)
                for r in parsed.get("quick_replies", [])[:4]
            ] if parsed.get("quick_replies") else None,
        )
        state.messages.append(assistant_msg)

        # Update state based on extracted data
        await self._update_state_from_extracted(state, parsed.get("extracted", {}), request.language)

        # Handle phase transition
        next_phase = parsed.get("next_phase")
        if next_phase and self._can_transition(state.phase, ConversationPhase(next_phase)):
            state.phase = ConversationPhase(next_phase)

        # Auto-advance phases based on state
        await self._auto_advance_phase(state)

        state.updated_at = datetime.utcnow()
        self._conversations[state.id] = state

        return ChatPlanResponse(
            conversation_id=state.id,
            phase=state.phase,
            message=assistant_msg,
            state=state,
            is_complete=state.phase == ConversationPhase.COMPLETE,
        )

    async def handle_stop_decision(
        self,
        request: StopDecisionRequest
    ) -> StopDecisionResponse:
        """Handle user's decision on a proposed stop"""
        state = self._conversations.get(request.conversation_id)
        if not state:
            raise ValueError("Conversation not found")

        if state.phase != ConversationPhase.AWAIT_APPROVAL:
            raise ValueError("Not awaiting stop approval")

        proposal = state.current_proposal
        if not proposal or proposal.id != request.stop_id:
            raise ValueError("Stop ID mismatch")

        if request.decision == StopDecision.APPROVE:
            # Add to approved stops
            stop = self._proposal_to_stop(proposal)
            state.approved_stops.append(stop)
            state.current_proposal = None

            # Generate next proposal or finalize
            next_proposal = await self._generate_stop_proposal(state)
            if next_proposal:
                state.current_proposal = next_proposal
                state.phase = ConversationPhase.PROPOSE_STOP
                message = await self._create_proposal_message(next_proposal, state)
            else:
                state.phase = ConversationPhase.FINALIZE
                message = await self._create_finalize_message(state)

        elif request.decision == StopDecision.REJECT:
            # Generate alternative
            state.phase = ConversationPhase.MODIFY_STOP
            next_proposal = await self._generate_stop_proposal(state, exclude_id=proposal.poi.osm_id)
            if next_proposal:
                state.current_proposal = next_proposal
                state.phase = ConversationPhase.PROPOSE_STOP
                message = await self._create_proposal_message(next_proposal, state, is_alternative=True)
            else:
                state.phase = ConversationPhase.FINALIZE
                message = await self._create_finalize_message(state)

        else:  # MODIFY
            state.phase = ConversationPhase.MODIFY_STOP
            message = ConversationMessage(
                id=str(uuid.uuid4()),
                role="assistant",
                content="What would you prefer instead? Tell me what kind of place you're looking for.",
                timestamp=datetime.utcnow(),
                phase=state.phase,
            )

        state.messages.append(message)
        state.updated_at = datetime.utcnow()
        self._conversations[state.id] = state

        return StopDecisionResponse(
            success=True,
            next_phase=state.phase,
            message=message,
            new_proposal=state.current_proposal,
        )

    async def get_conversation(self, conversation_id: str) -> Optional[ConversationState]:
        """Get conversation state"""
        return self._conversations.get(conversation_id)

    async def stream_response(
        self,
        state: ConversationState,
        language: str
    ) -> AsyncGenerator[str, None]:
        """Stream AI response token by token"""
        messages = self._build_llm_messages(state)

        try:
            stream = await self.llm_client.chat.completions.create(
                model=self.settings.llm_model,
                messages=messages,
                temperature=0.7,
                max_tokens=500,
                stream=True,
            )

            async for chunk in stream:
                if chunk.choices[0].delta.content:
                    yield chunk.choices[0].delta.content

        except Exception as e:
            logger.error(f"Stream error: {e}")
            yield f"Sorry, I encountered an error. Please try again."

    # Private methods

    async def _generate_greeting(self, language: str) -> ConversationMessage:
        """Generate initial greeting"""
        if language == "he":
            greeting = "שלום! אני עוזר התכנון של VistaTrek. לאן תרצה לטייל?"
            quick_replies = ["מונטנגרו", "גליל", "נגב"]
        else:
            greeting = "Hi! I'm VistaTrek's planning assistant. Where would you like to travel?"
            quick_replies = ["Montenegro", "Galilee", "Negev"]

        return ConversationMessage(
            id=str(uuid.uuid4()),
            role="assistant",
            content=greeting,
            timestamp=datetime.utcnow(),
            phase=ConversationPhase.GREETING,
            quick_replies=[QuickReply(label=r, value=r) for r in quick_replies],
        )

    async def _generate_response(self, state: ConversationState, language: str) -> str:
        """Generate AI response using Groq"""
        messages = self._build_llm_messages(state)

        try:
            response = await self.llm_client.chat.completions.create(
                model=self.settings.llm_model,
                messages=messages,
                temperature=0.7,
                max_tokens=500,
            )
            return response.choices[0].message.content or ""
        except Exception as e:
            logger.error(f"LLM error: {e}")
            if language == "he":
                return "סליחה, נתקלתי בבעיה. נסה שוב בבקשה."
            return "Sorry, I encountered an issue. Please try again."

    def _build_llm_messages(self, state: ConversationState) -> list[dict]:
        """Build message history for LLM"""
        messages = [{"role": "system", "content": SYSTEM_PROMPT}]

        # Add conversation context
        context = self._build_context_summary(state)
        if context:
            messages.append({"role": "system", "content": f"Current context:\n{context}"})

        # Add recent messages (last 10)
        for msg in state.messages[-10:]:
            messages.append({
                "role": msg.role if msg.role != "system" else "assistant",
                "content": msg.content,
            })

        return messages

    def _build_context_summary(self, state: ConversationState) -> str:
        """Build summary of current conversation state"""
        parts = []
        parts.append(f"Phase: {state.phase.value}")

        if state.destination:
            parts.append(f"Destination: {state.destination.normalized}")
        if state.date_range:
            parts.append(f"Dates: {state.date_range.start} to {state.date_range.end}")
        if state.preferences:
            parts.append(f"Vibes: {', '.join(state.preferences.vibes)}")
            parts.append(f"Pace: {state.preferences.pace.value}")
        if state.approved_stops:
            parts.append(f"Approved stops: {len(state.approved_stops)}")

        return "\n".join(parts)

    def _parse_ai_response(self, response: str) -> dict:
        """Parse AI response JSON or extract text"""
        # Try to extract JSON from response
        try:
            # Look for JSON block
            json_match = re.search(r'\{[\s\S]*\}', response)
            if json_match:
                return json.loads(json_match.group())
        except json.JSONDecodeError:
            pass

        # Return as plain message
        return {"message": response}

    async def _update_state_from_extracted(
        self,
        state: ConversationState,
        extracted: dict,
        language: str
    ):
        """Update conversation state from extracted data"""
        # Handle destination
        if extracted.get("destination"):
            locations = await self.geocoding.search(
                extracted["destination"],
                language=language,
                limit=3
            )
            if locations:
                if len(locations) == 1 or locations[0].confidence > 0.8:
                    state.destination = locations[0]
                else:
                    # Multiple matches - need clarification
                    state.destination = locations[0]
                    state.destination.alternatives = locations[1:]

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
                    end = start + timedelta(days=duration - 1)
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

    def _can_transition(
        self,
        current: ConversationPhase,
        target: ConversationPhase
    ) -> bool:
        """Check if phase transition is allowed"""
        return target in PHASE_TRANSITIONS.get(current, [])

    async def _auto_advance_phase(self, state: ConversationState):
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
            # Generate first stop proposal
            proposal = await self._generate_stop_proposal(state)
            if proposal:
                state.current_proposal = proposal
                state.phase = ConversationPhase.PROPOSE_STOP

    async def _generate_stop_proposal(
        self,
        state: ConversationState,
        exclude_id: Optional[int] = None
    ) -> Optional[ProposedStop]:
        """Generate a stop proposal using trip planner"""
        if not state.destination or not state.date_range:
            return None

        # Use trip planner to find POIs
        from ..models.schemas import PlanTripRequest

        # For now, use destination as both start and end
        # In full implementation, would use user's actual start location
        request = PlanTripRequest(
            start_lat=state.destination.coordinates.lat,
            start_lon=state.destination.coordinates.lon,
            end_lat=state.destination.coordinates.lat,
            end_lon=state.destination.coordinates.lon,
            vibes=state.preferences.vibes if state.preferences else None,
        )

        try:
            response = await self.trip_planner.plan_trip(request)
            pois = response.micro_stops

            # Filter out already approved and excluded
            approved_osm_ids = {s.osm_id for s in state.approved_stops if s.osm_id}
            if exclude_id:
                approved_osm_ids.add(exclude_id)

            available = [p for p in pois if p.osm_id not in approved_osm_ids]

            if not available:
                return None

            # Pick best scoring POI
            available.sort(key=lambda p: p.match_score or 0, reverse=True)
            poi = available[0]

            return ProposedStop(
                id=str(uuid.uuid4()),
                poi=poi,
                reason=self._generate_stop_reason(poi, state),
                estimated_duration_minutes=30,
                order_in_trip=len(state.approved_stops),
                alternatives=available[1:4] if len(available) > 1 else None,
            )
        except Exception as e:
            logger.error(f"Stop proposal generation failed: {e}")
            return None

    def _generate_stop_reason(self, poi: POI, state: ConversationState) -> str:
        """Generate a reason for suggesting a stop"""
        type_reasons = {
            StopType.VIEWPOINT: "Amazing views and photo opportunities",
            StopType.COFFEE: "Great spot to relax with coffee",
            StopType.FOOD: "Delicious local cuisine",
            StopType.SPRING: "Natural spring - perfect for refreshing",
            StopType.PARKING: "Convenient parking for nearby attractions",
            StopType.HOTEL: "Comfortable accommodation",
        }
        return type_reasons.get(poi.type, "Interesting place to explore")

    def _proposal_to_stop(self, proposal: ProposedStop) -> Stop:
        """Convert proposal to approved stop"""
        now = datetime.utcnow()
        return Stop(
            id=str(uuid.uuid4()),
            name=proposal.poi.name,
            type=proposal.poi.type,
            coordinates=proposal.poi.coordinates,
            duration_minutes=proposal.estimated_duration_minutes,
            is_anchor=False,
            osm_id=proposal.poi.osm_id,
            tags=proposal.poi.tags,
            planned_arrival=now,
            planned_departure=now + timedelta(minutes=proposal.estimated_duration_minutes),
        )

    async def _create_proposal_message(
        self,
        proposal: ProposedStop,
        state: ConversationState,
        is_alternative: bool = False
    ) -> ConversationMessage:
        """Create message presenting a stop proposal"""
        prefix = "How about this instead? " if is_alternative else ""
        content = f"{prefix}I suggest **{proposal.poi.name}** - {proposal.reason}"

        return ConversationMessage(
            id=str(uuid.uuid4()),
            role="assistant",
            content=content,
            timestamp=datetime.utcnow(),
            phase=ConversationPhase.PROPOSE_STOP,
            proposed_stop=proposal,
            quick_replies=[
                QuickReply(label="Yes!", value="approve"),
                QuickReply(label="Skip", value="reject"),
                QuickReply(label="Something else", value="modify"),
            ],
        )

    async def _create_finalize_message(self, state: ConversationState) -> ConversationMessage:
        """Create message summarizing the trip"""
        stop_count = len(state.approved_stops)
        stop_names = [s.name for s in state.approved_stops[:5]]

        content = f"Your trip is ready with {stop_count} stops"
        if stop_names:
            content += f": {', '.join(stop_names)}"
        if stop_count > 5:
            content += f" and {stop_count - 5} more"
        content += ". Ready to start planning the details?"

        return ConversationMessage(
            id=str(uuid.uuid4()),
            role="assistant",
            content=content,
            timestamp=datetime.utcnow(),
            phase=ConversationPhase.FINALIZE,
            quick_replies=[
                QuickReply(label="Let's go!", value="complete"),
                QuickReply(label="Add more stops", value="more"),
            ],
        )


# Singleton instance
_conversation_service: Optional[ConversationService] = None


def get_conversation_service(db_session=None) -> ConversationService:
    """Get or create conversation service instance"""
    global _conversation_service
    if _conversation_service is None:
        _conversation_service = ConversationService(db_session)
    return _conversation_service
