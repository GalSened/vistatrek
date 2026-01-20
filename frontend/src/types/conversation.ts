/**
 * VistaTrek - Conversation Planning Types
 * Types for the AI-powered conversational trip planning system
 */

import { Coordinates, Stop, POI } from './index';

// =============================================================================
// Conversation Phase State Machine
// =============================================================================

export type ConversationPhase =
  | 'greeting'           // Welcome, ask destination
  | 'destination'        // User provides destination
  | 'clarify_location'   // Disambiguate if multiple matches
  | 'dates'              // Ask for date range
  | 'preferences'        // Gather vibes, pace preferences
  | 'planning'           // AI is thinking/generating
  | 'propose_stop'       // Present one stop for approval
  | 'await_approval'     // Waiting for user's stop decision
  | 'modify_stop'        // User wants different stop
  | 'finalize'           // Show summary, confirm trip
  | 'complete';          // Trip created, redirect to Planner

// Phase transition rules
export const PHASE_TRANSITIONS: Record<ConversationPhase, ConversationPhase[]> = {
  greeting: ['destination'],
  destination: ['clarify_location', 'dates'],
  clarify_location: ['destination', 'dates'],
  dates: ['preferences'],
  preferences: ['planning'],
  planning: ['propose_stop'],
  propose_stop: ['await_approval'],
  await_approval: ['propose_stop', 'modify_stop', 'finalize'],
  modify_stop: ['propose_stop'],
  finalize: ['propose_stop', 'complete'],
  complete: [],
};

// =============================================================================
// Location Entity (extracted from user input)
// =============================================================================

export interface LocationEntity {
  raw_text: string;           // Original user input (e.g., "מונטנגרו")
  normalized: string;         // Normalized name (e.g., "Montenegro")
  coordinates: Coordinates;
  confidence: number;         // 0-1 score
  alternatives?: LocationEntity[];  // For disambiguation
  osm_id?: number;
  osm_type?: 'node' | 'way' | 'relation';
  display_name?: string;      // Full formatted address
  country?: string;
  region?: string;
}

// =============================================================================
// Proposed Stop (awaiting user approval)
// =============================================================================

export interface ProposedStop {
  id: string;
  poi: POI;
  reason: string;              // Why AI suggests this stop
  estimated_duration_minutes: number;
  order_in_trip: number;       // Suggested position
  alternatives?: POI[];        // Other options if user rejects
}

// =============================================================================
// Conversation Messages
// =============================================================================

export interface ConversationMessage {
  id: string;
  role: 'user' | 'assistant' | 'system';
  content: string;
  timestamp: string;  // ISO timestamp

  // Optional metadata
  phase?: ConversationPhase;
  proposedStop?: ProposedStop;
  locationEntities?: LocationEntity[];
  quickReplies?: QuickReply[];
  isStreaming?: boolean;
}

export interface QuickReply {
  label: string;
  value: string;
  icon?: string;
}

// =============================================================================
// Conversation State
// =============================================================================

export interface ConversationState {
  id: string;
  phase: ConversationPhase;
  messages: ConversationMessage[];
  createdAt: string;
  updatedAt: string;

  // Extracted trip parameters
  destination?: LocationEntity;
  startLocation?: LocationEntity;
  dateRange?: {
    start: string;  // YYYY-MM-DD
    end: string;
  };
  preferences?: {
    vibes: string[];
    pace: 'relaxed' | 'moderate' | 'active';
    interests: string[];
  };

  // Approved stops so far
  approvedStops: Stop[];

  // Current proposal (if in propose_stop/await_approval phase)
  currentProposal?: ProposedStop;

  // Final trip ID (when complete)
  tripId?: string;
}

// =============================================================================
// API Request/Response Types for Chat Planning
// =============================================================================

export interface ChatPlanRequest {
  conversationId?: string;  // Omit for new conversation
  message: string;
  userLocation?: Coordinates;
  language?: 'he' | 'en';
}

export interface ChatPlanResponse {
  conversationId: string;
  phase: ConversationPhase;
  message: ConversationMessage;
  state: Partial<ConversationState>;

  // For streaming
  isComplete?: boolean;
}

export interface StopDecisionRequest {
  conversationId: string;
  stopId: string;
  decision: 'approve' | 'reject' | 'modify';
  modifications?: {
    reason?: string;  // Why rejecting
    preferredType?: string;
    otherNotes?: string;
  };
}

export interface StopDecisionResponse {
  success: boolean;
  nextPhase: ConversationPhase;
  message: ConversationMessage;
  newProposal?: ProposedStop;
}

// =============================================================================
// SSE Streaming Types
// =============================================================================

export interface StreamChunk {
  type: 'content' | 'phase_change' | 'proposal' | 'complete' | 'error';
  content?: string;
  phase?: ConversationPhase;
  proposal?: ProposedStop;
  error?: string;
}

// =============================================================================
// Utility Functions
// =============================================================================

export function isTerminalPhase(phase: ConversationPhase): boolean {
  return phase === 'complete';
}

export function canTransitionTo(
  currentPhase: ConversationPhase,
  targetPhase: ConversationPhase
): boolean {
  return PHASE_TRANSITIONS[currentPhase]?.includes(targetPhase) ?? false;
}

export function getPhaseLabel(phase: ConversationPhase, language: 'he' | 'en' = 'en'): string {
  const labels: Record<ConversationPhase, { he: string; en: string }> = {
    greeting: { he: 'ברוך הבא', en: 'Welcome' },
    destination: { he: 'יעד', en: 'Destination' },
    clarify_location: { he: 'הבהרת מיקום', en: 'Clarify Location' },
    dates: { he: 'תאריכים', en: 'Dates' },
    preferences: { he: 'העדפות', en: 'Preferences' },
    planning: { he: 'מתכנן...', en: 'Planning...' },
    propose_stop: { he: 'הצעת עצירה', en: 'Stop Suggestion' },
    await_approval: { he: 'ממתין לאישור', en: 'Awaiting Approval' },
    modify_stop: { he: 'שינוי עצירה', en: 'Modify Stop' },
    finalize: { he: 'סיום', en: 'Finalize' },
    complete: { he: 'הושלם', en: 'Complete' },
  };
  return labels[phase]?.[language] ?? phase;
}
