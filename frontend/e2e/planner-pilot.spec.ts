/**
 * VistaTrek Planner & Pilot Page Tests
 * Tests for trip planning and navigation flows
 */

import { test, expect, Page } from '@playwright/test';
import { LOCATIONS } from './fixtures/test-data';

// Mock trip data for testing
const createMockTrip = (id: string = 'test-trip-123') => ({
  id,
  name: 'Test Trip',
  status: 'draft',
  created_at: new Date().toISOString(),
  updated_at: new Date().toISOString(),
  start_location: { lat: LOCATIONS.TEL_AVIV.lat, lon: LOCATIONS.TEL_AVIV.lon },
  end_location: { lat: LOCATIONS.JERUSALEM.lat, lon: LOCATIONS.JERUSALEM.lon },
  date: new Date().toISOString().split('T')[0],
  vibes: ['nature', 'chill'],
  route: {
    polyline: [
      [LOCATIONS.TEL_AVIV.lon, LOCATIONS.TEL_AVIV.lat],
      [34.9, 32.0],
      [LOCATIONS.JERUSALEM.lon, LOCATIONS.JERUSALEM.lat],
    ],
    duration_seconds: 3600,
    distance_meters: 60000,
  },
  stops: [
    {
      id: 'stop-1',
      name: 'Scenic Viewpoint',
      type: 'viewpoint',
      coordinates: { lat: 31.9, lon: 35.0 },
      planned_arrival: new Date().toISOString(),
      planned_departure: new Date(Date.now() + 30 * 60000).toISOString(),
      duration_minutes: 30,
      is_anchor: false,
    },
    {
      id: 'stop-2',
      name: 'Coffee Break',
      type: 'coffee',
      coordinates: { lat: 31.85, lon: 35.1 },
      planned_arrival: new Date(Date.now() + 60 * 60000).toISOString(),
      planned_departure: new Date(Date.now() + 75 * 60000).toISOString(),
      duration_minutes: 15,
      is_anchor: false,
    },
  ],
  suggestions: [
    {
      id: 'suggestion-1',
      osm_id: 12345,
      name: 'Hidden Waterfall',
      type: 'viewpoint',
      coordinates: { lat: 31.88, lon: 35.05 },
      distance_from_route_km: 2.5,
      match_score: 85,
    },
  ],
});

const createActiveMockTrip = (id: string = 'active-trip-123') => ({
  ...createMockTrip(id),
  status: 'active',
  execution: {
    started_at: new Date().toISOString(),
    current_stop_index: 0,
    completed_stops: [],
  },
});

// Helper to set up test environment
async function setupTestEnvironment(page: Page, trip: ReturnType<typeof createMockTrip> | null = null) {
  await page.addInitScript((tripData) => {
    // Set user profile
    localStorage.setItem(
      'vistatrek_user_profile',
      JSON.stringify({
        id: 'test-user-id',
        name: 'Test User',
        onboarding_completed: true,
        preferred_nav_app: 'waze',
        hiking_score: 7,
        foodie_score: 5,
        patience_score: 6,
      })
    );

    // Set settings
    localStorage.setItem(
      'vistatrek_settings',
      JSON.stringify({
        gps_tracking: true,
        smart_alerts: true,
        feedback_popups: true,
        dark_mode: true,
      })
    );

    // Set current trip if provided
    if (tripData) {
      localStorage.setItem('vistatrek_current_trip', JSON.stringify(tripData));
      localStorage.setItem('vistatrek_trip_history', JSON.stringify([tripData]));
    }
  }, trip);

  // Clear existing routes and mock API endpoints
  await page.unrouteAll({ behavior: 'ignoreErrors' });

  if (trip) {
    await page.route('**/api/trips/*', (route) => {
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify(trip),
      });
    });

    await page.route('**/api/plan', (route) => {
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          macro_route: trip.route,
          micro_stops: trip.suggestions || [],
        }),
      });
    });
  }
}

