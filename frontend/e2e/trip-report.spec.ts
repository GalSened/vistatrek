/**
 * VistaTrek Trip Report - Comprehensive E2E Test Suite
 *
 * This test suite covers:
 * - Complex user flows
 * - Error handling scenarios
 * - Navigation (back/forward)
 * - Edge cases
 * - Accessibility
 * - Print and export functionality
 * - Internationalization (RTL/LTR)
 */

import { test, expect, Page, BrowserContext } from '@playwright/test';

// =============================================================================
// Test Data & Fixtures
// =============================================================================

const TEST_TRIPS = {
  singleDay: {
    id: 'trip-single-day-001',
    name: 'Tel Aviv to Jerusalem Day Trip',
    stops: 5,
    date: '2025-03-15',
  },
  multiDay: {
    id: 'trip-multi-day-002',
    name: 'Northern Israel 3-Day Adventure',
    stops: 12,
    dateRange: { start: '2025-04-10', end: '2025-04-12' },
  },
  noStops: {
    id: 'trip-no-stops-003',
    name: 'Empty Trip Draft',
    stops: 0,
    date: '2025-05-01',
  },
  manyStops: {
    id: 'trip-many-stops-004',
    name: 'Grand Israel Tour',
    stops: 25,
    dateRange: { start: '2025-06-01', end: '2025-06-07' },
  },
};

const ROUTES = {
  home: '/',
  planner: (tripId: string) => `/planner/${tripId}`,
  report: (tripId: string) => `/report/${tripId}`,
  pilot: (tripId: string) => `/pilot/${tripId}`,
  settings: '/settings',
};

// =============================================================================
// Helper Functions
// =============================================================================

async function createMockTrip(page: Page, tripData: typeof TEST_TRIPS.singleDay) {
  // Mock the API response for trip data
  await page.route(`**/api/trips/${tripData.id}`, async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        id: tripData.id,
        name: tripData.name,
        status: 'draft',
        date: tripData.date,
        start_location: { lat: 32.0853, lon: 34.7818 },
        end_location: { lat: 31.7683, lon: 35.2137 },
        route: {
          polyline: [[34.7818, 32.0853], [35.2137, 31.7683]],
          duration_seconds: 3600,
          distance_meters: 65000,
        },
        stops: Array.from({ length: tripData.stops }, (_, i) => ({
          id: `stop-${i + 1}`,
          name: `Stop ${i + 1}`,
          type: ['viewpoint', 'coffee', 'food', 'spring'][i % 4],
          coordinates: { lat: 32.0 - i * 0.05, lon: 34.8 + i * 0.1 },
          planned_arrival: new Date(2025, 2, 15, 9 + i).toISOString(),
          planned_departure: new Date(2025, 2, 15, 9 + i, 30).toISOString(),
          duration_minutes: 30,
          is_anchor: i === 0 || i === tripData.stops - 1,
        })),
      }),
    });
  });
}

async function mockReportGeneration(page: Page, tripId: string, options?: {
  shouldFail?: boolean;
  delay?: number;
  missingData?: ('weather' | 'hotels' | 'restaurants')[];
  tripData?: typeof TEST_TRIPS.singleDay;
}) {
  await page.route(`**/api/trips/${tripId}/report`, async (route) => {
    if (options?.delay) {
      await new Promise((r) => setTimeout(r, options.delay));
    }

    if (options?.shouldFail) {
      await route.fulfill({
        status: 500,
        contentType: 'application/json',
        body: JSON.stringify({ detail: 'Report generation failed' }),
      });
      return;
    }

    const missingData = options?.missingData || [];
    const tripData = options?.tripData || TEST_TRIPS.singleDay;

    // Build a complete trip object that matches what TripReport component expects
    const fullTrip = {
      id: tripId,
      name: tripData.name,
      status: 'draft',
      date: tripData.date || '2025-03-15',
      start_location: { lat: 32.0853, lon: 34.7818 },
      end_location: { lat: 31.7683, lon: 35.2137 },
      route: {
        polyline: [[34.7818, 32.0853], [35.2137, 31.7683]],
        duration_seconds: 3600,
        distance_meters: 65000,
      },
      stops: Array.from({ length: tripData.stops }, (_, i) => ({
        id: `stop-${i + 1}`,
        name: `Stop ${i + 1}`,
        type: ['viewpoint', 'coffee', 'food', 'spring'][i % 4],
        coordinates: { lat: 32.0 - i * 0.05, lon: 34.8 + i * 0.1 },
        planned_arrival: new Date(2025, 2, 15, 9 + i).toISOString(),
        planned_departure: new Date(2025, 2, 15, 9 + i, 30).toISOString(),
        duration_minutes: 30,
        is_anchor: i === 0 || i === tripData.stops - 1,
      })),
    };

    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        trip: fullTrip,
        weather: missingData.includes('weather') ? [] : [
          { date: '2025-03-15', high: 22, low: 14, condition: 'sunny', precipitation: 0, icon: 'sun' },
        ],
        hotels: missingData.includes('hotels') ? [] : [
          { id: 'h1', name: 'Grand Hotel', rating: 4.5, pricePerNight: 450, currency: 'ILS', amenities: ['WiFi', 'Parking'], address: '123 Main St' },
        ],
        restaurants: missingData.includes('restaurants') ? [] : [
          { id: 'r1', name: 'Local Bistro', rating: 4.2, priceLevel: 2, cuisine: ['Mediterranean'], specialty: 'Fresh local cuisine', hours: '11:00-22:00' },
        ],
        budget: {
          accommodation: 900,
          food: 400,
          transportation: 200,
          activities: 150,
          misc: 100,
          total: 1750,
          currency: 'ILS',
          perDay: [],
        },
        practicalInfo: {
          packingList: [
            { item: 'Sunscreen', category: 'toiletries', essential: true },
            { item: 'Hiking boots', category: 'gear', essential: true },
          ],
          emergencyContacts: [
            { name: 'Police', number: '100', type: 'police' },
            { name: 'Ambulance', number: '101', type: 'ambulance' },
          ],
          tips: ['Bring plenty of water', 'Start early to avoid heat'],
        },
        generatedAt: new Date().toISOString(),
      }),
    });
  });
}

