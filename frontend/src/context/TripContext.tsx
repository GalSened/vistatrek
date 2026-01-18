/**
 * Trip Context - manages current trip state
 * Per PRD: localStorage persistence for offline-first
 */

import {
  createContext,
  useContext,
  useReducer,
  useEffect,
  ReactNode,
} from 'react';
import { Trip, Stop, POI, Route, STORAGE_KEYS, TripStatus } from '../types';

// =============================================================================
// State & Actions
// =============================================================================

interface TripState {
  currentTrip: Trip | null;
  tripHistory: Trip[];
  isLoading: boolean;
}

type TripAction =
  | { type: 'SET_TRIP'; payload: Trip }
  | { type: 'CLEAR_TRIP' }
  | { type: 'ADD_STOP'; payload: Stop }
  | { type: 'REMOVE_STOP'; payload: string }
  | { type: 'REORDER_STOPS'; payload: string[] }
  | { type: 'UPDATE_STOP'; payload: { id: string; updates: Partial<Stop> } }
  | { type: 'SET_ROUTE'; payload: Route }
  | { type: 'SET_SUGGESTIONS'; payload: POI[] }
  | { type: 'ADD_SUGGESTION_AS_STOP'; payload: POI }
  | { type: 'SET_STATUS'; payload: TripStatus }
  | { type: 'START_TRIP' }
  | { type: 'COMPLETE_STOP'; payload: string }
  | { type: 'SKIP_STOP'; payload: string }
  | { type: 'SET_HISTORY'; payload: Trip[] }
  | { type: 'HYDRATE'; payload: { trip: Trip | null; history: Trip[] } }
  | { type: 'SET_LOADING'; payload: boolean };

const initialState: TripState = {
  currentTrip: null,
  tripHistory: [],
  isLoading: true,
};

// =============================================================================
// Reducer
// =============================================================================

function tripReducer(state: TripState, action: TripAction): TripState {
  switch (action.type) {
    case 'SET_TRIP':
      return { ...state, currentTrip: action.payload };

    case 'CLEAR_TRIP':
      return { ...state, currentTrip: null };

    case 'ADD_STOP':
      if (!state.currentTrip) return state;
      return {
        ...state,
        currentTrip: {
          ...state.currentTrip,
          stops: [...state.currentTrip.stops, action.payload],
          updated_at: new Date().toISOString(),
        },
      };

    case 'REMOVE_STOP':
      if (!state.currentTrip) return state;
      return {
        ...state,
        currentTrip: {
          ...state.currentTrip,
          stops: state.currentTrip.stops.filter((s) => s.id !== action.payload),
          updated_at: new Date().toISOString(),
        },
      };

    case 'REORDER_STOPS':
      if (!state.currentTrip) return state;
      const stopMap = new Map(state.currentTrip.stops.map((s) => [s.id, s]));
      const reorderedStops = action.payload
        .map((id) => stopMap.get(id))
        .filter((s): s is Stop => s !== undefined);
      return {
        ...state,
        currentTrip: {
          ...state.currentTrip,
          stops: reorderedStops,
          updated_at: new Date().toISOString(),
        },
      };

    case 'UPDATE_STOP':
      if (!state.currentTrip) return state;
      return {
        ...state,
        currentTrip: {
          ...state.currentTrip,
          stops: state.currentTrip.stops.map((s) =>
            s.id === action.payload.id ? { ...s, ...action.payload.updates } : s
          ),
          updated_at: new Date().toISOString(),
        },
      };

    case 'SET_ROUTE':
      if (!state.currentTrip) return state;
      return {
        ...state,
        currentTrip: {
          ...state.currentTrip,
          route: action.payload,
          updated_at: new Date().toISOString(),
        },
      };

    case 'SET_SUGGESTIONS':
      if (!state.currentTrip) return state;
      return {
        ...state,
        currentTrip: {
          ...state.currentTrip,
          suggestions: action.payload,
        },
      };

    case 'ADD_SUGGESTION_AS_STOP':
      if (!state.currentTrip) return state;
      const poi = action.payload;
      const newStop: Stop = {
        id: crypto.randomUUID(),
        name: poi.name,
        type: poi.type,
        coordinates: poi.coordinates,
        osm_id: poi.osm_id,
        tags: poi.tags,
        planned_arrival: new Date().toISOString(),
        planned_departure: new Date().toISOString(),
        duration_minutes: 30,
        is_anchor: false,
      };
      return {
        ...state,
        currentTrip: {
          ...state.currentTrip,
          stops: [...state.currentTrip.stops, newStop],
          suggestions: state.currentTrip.suggestions?.filter(
            (s) => s.id !== poi.id
          ),
          updated_at: new Date().toISOString(),
        },
      };

    case 'SET_STATUS':
      if (!state.currentTrip) return state;
      return {
        ...state,
        currentTrip: {
          ...state.currentTrip,
          status: action.payload,
          updated_at: new Date().toISOString(),
        },
      };

    case 'START_TRIP':
      if (!state.currentTrip) return state;
      return {
        ...state,
        currentTrip: {
          ...state.currentTrip,
          status: 'active',
          execution: {
            started_at: new Date().toISOString(),
            current_stop_index: 0,
            completed_stops: [],
          },
          updated_at: new Date().toISOString(),
        },
      };

    case 'COMPLETE_STOP':
      if (!state.currentTrip?.execution) return state;
      const completedStops = [
        ...state.currentTrip.execution.completed_stops,
        action.payload,
      ];
      const nextIndex = state.currentTrip.execution.current_stop_index + 1;
      return {
        ...state,
        currentTrip: {
          ...state.currentTrip,
          execution: {
            ...state.currentTrip.execution,
            completed_stops: completedStops,
            current_stop_index: nextIndex,
          },
          status:
            nextIndex >= state.currentTrip.stops.length
              ? 'completed'
              : 'active',
          updated_at: new Date().toISOString(),
        },
      };

    case 'SKIP_STOP':
      if (!state.currentTrip?.execution) return state;
      return {
        ...state,
        currentTrip: {
          ...state.currentTrip,
          stops: state.currentTrip.stops.map((s) =>
            s.id === action.payload ? { ...s, skipped: true } : s
          ),
          execution: {
            ...state.currentTrip.execution,
            current_stop_index:
              state.currentTrip.execution.current_stop_index + 1,
          },
          updated_at: new Date().toISOString(),
        },
      };

    case 'SET_HISTORY':
      return { ...state, tripHistory: action.payload };

    case 'HYDRATE':
      return {
        ...state,
        currentTrip: action.payload.trip,
        tripHistory: action.payload.history,
        isLoading: false,
      };

    case 'SET_LOADING':
      return { ...state, isLoading: action.payload };

    default:
      return state;
  }
}