test.describe('Planner Page Tests', () => {
  test.beforeEach(async ({ page }) => {
    const trip = createMockTrip();
    await setupTestEnvironment(page, trip);
  });

  /**
   * Test: Planner page loads with trip data
   */
  test('loads planner with trip data from context', async ({ page }) => {
    await page.goto('/planner/test-trip-123');

    // Should show trip name
    await expect(page.locator('h1')).toContainText('Test Trip');

    // Should show stops section
    await expect(page.locator('.stops-section')).toBeVisible();

    // Map container should be present (Leaflet may render differently based on viewport)
    await expect(page.locator('.trip-map')).toBeAttached();
  });

  /**
   * Test: View toggle works
   */
  test('view toggle switches between map, split, and list views', async ({
    page,
  }) => {
    await page.goto('/planner/test-trip-123');

    // Find view toggle buttons
    const viewToggle = page.locator('.view-toggle');
    await expect(viewToggle).toBeVisible();

    const buttons = viewToggle.locator('button');
    const buttonCount = await buttons.count();

    // Should have 3 view options
    expect(buttonCount).toBe(3);

    // Click each button and verify class changes
    for (let i = 0; i < buttonCount; i++) {
      await buttons.nth(i).click();
      await expect(buttons.nth(i)).toHaveClass(/active/);
    }
  });

  /**
   * Test: Back button navigates home
   */
  test('back button returns to home page', async ({ page }) => {
    await page.goto('/planner/test-trip-123');

    const backBtn = page.locator('.back-btn');
    await expect(backBtn).toBeVisible();

    await backBtn.click();
    await expect(page).toHaveURL('/');
  });

  /**
   * Test: Stop cards are displayed
   */
  test('displays stop cards with correct information', async ({ page }) => {
    await page.goto('/planner/test-trip-123');

    // Wait for stops to load
    const stopCards = page.locator('.stop-card');
    await expect(stopCards.first()).toBeVisible();

    // Should show 2 stops from mock data
    await expect(stopCards).toHaveCount(2);

    // First stop should show "Scenic Viewpoint"
    await expect(stopCards.first()).toContainText('Scenic Viewpoint');
  });

  /**
   * Bug #7.1: Test drag handle visibility
   */
  test('stop cards have drag handles', async ({ page }) => {
    await page.goto('/planner/test-trip-123');

    const dragHandles = page.locator('.drag-handle');
    await expect(dragHandles.first()).toBeVisible();
  });

  /**
   * Test: Trip summary displays correct info
   */
  test('shows trip summary with duration and distance', async ({ page }) => {
    await page.goto('/planner/test-trip-123');

    const summary = page.locator('.trip-summary');
    await expect(summary).toBeVisible();

    // Should show duration (60 min from mock)
    await expect(summary.locator('.duration')).toBeVisible();

    // Should show distance (60 km from mock)
    await expect(summary.locator('.distance')).toBeVisible();
  });

  /**
   * Test: Start trip button exists and is functional
   */
  test('start trip button is visible and enabled with stops', async ({
    page,
  }) => {
    await page.goto('/planner/test-trip-123');

    const startBtn = page.locator('.start-trip-btn');
    await expect(startBtn).toBeVisible();
    await expect(startBtn).toBeEnabled();
  });

});

test.describe('Planner: Empty Route Edge Case', () => {
  /**
   * Bug #5.3: Test error display for route planning failure
   * FIXED: Added hasAttemptedPlan ref to track whether route planning has been attempted.
   * This prevents infinite loops when the API returns an empty route.
   */
  test('handles missing route data gracefully', async ({ page }) => {
    // This test verifies the fix for the infinite loop bug in Planner.tsx
    // The fix uses a ref to track if planning was already attempted.
    const tripWithoutRoute = {
      ...createMockTrip('no-route-trip'),
      route: {
        polyline: [],
        duration_seconds: 0,
        distance_meters: 0,
      },
    };

    await setupTestEnvironment(page, tripWithoutRoute);

    // Track API calls to verify no infinite loop
    let planApiCallCount = 0;
    await page.route('**/api/plan', (route) => {
      planApiCallCount++;
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          macro_route: tripWithoutRoute.route,
          micro_stops: [],
        }),
      });
    });

    await page.goto('/planner/no-route-trip');

    // Wait for page to settle - the key test is that no infinite loop occurs
    await page.waitForTimeout(3000);

    // If infinite loop existed, planApiCallCount would be very high (100+)
    // With the fix, it should be 1 or at most 2
    expect(planApiCallCount).toBeLessThan(5);

    // Page should still load without crashing
    // Check body has content (not empty/crashed)
    const bodyContent = await page.locator('body').innerHTML();
    expect(bodyContent.length).toBeGreaterThan(50);
  });
});