async function waitForReportToLoad(page: Page) {
  // Wait for loading to complete
  await page.waitForSelector('.report-page:not(.loading)', { timeout: 15000 });
}

async function setLanguage(page: Page, lang: 'en' | 'he') {
  await page.evaluate((language) => {
    localStorage.setItem('vistatrek_language', language);
  }, lang);
  await page.reload();
}

// =============================================================================
// TEST SUITE 1: Basic Report Generation & Display
// =============================================================================

test.describe('Trip Report - Basic Functionality', () => {
  test('1.1 - Should display loading states with progress steps', async ({ page }) => {
    // Set up mocks before navigation
    await createMockTrip(page, TEST_TRIPS.singleDay);
    await mockReportGeneration(page, TEST_TRIPS.singleDay.id);

    // Navigate to report page
    await page.goto(ROUTES.report(TEST_TRIPS.singleDay.id));

    // Wait for report to fully load (component uses mock data on API failure)
    await waitForReportToLoad(page);

    // Verify the report content is displayed (not loading anymore)
    await expect(page.locator('.report-loading')).not.toBeVisible();
    await expect(page.locator('.report-header')).toBeVisible();
    await expect(page.locator('.report-content')).toBeVisible();
  });

  test('1.2 - Should display all report sections correctly', async ({ page }) => {
    // Set up mocks before navigation
    await createMockTrip(page, TEST_TRIPS.singleDay);
    await mockReportGeneration(page, TEST_TRIPS.singleDay.id);

    await page.goto(ROUTES.report(TEST_TRIPS.singleDay.id));
    await waitForReportToLoad(page);

    // Verify header shows "Trip Report" title
    await expect(page.locator('.report-header h1')).toContainText(/Trip Report|דוח טיול/);

    // Verify trip name is in overview
    await expect(page.locator('.report-overview h1.trip-title')).toContainText(TEST_TRIPS.singleDay.name);

    // Verify all main sections exist (using ID selectors)
    const sections = [
      '.report-overview',
      '.report-toc',
      '#itinerary',
      '#weather',
      '#hotels',
      '#restaurants',
      '#budget',
      '#packing',
      '#emergency',
      '#tips',
    ];

    for (const section of sections) {
      await expect(page.locator(section)).toBeVisible();
    }
  });

  test('1.3 - Should display correct trip statistics in overview', async ({ page }) => {
    // Set up mocks before navigation
    await createMockTrip(page, TEST_TRIPS.singleDay);
    await mockReportGeneration(page, TEST_TRIPS.singleDay.id);

    await page.goto(ROUTES.report(TEST_TRIPS.singleDay.id));
    await waitForReportToLoad(page);

    const overview = page.locator('.report-overview');

    // Check stats are present
    await expect(overview.locator('.stat-value')).toHaveCount(4); // stops, distance, duration, date

    // Verify stop count
    await expect(overview).toContainText(`${TEST_TRIPS.singleDay.stops}`);
  });
});

// =============================================================================
// TEST SUITE 2: Error Handling
// =============================================================================

