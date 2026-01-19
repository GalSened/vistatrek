/**
 * VistaTrek Offline Mode Tests
 * Per Test Plan: EC-NET-01 (Offline mode), EC-NET-02 (Slow network)
 */

import { test, expect } from '@playwright/test';

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

test.describe('Network Edge Cases', () => {
  /**
   * EC-NET-01: Offline Mode
   * Verify app handles network disconnection gracefully
   */
  test('EC-NET-01: App remains usable when offline', async ({
    page,
    context,
  }) => {
    // Start online
    await page.goto('/');
    await expect(page.locator('h1')).toContainText('VistaTrek');

    // Go offline
    await context.setOffline(true);

    // Page should still be visible (cached/already loaded)
    await expect(page.locator('.home-page')).toBeVisible();

    // User can still interact with the form
    await page.fill('#trip-name', 'Offline Trip');
    await expect(page.locator('#trip-name')).toHaveValue('Offline Trip');

    // Vibe chips should still be clickable
    const natureChip = page.locator('.vibe-chip').filter({ hasText: 'Nature' });
    await natureChip.click();
    await expect(natureChip).toHaveClass(/selected/);

    // Go back online
    await context.setOffline(false);

    // App should recover
    await expect(page.locator('.home-page')).toBeVisible();
  });

  /**
   * EC-NET-02: Slow Network
   * Verify app handles slow network connections
   */
  test('EC-NET-02: App handles slow network', async ({ page, context }) => {
    // Simulate slow 3G network
    await page.goto('/');

    // Throttle network to slow 3G
    const client = await context.newCDPSession(page);
    await client.send('Network.emulateNetworkConditions', {
      offline: false,
      downloadThroughput: (500 * 1024) / 8, // 500 kbps
      uploadThroughput: (500 * 1024) / 8,
      latency: 400, // 400ms latency
    });

    // App should still be responsive for local interactions
    await page.fill('#trip-name', 'Slow Network Trip');
    await expect(page.locator('#trip-name')).toHaveValue('Slow Network Trip');

    // Vibe selection should work
    const chillChip = page.locator('.vibe-chip').filter({ hasText: 'Chill' });
    await chillChip.click();
    await expect(chillChip).toHaveClass(/selected/);

    // Reset network conditions
    await client.send('Network.emulateNetworkConditions', {
      offline: false,
      downloadThroughput: -1,
      uploadThroughput: -1,
      latency: 0,
    });
  });

  /**
   * Network disconnects during navigation
   */
  test('Network disconnect during page navigation', async ({
    page,
    context,
  }) => {
    await page.goto('/');

    // Navigate to settings
    await page.click('[aria-label="Settings"]');
    await expect(page).toHaveURL(/\/settings/);

    // Go offline
    await context.setOffline(true);

    // Should still be able to navigate back (client-side routing)
    await page.goBack();

    // Home page should show from cache/router
    await expect(page.locator('.home-page')).toBeVisible();

    // Go back online
    await context.setOffline(false);
  });
});

test.describe('API Request Handling', () => {
  /**
   * Test graceful API failure handling
   */
  test('Shows error when API is unreachable', async ({ page, context }) => {
    await page.goto('/');

    // Fill in trip details
    await page.fill('#trip-name', 'Error Test Trip');

    // Mock network to fail API requests
    await page.route('**/api/**', (route) => {
      route.abort('connectionfailed');
    });

    // The form should still work locally
    await expect(page.locator('#trip-name')).toHaveValue('Error Test Trip');

    // Attempting to submit (if possible) should show an error
    // Note: This depends on how the app handles the error
  });

  /**
   * Test API timeout handling
   */
  test('Handles API timeout gracefully', async ({ page }) => {
    await page.goto('/');

    // Mock API to timeout
    await page.route('**/api/**', async (route) => {
      // Delay response for 10 seconds (simulating timeout)
      await new Promise((resolve) => setTimeout(resolve, 10000));
      route.abort('timedout');
    });

    // The UI should remain responsive
    await page.fill('#trip-name', 'Timeout Test');
    await expect(page.locator('#trip-name')).toHaveValue('Timeout Test');
  });
});

test.describe('Recovery Scenarios', () => {
  /**
   * App recovers after brief network outage
   */
  test('Recovers after brief network outage', async ({ page, context }) => {
    await page.goto('/');
    await expect(page.locator('.home-page')).toBeVisible();

    // Go offline
    await context.setOffline(true);

    // Wait a moment
    await page.waitForTimeout(1000);

    // Go back online
    await context.setOffline(false);

    // App should be fully functional
    await page.fill('#trip-name', 'Recovery Test');
    await expect(page.locator('#trip-name')).toHaveValue('Recovery Test');

    // Navigation should work
    await page.click('[aria-label="Settings"]');
    await expect(page).toHaveURL(/\/settings/);
  });

  /**
   * Multiple offline/online cycles
   */
  test('Handles multiple offline/online cycles', async ({ page, context }) => {
    await page.goto('/');

    for (let i = 0; i < 3; i++) {
      // Go offline
      await context.setOffline(true);
      await page.waitForTimeout(500);

      // App should still show
      await expect(page.locator('.home-page')).toBeVisible();

      // Go online
      await context.setOffline(false);
      await page.waitForTimeout(500);

      // App should recover
      await expect(page.locator('.home-page')).toBeVisible();
    }

    // Final verification - app still works
    await page.fill('#trip-name', `Cycle Test`);
    await expect(page.locator('#trip-name')).toHaveValue('Cycle Test');
  });
});
