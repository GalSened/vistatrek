/**
 * VistaTrek - TypeScript Type Definitions
 * Single source of truth for all data models
 */

// =============================================================================
// Primitives
// =============================================================================

export interface Coordinates {
  lat: number;
  lon: number;
}

export type StopType =
  | 'viewpoint'
  | 'coffee'
  | 'food'
  | 'spring'
  | 'parking'
  | 'hotel'
  | 'custom';

export type TripStatus = 'draft' | 'active' | 'completed';

export type PacingStatus = 'early' | 'on_time' | 'late';

export type NavApp = 'waze' | 'google' | 'apple';

// =============================================================================
// Stop Model
// =============================================================================

export interface Stop {
  id: string;
  name: string;
  type: StopType;
  coordinates: Coordinates;

  // Timing
  planned_arrival: string;    // ISO timestamp
  planned_departure: string;  // ISO timestamp
  duration_minutes: number;

  // OSM data (optional)
  osm_id?: number;
  tags?: Record<string, string>;

  // Constraints
  is_anchor: boolean;  // Fixed time point (e.g., hotel check-in)

  // Execution state
  actual_arrival?: string;
  actual_departure?: string;
  skipped?: boolean;
}

// =============================================================================
// Route Model
// =============================================================================

export interface Route {
  polyline: [number, number][];  // Array of [lon, lat]
  duration_seconds: number;
  distance_meters: number;
}

// =============================================================================
// Trip Model
// =============================================================================

export interface Trip {
  id: string;
  name: string;
  status: TripStatus;
  created_at: string;
  updated_at: string;

  // Planning inputs
  start_location: Coordinates;
  end_location: Coordinates;
  date: string;  // YYYY-MM-DD
  vibes?: string[];  // ['nature', 'chill', 'foodie']

  // Calculated route
  route: Route;

  // Stops
  stops: Stop[];

  // Suggestions not yet added
  suggestions?: POI[];

  // Execution state (only when status === 'active')
  execution?: TripExecution;
}

export interface TripExecution {
  started_at: string;
  current_stop_index: number;
  completed_stops: string[];  // Array of stop IDs
}

// =============================================================================
// POI Model (Points of Interest)
// =============================================================================

export interface POI {
  id: string;
  osm_id: number;
  name: string;
  type: StopType;
  coordinates: Coordinates;
  tags?: Record<string, string>;

  // Calculated fields
  distance_from_route_km?: number;
  match_score?: number;  // 0-100, based on user profile
}

export interface GoldenCluster {
  id: string;
  center: Coordinates;
  viewpoint: POI;
  parking?: POI;
  coffee?: POI;
  total_score: number;
}

// =============================================================================
// User Profile Model
// =============================================================================

export interface UserProfile {
  id: string;
  name?: string;

  // Preference scores (1-10 scale)
  hiking_score: number;
  foodie_score: number;
  patience_score: number;

  // App preferences
  preferred_nav_app: NavApp;

  // Onboarding
  onboarding_completed: boolean;
}

export const DEFAULT_USER_PROFILE: UserProfile = {
  id: '',
  hiking_score: 5,
  foodie_score: 5,
  patience_score: 5,
  preferred_nav_app: 'waze',
  onboarding_completed: false,
};

// =============================================================================
// Settings Model
// =============================================================================

export interface Settings {
  gps_tracking: boolean;
  smart_alerts: boolean;
  feedback_popups: boolean;
  dark_mode: boolean;
}

export const DEFAULT_SETTINGS: Settings = {
  gps_tracking: true,
  smart_alerts: true,
  feedback_popups: true,
  dark_mode: false,
};

// =============================================================================
// API Request/Response Types
// =============================================================================

// Plan Trip
export interface PlanTripRequest {
  start_lat: number;
  start_lon: number;
  end_lat: number;
  end_lon: number;
  date?: string;
  vibes?: string[];
}

export interface PlanTripResponse {
  macro_route: Route;
  micro_stops: POI[];
  golden_clusters: GoldenCluster[];
  weather?: WeatherData;
}

// Search POIs
export interface SearchPOIsRequest {
  lat: number;
  lon: number;
  radius: number;
  types?: StopType[];
}

export interface SearchPOIsResponse {
  pois: POI[];
}

// Chat Action
export interface ChatMessage {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  timestamp: string;
}

export interface ChatActionRequest {
  text: string;
  current_trip_id?: string;
  user_location?: Coordinates;
}

export interface ChatActionResponse {
  reply: string;
  action?: {
    type: 'add_stop' | 'remove_stop' | 'reorder' | 'recalculate' | 'none';
    payload?: unknown;
  };
  updated_trip?: Trip;
}

// Weather
export interface WeatherData {
  sunrise: string;
  sunset: string;
  temperature_celsius: number;
  conditions: string;
  icon?: string;
}

// =============================================================================
// Constraint Solver Types
// =============================================================================

export interface Anchor {
  stopId: string;
  time: Date;
}

export interface WarningType {
  type: 'ANCHOR_VIOLATED' | 'FOOD_GAP' | 'SUNSET_EXCEEDED' | 'OVERBOOKED';
  severity: 'warning' | 'critical';
  stopId?: string;
  message: string;
}

export interface ConstraintSolverInput {
  stops: Stop[];
  startTime: Date;
  anchors: Anchor[];
  sunsetTime?: Date;
}

export interface ConstraintSolverOutput {
  stops: Stop[];
  warnings: WarningType[];
  isValid: boolean;
  totalDurationMinutes: number;
}

// =============================================================================
// Geolocation Types
// =============================================================================

export interface GeolocationState {
  position: Coordinates | null;
  accuracy: number | null;
  timestamp: number | null;
  error: GeolocationPositionError | null;
  isTracking: boolean;
}

export interface OffRouteState {
  isOffRoute: boolean;
  distanceKm: number;
  consecutiveCount: number;
}

// =============================================================================
// UI State Types
// =============================================================================

export interface LoadingState {
  isLoading: boolean;
  message?: string;
}

export interface ErrorState {
  hasError: boolean;
  message?: string;
  code?: string;
}

// =============================================================================
// localStorage Keys (for type safety)
// =============================================================================

export const STORAGE_KEYS = {
  CURRENT_TRIP: 'vistatrek_current_trip',
  TRIP_HISTORY: 'vistatrek_trip_history',
  USER_PROFILE: 'vistatrek_user_profile',
  SETTINGS: 'vistatrek_settings',
  DRAFT_TRIP: 'vistatrek_draft_trip',
} as const;

// =============================================================================
// Utility Types
// =============================================================================

export type DeepPartial<T> = {
  [P in keyof T]?: T[P] extends object ? DeepPartial<T[P]> : T[P];
};

export type WithTimestamps<T> = T & {
  created_at: string;
  updated_at: string;
};