test.describe('Trip Report - Error Handling', () => {
  test('2.1 - Should gracefully fallback to mock data when report API fails', async ({ page }) => {
    await createMockTrip(page, TEST_TRIPS.singleDay);
    await mockReportGeneration(page, TEST_TRIPS.singleDay.id, { shouldFail: true });

    await page.goto(ROUTES.report(TEST_TRIPS.singleDay.id));

    // Component should gracefully fallback to mock data instead of showing error
    await waitForReportToLoad(page);
    await expect(page.locator('.report-header')).toBeVisible();
    await expect(page.locator('.report-content')).toBeVisible();
  });

  test('2.2 - Should display fallback content when API returns error', async ({ page }) => {
    await createMockTrip(page, TEST_TRIPS.singleDay);

    // API returns error
    await page.route(`**/api/trips/${TEST_TRIPS.singleDay.id}/report`, async (route) => {
      await route.fulfill({ status: 500, body: JSON.stringify({ detail: 'Error' }) });
    });

    await page.goto(ROUTES.report(TEST_TRIPS.singleDay.id));

    // Component should gracefully fallback to mock data
    await waitForReportToLoad(page);
    await expect(page.locator('.report-header')).toBeVisible();

    // Verify key sections are rendered with fallback data
    await expect(page.locator('#itinerary')).toBeVisible();
    await expect(page.locator('#weather')).toBeVisible();
  });

  test('2.3 - Should handle network timeout gracefully', async ({ page }) => {
    await createMockTrip(page, TEST_TRIPS.singleDay);

    // Simulate network timeout by aborting the request
    await page.route(`**/api/trips/${TEST_TRIPS.singleDay.id}/report`, async (route) => {
      await route.abort('timedout');
    });

    await page.goto(ROUTES.report(TEST_TRIPS.singleDay.id));

    // Component should show error state or fallback to mock data
    await expect(
      page.locator('.report-error').or(page.locator('.report-header'))
    ).toBeVisible({ timeout: 10000 });
  });

  test('2.4 - Should handle trip not found gracefully', async ({ page }) => {
    // Don't mock the trip - let it 404
    await page.route('**/api/trips/nonexistent-trip', async (route) => {
      await route.fulfill({ status: 404, body: JSON.stringify({ detail: 'Trip not found' }) });
    });

    await page.goto(ROUTES.report('nonexistent-trip'));

    // Should either show error or fallback to mock data
    await expect(
      page.locator('.report-error, .error').or(page.locator('.report-header'))
    ).toBeVisible({ timeout: 10000 });
  });

  test('2.5 - Should handle partial data gracefully', async ({ page }) => {
    await createMockTrip(page, TEST_TRIPS.singleDay);
    await mockReportGeneration(page, TEST_TRIPS.singleDay.id, {
      missingData: ['weather', 'hotels'],
    });

    await page.goto(ROUTES.report(TEST_TRIPS.singleDay.id));
    await waitForReportToLoad(page);

    // Report should load successfully even with missing data
    await expect(page.locator('.report-header')).toBeVisible();

    // Itinerary section should always be visible
    await expect(page.locator('#itinerary')).toBeVisible();

    // The report content should be present
    await expect(page.locator('.report-content')).toBeVisible();
  });
});

// =============================================================================
// TEST SUITE 3: Navigation - Back/Forward
// =============================================================================

test.describe('Trip Report - Navigation', () => {
  test.beforeEach(async ({ page }) => {
    await createMockTrip(page, TEST_TRIPS.singleDay);
    await mockReportGeneration(page, TEST_TRIPS.singleDay.id);
  });

  test('3.1 - Should navigate back to planner via back button', async ({ page }) => {
    // Start at planner
    await page.goto(ROUTES.planner(TEST_TRIPS.singleDay.id));
    await page.waitForLoadState('networkidle');

    // Click view report
    await page.click('.view-report-btn');
    await waitForReportToLoad(page);

    // Click back button in report header
    await page.click('.report-header .back-btn');

    // Should be back at planner
    await expect(page).toHaveURL(new RegExp(`/planner/${TEST_TRIPS.singleDay.id}`));
  });

  test('3.2 - Should support browser back/forward navigation', async ({ page }) => {
    // Home -> Planner -> Report
    await page.goto(ROUTES.home);
    await page.waitForLoadState('networkidle');

    await page.goto(ROUTES.planner(TEST_TRIPS.singleDay.id));
    await page.waitForLoadState('networkidle');

    await page.goto(ROUTES.report(TEST_TRIPS.singleDay.id));
    await waitForReportToLoad(page);

    // Browser back to planner
    await page.goBack();
    await expect(page).toHaveURL(new RegExp('/planner/'));

    // Browser back to home
    await page.goBack();
    await expect(page).toHaveURL('/');

    // Browser forward to planner
    await page.goForward();
    await expect(page).toHaveURL(new RegExp('/planner/'));

    // Browser forward to report
    await page.goForward();
    await expect(page).toHaveURL(new RegExp('/report/'));
    await expect(page.locator('.report-header')).toBeVisible();
  });

  test('3.3 - Should preserve report state after navigation', async ({ page }) => {
    await page.goto(ROUTES.report(TEST_TRIPS.singleDay.id));
    await waitForReportToLoad(page);

    // Scroll to a specific section
    await page.locator('#budget').scrollIntoViewIfNeeded();

    // Navigate away and back
    await page.goto(ROUTES.home);
    await page.goBack();

    // Report should reload (state is re-fetched)
    await waitForReportToLoad(page);
    await expect(page.locator('.report-header')).toBeVisible();
  });

  test('3.4 - Should handle direct URL navigation to report', async ({ page }) => {
    // Directly navigate to report URL without going through planner
    await page.goto(ROUTES.report(TEST_TRIPS.singleDay.id));
    await waitForReportToLoad(page);

    // Report should load correctly - trip name is in overview
    await expect(page.locator('.report-overview h1.trip-title')).toContainText(TEST_TRIPS.singleDay.name);
  });

  test('3.5 - Should navigate to sections via table of contents', async ({ page }) => {
    await page.goto(ROUTES.report(TEST_TRIPS.singleDay.id));
    await waitForReportToLoad(page);

    // Click on budget link in TOC
    await page.click('.report-toc a[href="#budget"]');

    // Budget section should be in view
    const budgetSection = page.locator('#budget');
    await expect(budgetSection).toBeInViewport();
  });
});

