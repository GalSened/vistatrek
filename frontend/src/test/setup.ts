import '@testing-library/jest-dom';
import { afterEach, vi } from 'vitest';
import { cleanup } from '@testing-library/react';

// Common English translations for tests
const translations: Record<string, string> = {
  // App
  'app.name': 'VistaTrek',
  'app.tagline': 'Discover hidden gems along your route',
  'app.motto': "Discover nature's hidden gems along your route",
  'app.version': 'Version',

  // Home
  'home.planNewTrip': 'Plan a New Trip',
  'home.quickPlan': 'Quick Plan',
  'home.tripName': 'Trip Name',
  'home.date': 'Date',
  'home.vibes': 'Trip Vibes',
  'home.planMyTrip': 'Plan My Trip',
  'home.creating': 'Creating...',
  'home.recentTrips': 'Recent Trips',

  // Vibes
  'vibes.nature': 'Nature',
  'vibes.chill': 'Chill',
  'vibes.hiking': 'Hiking',
  'vibes.foodie': 'Foodie',
  'vibes.adventure': 'Adventure',

  // Settings
  'settings.title': 'Settings',
  'settings.profile': 'Profile',
  'settings.name': 'Name',
  'settings.namePlaceholder': 'Your name',
  'settings.hikingScore': 'Hiking Score',
  'settings.hikingHint': 'Higher = more challenging trails and viewpoints',
  'settings.foodieScore': 'Foodie Score',
  'settings.foodieHint': 'Higher = more cafes and restaurants suggested',
  'settings.patienceScore': 'Patience Score',
  'settings.patienceHint': 'Higher = more stops, longer detours OK',
  'settings.navigation': 'Navigation',
  'settings.appSettings': 'App Settings',
  'settings.gpsTracking': 'GPS Tracking',
  'settings.gpsTrackingDesc': 'Enable real-time location tracking during trips',
  'settings.smartAlerts': 'Smart Alerts',
  'settings.smartAlertsDesc': 'Get notified about timing and pacing',
  'settings.feedbackPopups': 'Feedback Popups',
  'settings.feedbackPopupsDesc': 'Quick rating popups after each stop',
  'settings.darkMode': 'Dark Mode',
  'settings.darkModeDesc': 'Use dark theme for the app',
  'settings.about': 'About',
  'settings.waze': 'Waze',
  'settings.googleMaps': 'Google Maps',
  'settings.appleMaps': 'Apple Maps',

  // Chat
  'chat.title': 'Trip Assistant',
  'chat.welcome': 'Hi! I can help you modify your trip.',
  'chat.examples': 'Try saying:',
  'chat.example1': '"Add a coffee stop"',
  'chat.example2': '"Remove the gas station"',
  'chat.example3': '"Move lunch to 1pm"',
  'chat.inputPlaceholder': 'Type a message...',
  'chat.send': 'Send',
  'chat.clear': 'Clear',
  'chat.error': 'Failed to send message. Please try again.',

  // Onboarding
  'onboarding.welcome.title': 'Welcome to VistaTrek!',
  'onboarding.welcome.subtitle': 'Discover hidden gems along your route - viewpoints, cafes, and natural wonders that make road trips unforgettable.',
  'onboarding.features.smartRoute': 'Smart Route Planning',
  'onboarding.features.smartRouteDesc': 'AI-powered stop suggestions',
  'onboarding.features.goldenClusters': 'Golden Clusters',
  'onboarding.features.goldenClustersDesc': 'Perfect 3-stop combinations',
  'onboarding.features.pilotMode': 'Pilot Mode',
  'onboarding.features.pilotModeDesc': 'Real-time trip guidance',
  'onboarding.preferences.title': 'Tell us about yourself',
  'onboarding.preferences.subtitle': 'Help us personalize your trip suggestions',
  'onboarding.preferences.nameLabel': 'Your Name (optional)',
  'onboarding.preferences.namePlaceholder': 'Enter your name',
  'onboarding.preferences.hikingQuestion': 'How much do you enjoy hiking?',
  'onboarding.preferences.hikingHint': 'Higher = more challenging viewpoints suggested',
  'onboarding.preferences.foodieQuestion': 'How much do you love food stops?',
  'onboarding.preferences.foodieHint': 'Higher = more cafes and restaurants',
  'onboarding.navApp.title': 'Choose your navigation app',
  'onboarding.navApp.subtitle': "We'll open this app when you're ready to drive",
  'onboarding.navApp.wazeDesc': 'Community traffic alerts',
  'onboarding.navApp.googleDesc': 'Comprehensive directions',
  'onboarding.navApp.appleDesc': 'Native iOS integration',
  'onboarding.complete.title': "You're all set!",
  'onboarding.complete.subtitle': 'Start planning your first adventure',
  'onboarding.skipForNow': 'Skip for now',
  'onboarding.continue': 'Continue',
  'onboarding.letsGo': "Let's Go!",
  'onboarding.skip': 'Skip',

  // Common
  'common.close': 'Close',
  'common.back': 'Back',
  'common.goHome': 'Go Home',

  // Errors
  'errors.pageNotFound': 'Page not found',

  // Planner
  'planner.loadingTrip': 'Loading trip...',
  'planner.noTripSelected': 'No trip selected',
  'planner.failedToLoad': 'Failed to load trip',
  'planner.planningRoute': 'Planning route...',
  'planner.goHome': 'Go Home',
};

// Mock react-i18next
vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string, defaultValue?: string) => translations[key] || defaultValue || key,
    i18n: {
      language: 'en',
      changeLanguage: vi.fn(),
    },
  }),
  Trans: ({ children }: { children: React.ReactNode }) => children,
  initReactI18next: {
    type: '3rdParty',
    init: vi.fn(),
  },
}));

// Cleanup after each test
afterEach(() => {
  cleanup();
});

// Mock localStorage
const localStorageMock = (() => {
  let store: Record<string, string> = {};
  return {
    getItem: (key: string) => store[key] || null,
    setItem: (key: string, value: string) => {
      store[key] = value;
    },
    removeItem: (key: string) => {
      delete store[key];
    },
    clear: () => {
      store = {};
    },
  };
})();

Object.defineProperty(window, 'localStorage', {
  value: localStorageMock,
});

// Mock geolocation
const mockGeolocation = {
  getCurrentPosition: vi.fn(),
  watchPosition: vi.fn(),
  clearWatch: vi.fn(),
};

Object.defineProperty(navigator, 'geolocation', {
  value: mockGeolocation,
  writable: true,
});

// Mock WakeLock
const mockWakeLock = {
  request: vi.fn().mockResolvedValue({
    release: vi.fn().mockResolvedValue(undefined),
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
  }),
};

Object.defineProperty(navigator, 'wakeLock', {
  value: mockWakeLock,
  writable: true,
});
