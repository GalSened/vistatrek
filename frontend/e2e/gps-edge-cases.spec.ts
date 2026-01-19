/**
 * VistaTrek GPS Edge Case Tests
 * Per Test Plan: EC-GPS-01 (GPS jitter), EC-GPS-02 (Tunnel simulation)
 */

import { test, expect } from '@playwright/test';
import { GPS_JITTER_POSITIONS, LOCATIONS } from './fixtures/test-data';

// Skip onboarding modal by setting localStorage before each test
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

test.describe('GPS Edge Cases', () => {
  /**
   * EC-GPS-01: GPS Jitter
   * Simulate rapid location changes and verify app handles gracefully
   */
  test('EC-GPS-01: Handles GPS jitter gracefully', async ({ page, context }) => {
    await page.goto('/');

    // Simulate GPS jitter by rapidly changing location
    for (const position of GPS_JITTER_POSITIONS) {
      await context.setGeolocation(position);
      await page.waitForTimeout(100); // Small delay between updates
    }

    // App should still be functional
    await expect(page.locator('h1')).toContainText('VistaTrek');
    await expect(page.locator('.create-trip-section')).toBeVisible();

    // No error should be displayed
    const errorMessage = page.locator('.error-message');
    await expect(errorMessage).not.toBeVisible();
  });

  /**
   * EC-GPS-02: Tunnel Simulation
   * Simulate GPS signal loss and recovery
   */
  test('EC-GPS-02: Handles GPS signal loss (tunnel)', async ({
    page,
    context,
  }) => {
    // Start with GPS enabled
    await context.setGeolocation({
      latitude: LOCATIONS.TEL_AVIV.lat,
      longitude: LOCATIONS.TEL_AVIV.lon,
    });

    await page.goto('/');
    await expect(page.locator('.home-page')).toBeVisible();

    // Simulate entering tunnel (clear geolocation permissions)
    await context.clearPermissions();

    // App should still be usable
    await expect(page.locator('h1')).toContainText('VistaTrek');
    await expect(page.locator('.create-trip-section')).toBeVisible();

    // Re-grant permissions (exiting tunnel)
    await context.grantPermissions(['geolocation']);
    await context.setGeolocation({
      latitude: LOCATIONS.TEL_AVIV.lat,
      longitude: LOCATIONS.TEL_AVIV.lon,
    });

    // App should recover
    await expect(page.locator('.home-page')).toBeVisible();
  });

  /**
   * Additional GPS edge case: Location updates while navigating
   */
  test('GPS updates during page navigation', async ({ page, context }) => {
    // Start in Tel Aviv
    await context.setGeolocation({
      latitude: LOCATIONS.TEL_AVIV.lat,
      longitude: LOCATIONS.TEL_AVIV.lon,
    });

    await page.goto('/');

    // Navigate to settings
    await page.click('[aria-label="Settings"]');
    await expect(page).toHaveURL(/\/settings/);

    // Update location while on settings page
    await context.setGeolocation({
      latitude: LOCATIONS.JERUSALEM.lat,
      longitude: LOCATIONS.JERUSALEM.lon,
    });

    // Go back to home
    await page.goBack();
    await expect(page).toHaveURL('/');

    // App should still work
    await expect(page.locator('.create-trip-section')).toBeVisible();
  });

  /**
   * Geolocation accuracy edge case
   */
  test('Handles low accuracy GPS', async ({ page, context }) => {
    // Set geolocation with low accuracy (high accuracy value = less accurate)
    await context.setGeolocation({
      latitude: LOCATIONS.TEL_AVIV.lat,
      longitude: LOCATIONS.TEL_AVIV.lon,
      accuracy: 1000, // 1km accuracy - very low
    });

    await page.goto('/');

    // App should still function
    await expect(page.locator('h1')).toContainText('VistaTrek');
    await expect(page.locator('.create-trip-section')).toBeVisible();
  });
});

test.describe('GPS Permission Edge Cases', () => {
  /**
   * User denies GPS permission
   */
  test('Handles denied GPS permission gracefully', async ({ page, context }) => {
    // Don't grant geolocation permission
    await context.clearPermissions();

    await page.goto('/');

    // App should still load
    await expect(page.locator('h1')).toContainText('VistaTrek');

    // Manual location entry should still work
    const startInput = page.locator('input[placeholder*="starting"]');
    await expect(startInput).toBeVisible();
  });
});