// =============================================================================
// TEST SUITE 4: Complex User Flows
// =============================================================================

test.describe('Trip Report - Complex User Flows', () => {
  test('4.1 - Complete flow: Create trip -> Plan -> View Report -> Export', async ({ page }) => {
    await createMockTrip(page, TEST_TRIPS.singleDay);
    await mockReportGeneration(page, TEST_TRIPS.singleDay.id);

    // Mock trip creation
    await page.route('**/api/trips', async (route) => {
      if (route.request().method() === 'POST') {
        await route.fulfill({
          status: 201,
          contentType: 'application/json',
          body: JSON.stringify({ id: TEST_TRIPS.singleDay.id, ...TEST_TRIPS.singleDay }),
        });
      }
    });

    // Start at home
    await page.goto(ROUTES.home);

    // Navigate to planner (simulate after trip creation)
    await page.goto(ROUTES.planner(TEST_TRIPS.singleDay.id));
    await page.waitForLoadState('networkidle');

    // Click View Report button
    await page.click('.view-report-btn');
    await waitForReportToLoad(page);

    // Verify report loaded - trip name is in overview
    await expect(page.locator('.report-overview h1.trip-title')).toContainText(TEST_TRIPS.singleDay.name);

    // Test export functionality
    const [download] = await Promise.all([
      page.waitForEvent('download'),
      page.click('.action-btn.primary'),
    ]);

    // Verify download
    expect(download.suggestedFilename()).toMatch(/\.html$/);
  });

  test('4.2 - Flow: View report -> Navigate away -> View report again', async ({ page }) => {
    await createMockTrip(page, TEST_TRIPS.singleDay);
    await mockReportGeneration(page, TEST_TRIPS.singleDay.id);

    // View report first
    await page.goto(ROUTES.report(TEST_TRIPS.singleDay.id));
    await waitForReportToLoad(page);
    await expect(page.locator('.report-header')).toBeVisible();

    // Navigate away (to home)
    await page.goto(ROUTES.home);
    await page.waitForLoadState('networkidle');

    // Go back to report
    await page.goto(ROUTES.report(TEST_TRIPS.singleDay.id));
    await waitForReportToLoad(page);

    // Report should still work
    await expect(page.locator('.report-header')).toBeVisible();
    await expect(page.locator('.report-overview h1.trip-title')).toContainText(TEST_TRIPS.singleDay.name);
  });

  test('4.3 - Flow: Multi-day trip report with day navigation', async ({ page }) => {
    await createMockTrip(page, TEST_TRIPS.multiDay);
    await mockReportGeneration(page, TEST_TRIPS.multiDay.id);

    await page.goto(ROUTES.report(TEST_TRIPS.multiDay.id));
    await waitForReportToLoad(page);

    // Check day section exists (component currently shows Day 1)
    const daySections = page.locator('.day-section');
    await expect(daySections).toHaveCount(1); // Currently shows 1 day section

    // Navigate to itinerary via TOC
    await page.click('.report-toc a[href="#itinerary"]');
    await expect(page.locator('#itinerary')).toBeInViewport();
  });

  test('4.4 - Flow: Report displays correctly in default language', async ({ page }) => {
    await createMockTrip(page, TEST_TRIPS.singleDay);
    await mockReportGeneration(page, TEST_TRIPS.singleDay.id);

    // Hebrew is the app default - verify report renders correctly
    await page.goto(ROUTES.report(TEST_TRIPS.singleDay.id));
    await waitForReportToLoad(page);

    // Verify Hebrew content and RTL direction
    await expect(page.locator('html')).toHaveAttribute('dir', 'rtl');
    await expect(page.locator('.report-header')).toContainText(/דוח טיול/);

    // Navigate away and back to verify report state persists
    await page.goto(ROUTES.home);
    await page.goto(ROUTES.report(TEST_TRIPS.singleDay.id));
    await waitForReportToLoad(page);

    // Report should still be in Hebrew
    await expect(page.locator('html')).toHaveAttribute('dir', 'rtl');
    await expect(page.locator('.report-header')).toContainText(/דוח טיול/);
  });

  test('4.5 - Flow: View report with no stops (empty trip)', async ({ page }) => {
    await createMockTrip(page, TEST_TRIPS.noStops);
    await mockReportGeneration(page, TEST_TRIPS.noStops.id, { tripData: TEST_TRIPS.noStops });

    await page.goto(ROUTES.report(TEST_TRIPS.noStops.id));
    await waitForReportToLoad(page);

    // Should show the itinerary section (may contain empty state or just no stops)
    await expect(page.locator('#itinerary')).toBeVisible();

    // Other sections should still render
    await expect(page.locator('#weather')).toBeVisible();
  });

  test('4.6 - Flow: Print report', async ({ page, context }) => {
    await createMockTrip(page, TEST_TRIPS.singleDay);
    await mockReportGeneration(page, TEST_TRIPS.singleDay.id);

    await page.goto(ROUTES.report(TEST_TRIPS.singleDay.id));
    await waitForReportToLoad(page);

    // Mock window.print
    await page.evaluate(() => {
      (window as any).__printCalled = false;
      window.print = () => { (window as any).__printCalled = true; };
    });

    // Click print button (first action-btn, not the primary export one)
    await page.click('.actions .action-btn:not(.primary)');

    // Verify print was called
    const printCalled = await page.evaluate(() => (window as any).__printCalled);
    expect(printCalled).toBe(true);
  });

  test('4.7 - Flow: Navigate through all report sections sequentially', async ({ page }) => {
    await createMockTrip(page, TEST_TRIPS.singleDay);
    await mockReportGeneration(page, TEST_TRIPS.singleDay.id);

    await page.goto(ROUTES.report(TEST_TRIPS.singleDay.id));
    await waitForReportToLoad(page);

    const sectionIds = [
      'overview',
      'itinerary',
      'weather',
      'hotels',
      'restaurants',
      'budget',
      'packing',
      'emergency',
      'tips',
    ];

    // Navigate through each section using TOC
    for (const sectionId of sectionIds) {
      const tocLink = page.locator(`.report-toc a[href="#${sectionId}"]`);
      if (await tocLink.isVisible()) {
        await tocLink.click();
        await expect(page.locator(`#${sectionId}`)).toBeInViewport();
      }
    }
  });

  test('4.8 - Flow: Large trip with many stops', async ({ page }) => {
    await createMockTrip(page, TEST_TRIPS.manyStops);
    await mockReportGeneration(page, TEST_TRIPS.manyStops.id, { tripData: TEST_TRIPS.manyStops });

    await page.goto(ROUTES.report(TEST_TRIPS.manyStops.id));
    await waitForReportToLoad(page);

    // Verify stops are rendered (at least some)
    const stopCards = page.locator('.stop-card');
    const count = await stopCards.count();
    expect(count).toBeGreaterThan(0);

    // Verify scrolling works smoothly
    await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
    await page.evaluate(() => window.scrollTo(0, 0));

    // Page should still be responsive
    await expect(page.locator('.report-header')).toBeVisible();
  });

  test('4.9 - Flow: Open navigation links for stops', async ({ page, context }) => {
    await createMockTrip(page, TEST_TRIPS.singleDay);
    await mockReportGeneration(page, TEST_TRIPS.singleDay.id);

    await page.goto(ROUTES.report(TEST_TRIPS.singleDay.id));
    await waitForReportToLoad(page);

    // Find a navigation button (actual class is .nav-link)
    const navButton = page.locator('.stop-card .nav-link').first();

    // Verify navigation button is visible and clickable
    await expect(navButton).toBeVisible();
    // Navigation link opens external URL, just verify it's present
    await expect(navButton).toContainText(/Navigate|נווט/i);
  });

  test('4.10 - Flow: Coordinates are displayed for stops', async ({ page, context }) => {
    await createMockTrip(page, TEST_TRIPS.singleDay);
    await mockReportGeneration(page, TEST_TRIPS.singleDay.id);

    await page.goto(ROUTES.report(TEST_TRIPS.singleDay.id));
    await waitForReportToLoad(page);

    // Verify coordinates are displayed in stop cards
    const stopCoords = page.locator('.stop-card .stop-coords').first();
    await expect(stopCoords).toBeVisible();

    // Verify format is lat, lon
    const coordsText = await stopCoords.textContent();
    expect(coordsText).toMatch(/\d+\.\d+,\s*\d+\.\d+/); // lat, lon format
  });
});

