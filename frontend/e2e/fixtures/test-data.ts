/**
 * VistaTrek E2E Test Data
 * Test coordinates and mock responses for Playwright tests.
 */

// Israeli cities coordinates
export const LOCATIONS = {
  TEL_AVIV: { lat: 32.0853, lon: 34.7818 },
  JERUSALEM: { lat: 31.7683, lon: 35.2137 },
  HAIFA: { lat: 32.794, lon: 34.9896 },
  EILAT: { lat: 29.5577, lon: 34.9519 },
  TIBERIAS: { lat: 32.7922, lon: 35.5312 },
  NAZARETH: { lat: 32.6996, lon: 35.3035 },
  BEER_SHEVA: { lat: 31.2518, lon: 34.7913 },
  NETANYA: { lat: 32.3215, lon: 34.8532 },
  ASHDOD: { lat: 31.8044, lon: 34.655 },
  ASHKELON: { lat: 31.6688, lon: 34.5743 },
};

// Test trips from the test plan
export const TEST_TRIPS = {
  TRIP_01: {
    name: 'Tel Aviv to Jerusalem',
    start: LOCATIONS.TEL_AVIV,
    end: LOCATIONS.JERUSALEM,
    expectedDuration: { min: 40, max: 90 }, // minutes
    expectedDistance: { min: 50, max: 80 }, // km
  },
  TRIP_02: {
    name: 'Tel Aviv to Haifa',
    start: LOCATIONS.TEL_AVIV,
    end: LOCATIONS.HAIFA,
    expectedDuration: { min: 60, max: 120 },
    expectedDistance: { min: 80, max: 120 },
  },
  TRIP_03: {
    name: 'Jerusalem to Tiberias',
    start: LOCATIONS.JERUSALEM,
    end: LOCATIONS.TIBERIAS,
    expectedDuration: { min: 90, max: 180 },
    expectedDistance: { min: 100, max: 160 },
  },
  TRIP_04: {
    name: 'Haifa to Eilat',
    start: LOCATIONS.HAIFA,
    end: LOCATIONS.EILAT,
    expectedDuration: { min: 240, max: 360 },
    expectedDistance: { min: 350, max: 450 },
  },
  TRIP_05: {
    name: 'Beer Sheva to Nazareth',
    start: LOCATIONS.BEER_SHEVA,
    end: LOCATIONS.NAZARETH,
    expectedDuration: { min: 120, max: 200 },
    expectedDistance: { min: 150, max: 220 },
  },
};

// Mock API response for offline testing
export const MOCK_API_RESPONSE = {
  trip_summary: {
    duration_min: 178,
    distance_km: 214.9,
  },
  route_geometry: [
    [34.7818, 32.0853],
    [34.85, 32.3],
    [34.9896, 32.794],
  ],
  recommended_stops: [
    {
      id: 12345,
      name: 'Scenic Viewpoint',
      lat: 32.5,
      lon: 34.9,
      score: 110,
      tags: { tourism: 'viewpoint' },
      reasons: ['Scenic Viewpoint', 'parking', 'cafe'],
    },
  ],
  search_area: { lat: 32.5, lon: 34.9 },
};

// GPS jitter simulation data
export const GPS_JITTER_POSITIONS = [
  { latitude: 32.0853, longitude: 34.7818 },
  { latitude: 32.0855, longitude: 34.782 },
  { latitude: 32.0851, longitude: 34.7816 },
  { latitude: 32.0854, longitude: 34.7819 },
  { latitude: 32.0852, longitude: 34.7817 },
];

// API endpoints
export const API_ENDPOINTS = {
  PRODUCTION: 'https://vistatrek.vercel.app/api',
  LOCAL: 'http://localhost:8000',
};