test.describe('Planner: Suggestions Tests', () => {
  test.beforeEach(async ({ page }) => {
    await setupTestEnvironment(page, createMockTrip());
  });

  /**
   * Test: Suggestions section displays
   */
  test('shows suggestions section', async ({ page }) => {
    await page.goto('/planner/test-trip-123');

    // Look for suggestions section - may be in list or split view
    const suggestionsSection = page.locator('.suggestions-section');

    // If in map-only view, switch to split or list
    const viewToggle = page.locator('.view-toggle button').last();
    await viewToggle.click();

    await expect(suggestionsSection).toBeVisible();
  });
});

test.describe('Pilot Page Tests', () => {
  test.beforeEach(async ({ page }) => {
    const activeTrip = createActiveMockTrip();
    await setupTestEnvironment(page, activeTrip);
  });

  /**
   * Test: Pilot page loads with active trip
   */
  test('loads pilot page with active trip', async ({ page }) => {
    await page.goto('/pilot/active-trip-123');

    // Should show pilot page
    await expect(page.locator('.pilot-page')).toBeVisible();

    // Should show end trip button
    await expect(page.locator('.end-trip-btn')).toBeVisible();
  });

  /**
   * Test: Progress bar shows
   */
  test('displays progress bar', async ({ page }) => {
    await page.goto('/pilot/active-trip-123');

    const progressBar = page.locator('.progress-bar');
    await expect(progressBar).toBeVisible();
  });

  /**
   * Test: Current stop card is displayed
   */
  test('shows current stop card', async ({ page }) => {
    await page.goto('/pilot/active-trip-123');

    const currentStop = page.locator('.pilot-stop-card.current');
    await expect(currentStop).toBeVisible();

    // Should show stop name
    await expect(currentStop).toContainText('Scenic Viewpoint');
  });

  /**
   * Test: Arrival button exists
   */
  test('arrival button is functional', async ({ page }) => {
    await page.goto('/pilot/active-trip-123');

    const arriveBtn = page.locator('.arrive-btn');
    await expect(arriveBtn).toBeVisible();
    await expect(arriveBtn).toBeEnabled();
  });

  /**
   * Test: Skip button exists
   */
  test('skip button is functional', async ({ page }) => {
    await page.goto('/pilot/active-trip-123');

    const skipBtn = page.locator('.skip-btn');
    await expect(skipBtn).toBeVisible();
    await expect(skipBtn).toBeEnabled();
  });

  /**
   * Test: Navigate button exists
   */
  test('navigate button is functional', async ({ page }) => {
    await page.goto('/pilot/active-trip-123');

    const navigateBtn = page.locator('.navigate-btn');
    await expect(navigateBtn).toBeVisible();
    await expect(navigateBtn).toBeEnabled();
  });

  /**
   * Test: End trip button works
   */
  test('end trip button returns to home', async ({ page }) => {
    await page.goto('/pilot/active-trip-123');

    const endTripBtn = page.locator('.end-trip-btn');
    await expect(endTripBtn).toBeVisible();

    await endTripBtn.click();

    // Should navigate back to home
    await expect(page).toHaveURL('/');
  });

  /**
   * Bug #9.1: Test handling when no current stop
   * (Edge case: all stops completed)
   */
  test('handles completed trip state', async ({ page }) => {
    // Create trip with all stops completed
    const completedTrip = {
      ...createActiveMockTrip('completed-trip'),
      execution: {
        started_at: new Date().toISOString(),
        current_stop_index: 2, // Beyond last stop
        completed_stops: ['stop-1', 'stop-2'],
      },
    };

    await setupTestEnvironment(page, completedTrip);
    await page.goto('/pilot/completed-trip');

    // Should show completion screen or handle gracefully
    await expect(page.locator('.pilot-page')).toBeVisible();
  });
});