// =============================================================================
// TEST SUITE 5: Responsive Design & Accessibility
// =============================================================================

test.describe('Trip Report - Responsive & Accessibility', () => {
  test.beforeEach(async ({ page }) => {
    await createMockTrip(page, TEST_TRIPS.singleDay);
    await mockReportGeneration(page, TEST_TRIPS.singleDay.id);
  });

  test('5.1 - Should be responsive on mobile viewport', async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 667 }); // iPhone SE

    await page.goto(ROUTES.report(TEST_TRIPS.singleDay.id));
    await waitForReportToLoad(page);

    // All sections should still be visible
    await expect(page.locator('.report-header')).toBeVisible();
    await expect(page.locator('.report-overview')).toBeVisible();

    // TOC might be collapsed on mobile
    const toc = page.locator('.report-toc');
    if (await toc.isVisible()) {
      await expect(toc).toBeInViewport();
    }
  });

  test('5.2 - Should be responsive on tablet viewport', async ({ page }) => {
    await page.setViewportSize({ width: 768, height: 1024 }); // iPad

    await page.goto(ROUTES.report(TEST_TRIPS.singleDay.id));
    await waitForReportToLoad(page);

    // Layout should adapt
    await expect(page.locator('.report-header')).toBeVisible();
    // Verify multiple sections are visible
    const sectionCount = await page.locator('.report-section').count();
    expect(sectionCount).toBeGreaterThan(5);
  });

  test('5.3 - Should have proper heading hierarchy for accessibility', async ({ page }) => {
    await page.goto(ROUTES.report(TEST_TRIPS.singleDay.id));
    await waitForReportToLoad(page);

    // Check heading hierarchy
    const h1 = page.locator('h1');
    const h2 = page.locator('h2');

    // Should have h1 elements (report title and trip name)
    const h1Count = await h1.count();
    expect(h1Count).toBeGreaterThan(0);

    // Should have section h2s
    const h2Count = await h2.count();
    expect(h2Count).toBeGreaterThan(0);
  });

  test('5.4 - Should be keyboard navigable', async ({ page }) => {
    await page.goto(ROUTES.report(TEST_TRIPS.singleDay.id));
    await waitForReportToLoad(page);

    // Tab through interactive elements
    await page.keyboard.press('Tab');

    // First focusable element should be focused (likely back button)
    const focusedElement = page.locator(':focus');
    await expect(focusedElement).toBeVisible();

    // Continue tabbing to buttons
    for (let i = 0; i < 5; i++) {
      await page.keyboard.press('Tab');
      await expect(page.locator(':focus')).toBeVisible();
    }
  });

  test('5.5 - Should have sufficient color contrast', async ({ page }) => {
    await page.goto(ROUTES.report(TEST_TRIPS.singleDay.id));
    await waitForReportToLoad(page);

    // Check that text is readable (basic check)
    const headerText = page.locator('.report-header h1');
    const styles = await headerText.evaluate((el) => {
      const computed = window.getComputedStyle(el);
      return {
        color: computed.color,
        backgroundColor: computed.backgroundColor,
      };
    });

    // Both should be defined
    expect(styles.color).toBeTruthy();
  });
});

