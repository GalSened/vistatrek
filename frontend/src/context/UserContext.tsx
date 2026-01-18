/**
 * User Context - manages user profile and settings
 * Per PRD: localStorage persistence for offline-first
 */

import {
  createContext,
  useContext,
  useReducer,
  useEffect,
  ReactNode,
} from 'react';
import {
  UserProfile,
  Settings,
  DEFAULT_USER_PROFILE,
  DEFAULT_SETTINGS,
  STORAGE_KEYS,
  NavApp,
} from '../types';

// =============================================================================
// State & Actions
// =============================================================================

interface UserState {
  profile: UserProfile;
  settings: Settings;
  isLoading: boolean;
}

type UserAction =
  | { type: 'SET_PROFILE'; payload: Partial<UserProfile> }
  | { type: 'SET_SETTINGS'; payload: Partial<Settings> }
  | { type: 'COMPLETE_ONBOARDING' }
  | { type: 'SET_NAV_APP'; payload: NavApp }
  | { type: 'HYDRATE'; payload: { profile: UserProfile; settings: Settings } }
  | { type: 'SET_LOADING'; payload: boolean };

const initialState: UserState = {
  profile: DEFAULT_USER_PROFILE,
  settings: DEFAULT_SETTINGS,
  isLoading: true,
};

// =============================================================================
// Reducer
// =============================================================================

function userReducer(state: UserState, action: UserAction): UserState {
  switch (action.type) {
    case 'SET_PROFILE':
      return {
        ...state,
        profile: { ...state.profile, ...action.payload },
      };
    case 'SET_SETTINGS':
      return {
        ...state,
        settings: { ...state.settings, ...action.payload },
      };
    case 'COMPLETE_ONBOARDING':
      return {
        ...state,
        profile: { ...state.profile, onboarding_completed: true },
      };
    case 'SET_NAV_APP':
      return {
        ...state,
        profile: { ...state.profile, preferred_nav_app: action.payload },
      };
    case 'HYDRATE':
      return {
        ...state,
        profile: action.payload.profile,
        settings: action.payload.settings,
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

interface UserContextValue {
  profile: UserProfile;
  settings: Settings;
  isLoading: boolean;
  updateProfile: (updates: Partial<UserProfile>) => void;
  updateSettings: (updates: Partial<Settings>) => void;
  completeOnboarding: () => void;
  setNavApp: (app: NavApp) => void;
}

const UserContext = createContext<UserContextValue | null>(null);

// =============================================================================
// Provider
// =============================================================================

interface UserProviderProps {
  children: ReactNode;
}

export function UserProvider({ children }: UserProviderProps) {
  const [state, dispatch] = useReducer(userReducer, initialState);

  // Load from localStorage on mount
  useEffect(() => {
    try {
      const storedProfile = localStorage.getItem(STORAGE_KEYS.USER_PROFILE);
      const storedSettings = localStorage.getItem(STORAGE_KEYS.SETTINGS);

      const profile = storedProfile
        ? { ...DEFAULT_USER_PROFILE, ...JSON.parse(storedProfile) }
        : { ...DEFAULT_USER_PROFILE, id: crypto.randomUUID() };

      const settings = storedSettings
        ? { ...DEFAULT_SETTINGS, ...JSON.parse(storedSettings) }
        : DEFAULT_SETTINGS;

      dispatch({ type: 'HYDRATE', payload: { profile, settings } });
    } catch {
      dispatch({ type: 'SET_LOADING', payload: false });
    }
  }, []);

  // Persist to localStorage on changes
  useEffect(() => {
    if (!state.isLoading) {
      localStorage.setItem(
        STORAGE_KEYS.USER_PROFILE,
        JSON.stringify(state.profile)
      );
      localStorage.setItem(
        STORAGE_KEYS.SETTINGS,
        JSON.stringify(state.settings)
      );
    }
  }, [state.profile, state.settings, state.isLoading]);

  const value: UserContextValue = {
    profile: state.profile,
    settings: state.settings,
    isLoading: state.isLoading,
    updateProfile: (updates) => dispatch({ type: 'SET_PROFILE', payload: updates }),
    updateSettings: (updates) => dispatch({ type: 'SET_SETTINGS', payload: updates }),
    completeOnboarding: () => dispatch({ type: 'COMPLETE_ONBOARDING' }),
    setNavApp: (app) => dispatch({ type: 'SET_NAV_APP', payload: app }),
  };

  return <UserContext.Provider value={value}>{children}</UserContext.Provider>;
}

// =============================================================================
// Hook
// =============================================================================

export function useUser(): UserContextValue {
  const context = useContext(UserContext);
  if (!context) {
    throw new Error('useUser must be used within UserProvider');
  }
  return context;
}
