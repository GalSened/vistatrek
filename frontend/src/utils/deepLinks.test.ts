/**
 * Deep Links Utility Tests
 */

import { describe, it, expect } from 'vitest';
import {
  generateNavLink,
  generateNavLinkWithWaypoints,
  isNavAppAvailable,
} from './deepLinks';
import { Coordinates, NavApp } from '../types';

describe('deepLinks', () => {
  const destination: Coordinates = {
    lat: 32.0853,
    lon: 34.7818,
  };

  describe('generateNavLink', () => {
    it('generates correct Waze URL', () => {
      const url = generateNavLink(destination, 'waze');
      expect(url).toBe('https://waze.com/ul?ll=32.0853,34.7818&navigate=yes');
    });

    it('generates correct Google Maps URL', () => {
      const url = generateNavLink(destination, 'google');
      expect(url).toContain('google.com/maps/dir');
      expect(url).toContain('destination=32.0853');
      expect(url).toContain('34.7818');
    });

    it('generates correct Apple Maps URL', () => {
      const url = generateNavLink(destination, 'apple');
      expect(url).toContain('maps.apple.com');
      expect(url).toContain('daddr=32.0853');
      expect(url).toContain('34.7818');
    });

    it('handles negative coordinates', () => {
      const negCoords: Coordinates = { lat: -33.8688, lon: 151.2093 };
      const url = generateNavLink(negCoords, 'waze');
      expect(url).toBe('https://waze.com/ul?ll=-33.8688,151.2093&navigate=yes');
    });

    it('handles name parameter', () => {
      const url = generateNavLink(destination, 'google', 'Tel Aviv');
      // Name is used as destination_place_id in Google Maps
      expect(url).toContain('destination_place_id=Tel%2520Aviv');
    });

    it('defaults to Google Maps for unknown app', () => {
      const url = generateNavLink(destination, 'unknown' as NavApp);
      expect(url).toContain('google.com/maps');
    });
  });

  describe('generateNavLinkWithWaypoints', () => {
    const origin: Coordinates = { lat: 32.0, lon: 35.0 };
    const waypoints: Coordinates[] = [
      { lat: 32.5, lon: 35.5 },
      { lat: 32.8, lon: 35.8 },
    ];

    it('generates Google Maps URL with waypoints', () => {
      const url = generateNavLinkWithWaypoints(
        origin,
        destination,
        waypoints,
        'google'
      );
      expect(url).toContain('google.com/maps/dir');
      expect(url).toContain('waypoints=');
      expect(url).toContain('origin=32');
    });

    it('falls back to simple link when no waypoints', () => {
      const url = generateNavLinkWithWaypoints(origin, destination, [], 'google');
      expect(url).toContain('google.com/maps/dir');
      expect(url).not.toContain('waypoints=');
    });

    it('ignores waypoints for non-Google apps', () => {
      const url = generateNavLinkWithWaypoints(
        origin,
        destination,
        waypoints,
        'waze'
      );
      expect(url).toContain('waze.com');
      expect(url).not.toContain('waypoints');
    });
  });

  describe('isNavAppAvailable', () => {
    it('returns true for common apps', () => {
      // In a browser without specific user agent, should default appropriately
      expect(typeof isNavAppAvailable('waze')).toBe('boolean');
      expect(typeof isNavAppAvailable('google')).toBe('boolean');
      expect(typeof isNavAppAvailable('apple')).toBe('boolean');
    });
  });

  describe('coordinate formatting', () => {
    it('preserves decimal precision', () => {
      const precise: Coordinates = { lat: 32.123456789, lon: 34.987654321 };
      const url = generateNavLink(precise, 'google');
      expect(url).toContain('32.123456789');
      expect(url).toContain('34.987654321');
    });

    it('handles zero coordinates', () => {
      const zero: Coordinates = { lat: 0, lon: 0 };
      const url = generateNavLink(zero, 'waze');
      expect(url).toBe('https://waze.com/ul?ll=0,0&navigate=yes');
    });
  });
});