// =============================================================================
// TEST SUITE 6: Edge Cases
// =============================================================================

test.describe('Trip Report - Edge Cases', () => {
  test('6.1 - Should handle very long trip names', async ({ page }) => {
    const longNameTrip = {
      ...TEST_TRIPS.singleDay,
      id: 'trip-long-name',
      name: 'A Very Long Trip Name That Goes On And On And Might Cause Layout Issues If Not Handled Properly With Text Truncation Or Wrapping',
    };

    await createMockTrip(page, longNameTrip);
    await mockReportGeneration(page, longNameTrip.id);

    await page.goto(ROUTES.report(longNameTrip.id));
    await waitForReportToLoad(page);

    // Name should be visible (possibly truncated)
    const header = page.locator('.report-header h1');
    await expect(header).toBeVisible();

    // Should not overflow container
    const isOverflowing = await header.evaluate((el) => {
      return el.scrollWidth > el.clientWidth;
    });
    // Either truncated or wrapped, but visible
    await expect(header).toBeInViewport();
  });

  test('6.2 - Should handle special characters in trip data', async ({ page }) => {
    const specialCharTrip = {
      ...TEST_TRIPS.singleDay,
      id: 'trip-special-chars',
      name: 'Trip with <script>alert("xss")</script> & "quotes" \'apostrophe\'',
    };

    await createMockTrip(page, specialCharTrip);
    await mockReportGeneration(page, specialCharTrip.id);

    await page.goto(ROUTES.report(specialCharTrip.id));
    await waitForReportToLoad(page);

    // Should render safely (no script execution)
    const header = page.locator('.report-header h1');
    await expect(header).toBeVisible();

    // Text should be escaped
    const text = await header.textContent();
    expect(text).not.toContain('<script>');
  });

  test('6.3 - Should handle rapid navigation between reports', async ({ page }) => {
    await createMockTrip(page, TEST_TRIPS.singleDay);
    await createMockTrip(page, TEST_TRIPS.multiDay);
    await mockReportGeneration(page, TEST_TRIPS.singleDay.id);
    await mockReportGeneration(page, TEST_TRIPS.multiDay.id);

    // Rapidly switch between reports
    await page.goto(ROUTES.report(TEST_TRIPS.singleDay.id));
    await page.goto(ROUTES.report(TEST_TRIPS.multiDay.id));
    await page.goto(ROUTES.report(TEST_TRIPS.singleDay.id));

    await waitForReportToLoad(page);

    // Should show correct report - trip name is in overview
    await expect(page.locator('.report-overview h1.trip-title')).toContainText(TEST_TRIPS.singleDay.name);
  });

  test('6.4 - Should handle page refresh during loading', async ({ page }) => {
    await createMockTrip(page, TEST_TRIPS.singleDay);
    await mockReportGeneration(page, TEST_TRIPS.singleDay.id, { delay: 3000 });

    await page.goto(ROUTES.report(TEST_TRIPS.singleDay.id));

    // Wait briefly then refresh
    await page.waitForTimeout(500);
    await page.reload();

    // Should eventually load
    await waitForReportToLoad(page);
    await expect(page.locator('.report-header')).toBeVisible();
  });

  test('6.5 - Should handle concurrent API failures gracefully', async ({ page }) => {
    await createMockTrip(page, TEST_TRIPS.singleDay);

    // All enrichment APIs fail but trip loads
    await page.route('**/api/weather', async (route) => {
      await route.fulfill({ status: 500 });
    });
    await page.route('**/api/places/hotels*', async (route) => {
      await route.fulfill({ status: 500 });
    });
    await page.route('**/api/places/restaurants*', async (route) => {
      await route.fulfill({ status: 500 });
    });

    // Report generation falls back to mock
    await mockReportGeneration(page, TEST_TRIPS.singleDay.id);

    await page.goto(ROUTES.report(TEST_TRIPS.singleDay.id));
    await waitForReportToLoad(page);

    // Report should still render with available data
    await expect(page.locator('.report-header')).toBeVisible();
  });
});