// =============================================================================
// Context
// =============================================================================

interface TripContextValue {
  currentTrip: Trip | null;
  tripHistory: Trip[];
  isLoading: boolean;
  setTrip: (trip: Trip) => void;
  clearTrip: () => void;
  addStop: (stop: Stop) => void;
  removeStop: (stopId: string) => void;
  reorderStops: (stopIds: string[]) => void;
  updateStop: (id: string, updates: Partial<Stop>) => void;
  setRoute: (route: Route) => void;
  setSuggestions: (pois: POI[]) => void;
  addSuggestionAsStop: (poi: POI) => void;
  setStatus: (status: TripStatus) => void;
  startTrip: () => void;
  completeStop: (stopId: string) => void;
  skipStop: (stopId: string) => void;
  saveToHistory: () => void;
}

const TripContext = createContext<TripContextValue | null>(null);

// =============================================================================
// Provider
// =============================================================================

interface TripProviderProps {
  children: ReactNode;
}

export function TripProvider({ children }: TripProviderProps) {
  const [state, dispatch] = useReducer(tripReducer, initialState);

  // Load from localStorage on mount
  useEffect(() => {
    try {
      const storedTrip = localStorage.getItem(STORAGE_KEYS.CURRENT_TRIP);
      const storedHistory = localStorage.getItem(STORAGE_KEYS.TRIP_HISTORY);

      const trip = storedTrip ? JSON.parse(storedTrip) : null;
      const history = storedHistory ? JSON.parse(storedHistory) : [];

      dispatch({ type: 'HYDRATE', payload: { trip, history } });
    } catch {
      dispatch({ type: 'SET_LOADING', payload: false });
    }
  }, []);

  // Persist current trip to localStorage
  useEffect(() => {
    if (!state.isLoading) {
      if (state.currentTrip) {
        localStorage.setItem(
          STORAGE_KEYS.CURRENT_TRIP,
          JSON.stringify(state.currentTrip)
        );
      } else {
        localStorage.removeItem(STORAGE_KEYS.CURRENT_TRIP);
      }
    }
  }, [state.currentTrip, state.isLoading]);

  // Persist history to localStorage
  useEffect(() => {
    if (!state.isLoading) {
      localStorage.setItem(
        STORAGE_KEYS.TRIP_HISTORY,
        JSON.stringify(state.tripHistory)
      );
    }
  }, [state.tripHistory, state.isLoading]);

  const saveToHistory = () => {
    if (state.currentTrip) {
      const existingIndex = state.tripHistory.findIndex(
        (t) => t.id === state.currentTrip!.id
      );
      if (existingIndex >= 0) {
        const updated = [...state.tripHistory];
        updated[existingIndex] = state.currentTrip;
        dispatch({ type: 'SET_HISTORY', payload: updated });
      } else {
        dispatch({
          type: 'SET_HISTORY',
          payload: [state.currentTrip, ...state.tripHistory],
        });
      }
    }
  };

  const value: TripContextValue = {
    currentTrip: state.currentTrip,
    tripHistory: state.tripHistory,
    isLoading: state.isLoading,
    setTrip: (trip) => dispatch({ type: 'SET_TRIP', payload: trip }),
    clearTrip: () => dispatch({ type: 'CLEAR_TRIP' }),
    addStop: (stop) => dispatch({ type: 'ADD_STOP', payload: stop }),
    removeStop: (id) => dispatch({ type: 'REMOVE_STOP', payload: id }),
    reorderStops: (ids) => dispatch({ type: 'REORDER_STOPS', payload: ids }),
    updateStop: (id, updates) =>
      dispatch({ type: 'UPDATE_STOP', payload: { id, updates } }),
    setRoute: (route) => dispatch({ type: 'SET_ROUTE', payload: route }),
    setSuggestions: (pois) => dispatch({ type: 'SET_SUGGESTIONS', payload: pois }),
    addSuggestionAsStop: (poi) =>
      dispatch({ type: 'ADD_SUGGESTION_AS_STOP', payload: poi }),
    setStatus: (status) => dispatch({ type: 'SET_STATUS', payload: status }),
    startTrip: () => dispatch({ type: 'START_TRIP' }),
    completeStop: (id) => dispatch({ type: 'COMPLETE_STOP', payload: id }),
    skipStop: (id) => dispatch({ type: 'SKIP_STOP', payload: id }),
    saveToHistory,
  };

  return <TripContext.Provider value={value}>{children}</TripContext.Provider>;
}

// =============================================================================
// Hook
// =============================================================================

export function useTrip(): TripContextValue {
  const context = useContext(TripContext);
  if (!context) {
    throw new Error('useTrip must be used within TripProvider');
  }
  return context;
}
