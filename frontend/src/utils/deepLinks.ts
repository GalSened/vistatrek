/**
 * Deep Links Generator
 * Per PRD: Generate navigation app links (Waze, Google Maps, Apple Maps)
 */

import { Coordinates, NavApp } from '../types';

/**
 * Generate a navigation deep link for the given app
 */
export function generateNavLink(
  destination: Coordinates,
  app: NavApp,
  name?: string
): string {
  const { lat, lon } = destination;
  const encodedName = name ? encodeURIComponent(name) : '';

  switch (app) {
    case 'waze':
      // Waze deep link format
      return `https://waze.com/ul?ll=${lat},${lon}&navigate=yes`;

    case 'google':
      // Google Maps deep link format
      const googleParams = new URLSearchParams({
        api: '1',
        destination: `${lat},${lon}`,
      });
      if (name) {
        googleParams.set('destination_place_id', encodedName);
      }
      return `https://www.google.com/maps/dir/?${googleParams.toString()}`;

    case 'apple':
      // Apple Maps deep link format
      const appleParams = new URLSearchParams({
        daddr: `${lat},${lon}`,
        dirflg: 'd', // driving
      });
      if (name) {
        appleParams.set('q', name);
      }
      return `https://maps.apple.com/?${appleParams.toString()}`;

    default:
      // Fallback to Google Maps
      return `https://www.google.com/maps/dir/?api=1&destination=${lat},${lon}`;
  }
}

/**
 * Generate a navigation link with waypoints
 * Note: Only Google Maps supports waypoints in deep links
 */
export function generateNavLinkWithWaypoints(
  origin: Coordinates,
  destination: Coordinates,
  waypoints: Coordinates[],
  app: NavApp,
  destinationName?: string
): string {
  if (waypoints.length === 0) {
    return generateNavLink(destination, app, destinationName);
  }

  // Only Google Maps supports waypoints
  if (app === 'google') {
    const waypointsStr = waypoints
      .map((wp) => `${wp.lat},${wp.lon}`)
      .join('|');

    const params = new URLSearchParams({
      api: '1',
      origin: `${origin.lat},${origin.lon}`,
      destination: `${destination.lat},${destination.lon}`,
      waypoints: waypointsStr,
      travelmode: 'driving',
    });

    return `https://www.google.com/maps/dir/?${params.toString()}`;
  }

  // For other apps, just navigate to destination
  return generateNavLink(destination, app, destinationName);
}

/**
 * Open navigation in the appropriate app
 */
export function openNavigation(
  destination: Coordinates,
  app: NavApp,
  name?: string
): void {
  const url = generateNavLink(destination, app, name);
  window.open(url, '_blank');
}

/**
 * Check if the device likely supports a specific nav app
 */
export function isNavAppAvailable(app: NavApp): boolean {
  const userAgent = navigator.userAgent.toLowerCase();
  const isIOS = /iphone|ipad|ipod/.test(userAgent);
  const isAndroid = /android/.test(userAgent);

  switch (app) {
    case 'apple':
      return isIOS;
    case 'waze':
    case 'google':
      return isIOS || isAndroid;
    default:
      return true;
  }
}