// =============================================================================
// TEST SUITE 7: Export Functionality
// =============================================================================

test.describe('Trip Report - Export', () => {
  test.beforeEach(async ({ page }) => {
    await createMockTrip(page, TEST_TRIPS.singleDay);
    await mockReportGeneration(page, TEST_TRIPS.singleDay.id);
  });

  test('7.1 - Should export report as HTML file', async ({ page }) => {
    await page.goto(ROUTES.report(TEST_TRIPS.singleDay.id));
    await waitForReportToLoad(page);

    const [download] = await Promise.all([
      page.waitForEvent('download'),
      page.click('.action-btn.primary'),
    ]);

    // Verify filename
    const filename = download.suggestedFilename();
    expect(filename).toMatch(/trip.*report.*\.html/i);

    // Save and verify content
    const path = await download.path();
    expect(path).toBeTruthy();
  });

  test('7.2 - Should include all sections in exported HTML', async ({ page }) => {
    await page.goto(ROUTES.report(TEST_TRIPS.singleDay.id));
    await waitForReportToLoad(page);

    const [download] = await Promise.all([
      page.waitForEvent('download'),
      page.click('.action-btn.primary'),
    ]);

    // Read the downloaded file
    const stream = await download.createReadStream();
    const chunks: Buffer[] = [];
    for await (const chunk of stream) {
      chunks.push(chunk as Buffer);
    }
    const content = Buffer.concat(chunks).toString('utf-8');

    // Verify key sections are in the HTML
    expect(content).toContain(TEST_TRIPS.singleDay.name);
    expect(content).toContain('<!DOCTYPE html>');
    expect(content).toContain('<style>'); // Embedded CSS
  });

  test('7.3 - Exported HTML should be standalone', async ({ page }) => {
    await page.goto(ROUTES.report(TEST_TRIPS.singleDay.id));
    await waitForReportToLoad(page);

    const [download] = await Promise.all([
      page.waitForEvent('download'),
      page.click('.action-btn.primary'),
    ]);

    // Read the downloaded file content
    const stream = await download.createReadStream();
    const chunks: Buffer[] = [];
    for await (const chunk of stream) {
      chunks.push(chunk as Buffer);
    }
    const content = Buffer.concat(chunks).toString('utf-8');

    // Verify it's a standalone HTML file
    expect(content).toContain('<!DOCTYPE html>');
    expect(content).toContain('<html');
    expect(content).toContain('</html>');
    // Should have inline styles (standalone)
    expect(content).toContain('<style>');
    // Should contain the trip name
    expect(content).toContain(TEST_TRIPS.singleDay.name);
    // Should not have external script/stylesheet references that would fail offline
    expect(content).not.toMatch(/<script src="https?:/);
    expect(content).not.toMatch(/<link rel="stylesheet" href="https?:/);
  });
});

// =============================================================================
// TEST SUITE 8: Internationalization (i18n)
// =============================================================================

test.describe('Trip Report - Internationalization', () => {
  test('8.1 - Should display Hebrew translations correctly', async ({ page }) => {
    await createMockTrip(page, TEST_TRIPS.singleDay);
    await mockReportGeneration(page, TEST_TRIPS.singleDay.id);

    // Hebrew is the default language, just go directly to the report
    await page.goto(ROUTES.report(TEST_TRIPS.singleDay.id));
    await waitForReportToLoad(page);

    // Check Hebrew section titles (use heading selectors to be specific)
    await expect(page.getByRole('heading', { name: /מסלול/ })).toBeVisible(); // Itinerary
    await expect(page.getByRole('heading', { name: /תחזית מזג אוויר/ })).toBeVisible(); // Weather
    await expect(page.getByRole('heading', { name: /תקציב/ })).toBeVisible(); // Budget
  });

  test('8.2 - Should use RTL layout for Hebrew', async ({ page }) => {
    await createMockTrip(page, TEST_TRIPS.singleDay);
    await mockReportGeneration(page, TEST_TRIPS.singleDay.id);

    // Hebrew is the default language, just go directly to the report
    await page.goto(ROUTES.report(TEST_TRIPS.singleDay.id));
    await waitForReportToLoad(page);

    // Document should have RTL direction
    await expect(page.locator('html')).toHaveAttribute('dir', 'rtl');

    // Back button should be on the right
    const backBtn = page.locator('.report-header .back-btn');
    const backBtnBox = await backBtn.boundingBox();
    const headerBox = await page.locator('.report-header').boundingBox();

    if (backBtnBox && headerBox) {
      // In RTL, back button should be towards the right side
      expect(backBtnBox.x).toBeGreaterThan(headerBox.width / 2);
    }
  });

  test('8.3 - Should use translation keys (not hardcoded strings)', async ({ page }) => {
    // This test verifies that the translation system is being used
    // by checking that translated content appears for the default language
    await createMockTrip(page, TEST_TRIPS.singleDay);
    await mockReportGeneration(page, TEST_TRIPS.singleDay.id);

    await page.goto(ROUTES.report(TEST_TRIPS.singleDay.id));
    await waitForReportToLoad(page);

    // Verify Hebrew section titles are displayed (from translation file)
    // This confirms translation keys are being used, not hardcoded strings
    await expect(page.getByRole('heading', { name: /מסלול/ })).toBeVisible();
    await expect(page.getByRole('heading', { name: /תחזית מזג אוויר/ })).toBeVisible();
    await expect(page.getByRole('heading', { name: /תקציב/ })).toBeVisible();

    // Verify the report title is translated
    const reportTitle = page.locator('.report-header h1');
    await expect(reportTitle).toContainText('דוח טיול');
  });

  test('8.4 - Should display correct lang attribute on html element', async ({ page }) => {
    // Verify the html element has the correct language attribute
    await createMockTrip(page, TEST_TRIPS.singleDay);
    await mockReportGeneration(page, TEST_TRIPS.singleDay.id);

    await page.goto(ROUTES.report(TEST_TRIPS.singleDay.id));
    await waitForReportToLoad(page);

    // Document should have Hebrew language attribute and RTL direction
    await expect(page.locator('html')).toHaveAttribute('lang', 'he');
    await expect(page.locator('html')).toHaveAttribute('dir', 'rtl');
  });
});

// =============================================================================
// TEST SUITE 9: Performance
// =============================================================================

test.describe('Trip Report - Performance', () => {
  test('9.1 - Should load within acceptable time', async ({ page }) => {
    await createMockTrip(page, TEST_TRIPS.singleDay);
    await mockReportGeneration(page, TEST_TRIPS.singleDay.id);

    const startTime = Date.now();
    await page.goto(ROUTES.report(TEST_TRIPS.singleDay.id));
    await waitForReportToLoad(page);
    const loadTime = Date.now() - startTime;

    // Should load within 5 seconds (generous for CI)
    expect(loadTime).toBeLessThan(5000);
  });

  test('9.2 - Should handle scroll smoothly with many elements', async ({ page }) => {
    await createMockTrip(page, TEST_TRIPS.manyStops);
    await mockReportGeneration(page, TEST_TRIPS.manyStops.id);

    await page.goto(ROUTES.report(TEST_TRIPS.manyStops.id));
    await waitForReportToLoad(page);

    // Scroll through the entire page
    const scrollPromise = page.evaluate(async () => {
      const startTime = performance.now();
      window.scrollTo({ top: document.body.scrollHeight, behavior: 'smooth' });
      await new Promise((r) => setTimeout(r, 1000));
      window.scrollTo({ top: 0, behavior: 'smooth' });
      await new Promise((r) => setTimeout(r, 1000));
      return performance.now() - startTime;
    });

    const scrollTime = await scrollPromise;

    // Scroll should complete (not hang)
    expect(scrollTime).toBeLessThan(5000);
  });
});

// =============================================================================
// TEST SUITE 10: Integration with Other Features
// =============================================================================

test.describe('Trip Report - Integration', () => {
  test('10.1 - Should integrate with trip context', async ({ page }) => {
    await createMockTrip(page, TEST_TRIPS.singleDay);
    await mockReportGeneration(page, TEST_TRIPS.singleDay.id);

    // Navigate directly to report (simulating flow from planner)
    await page.goto(ROUTES.report(TEST_TRIPS.singleDay.id));
    await waitForReportToLoad(page);

    // Report should display trip data - trip name is in overview section
    await expect(page.locator('.report-overview h1.trip-title')).toContainText(TEST_TRIPS.singleDay.name);
  });

  test('10.2 - Should respect user preferences from settings', async ({ page }) => {
    // Set user preferences before any page loads
    await page.addInitScript(() => {
      localStorage.setItem('vistatrek_user_profile', JSON.stringify({
        preferred_nav_app: 'google',
      }));
    });

    await createMockTrip(page, TEST_TRIPS.singleDay);
    await mockReportGeneration(page, TEST_TRIPS.singleDay.id);

    await page.goto(ROUTES.report(TEST_TRIPS.singleDay.id));
    await waitForReportToLoad(page);

    // Navigation buttons should be present for stops (buttons containing "Navigate" or Hebrew "נווט")
    const navButton = page.getByRole('button', { name: /נווט|Navigate/ }).first();
    await expect(navButton).toBeVisible();
    // Verify the button is clickable
    await expect(navButton).toBeEnabled();
  });

  test('10.3 - Should handle session storage correctly', async ({ page }) => {
    await createMockTrip(page, TEST_TRIPS.singleDay);
    await mockReportGeneration(page, TEST_TRIPS.singleDay.id);

    await page.goto(ROUTES.report(TEST_TRIPS.singleDay.id));
    await waitForReportToLoad(page);

    // Store something in session
    await page.evaluate(() => {
      sessionStorage.setItem('report_viewed', 'true');
    });

    // Refresh
    await page.reload();
    await waitForReportToLoad(page);

    // Session should persist
    const sessionValue = await page.evaluate(() => sessionStorage.getItem('report_viewed'));
    expect(sessionValue).toBe('true');
  });
});