test.describe('Pilot: Geolocation Integration', () => {
  test.beforeEach(async ({ page, context }) => {
    // Grant geolocation permission
    await context.grantPermissions(['geolocation']);

    // Set initial position
    await context.setGeolocation({
      latitude: LOCATIONS.TEL_AVIV.lat,
      longitude: LOCATIONS.TEL_AVIV.lon,
    });

    const activeTrip = createActiveMockTrip();
    await setupTestEnvironment(page, activeTrip);
  });

  /**
   * Test: Pilot shows map with current location
   */
  test('shows map with position marker', async ({ page }) => {
    await page.goto('/pilot/active-trip-123');

    // Map container should be present (Leaflet may render differently based on viewport)
    await expect(page.locator('.trip-map')).toBeAttached();

    // Map should have markers (Leaflet creates these)
    await expect(page.locator('.leaflet-marker-icon').first()).toBeAttached();
  });

  /**
   * Test: Position updates don't crash the app
   */
  test('handles rapid position updates', async ({ page, context }) => {
    await page.goto('/pilot/active-trip-123');

    // Simulate rapid position changes
    for (let i = 0; i < 5; i++) {
      await context.setGeolocation({
        latitude: LOCATIONS.TEL_AVIV.lat + i * 0.001,
        longitude: LOCATIONS.TEL_AVIV.lon + i * 0.001,
      });
      await page.waitForTimeout(200);
    }

    // App should still be functional
    await expect(page.locator('.pilot-page')).toBeVisible();
    await expect(page.locator('.pilot-stop-card.current')).toBeVisible();
  });
});

test.describe('Planner to Pilot Transition', () => {
  test.beforeEach(async ({ page }) => {
    await setupTestEnvironment(page, createMockTrip());
  });

  /**
   * Test: Starting trip transitions to pilot mode
   */
  test('start trip navigates to pilot page', async ({ page }) => {
    await page.goto('/planner/test-trip-123');

    const startBtn = page.locator('.start-trip-btn');
    await expect(startBtn).toBeVisible();

    await startBtn.click();

    // Should navigate to pilot page
    await expect(page).toHaveURL(/\/pilot\//);
  });
});

test.describe('Edge Cases: Invalid Trip IDs', () => {
  test.beforeEach(async ({ page }) => {
    await page.addInitScript(() => {
      localStorage.setItem(
        'vistatrek_user_profile',
        JSON.stringify({
          id: 'test-user-id',
          name: 'Test User',
          onboarding_completed: true,
          preferred_nav_app: 'waze',
          scores: { hiking: 5, foodie: 5, patience: 5 },
        })
      );
    });
  });

  /**
   * Test: Non-existent trip ID handling
   */
  test('handles non-existent trip ID gracefully', async ({ page }) => {
    await page.goto('/planner/non-existent-trip');

    // Should redirect to home or show error
    // The app should not crash
    await page.waitForTimeout(1000);

    // Either redirected to home or shows planner (empty state)
    const isHome = await page.locator('.home-page').isVisible();
    const isPlanner = await page.locator('.planner-page').isVisible();

    expect(isHome || isPlanner).toBe(true);
  });

  /**
   * Test: Malformed trip ID
   */
  test('handles malformed trip ID', async ({ page }) => {
    // URL-encode the malformed ID
    await page.goto('/planner/test%3Cscript%3Ealert(1)%3C%2Fscript%3E');

    // Should not crash, should handle gracefully
    await page.waitForTimeout(1000);

    // App should still be functional - either showing home, planner, or error state
    const isHome = await page.locator('.home-page').isVisible();
    const isPlanner = await page.locator('.planner-page').isVisible();
    const hasErrorState = await page.locator('.planner-page.error').isVisible();

    expect(isHome || isPlanner || hasErrorState).toBe(true);
  });
});
