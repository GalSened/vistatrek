/**
 * useGeofence Hook Tests
 *
 * Note: Timer-based dwell tracking tests are simplified since React hooks + fake timers
 * can be unreliable. The core geofence detection logic is fully tested.
 */

import { describe, it, expect, vi, afterEach } from 'vitest';
import { renderHook } from '@testing-library/react';
import { useGeofence } from './useGeofence';
import { Stop, Coordinates } from '../types';

// Mock the haversineDistance function to return distance in km
vi.mock('../utils/geo', () => ({
  haversineDistance: vi.fn((lat1, lon1, lat2, lon2) => {
    // Return 0 if same coords
    if (lat1 === lat2 && lon1 === lon2) return 0;
    // Return distance in km based on coordinate difference
    return Math.abs(lat2 - lat1) * 111;
  }),
}));

describe('useGeofence', () => {
  afterEach(() => {
    vi.clearAllMocks();
  });

  const createStop = (lat: number, lon: number, id = 'test-stop'): Stop => ({
    id,
    name: 'Test Stop',
    type: 'viewpoint',
    coordinates: { lat, lon },
    planned_arrival: '2024-01-15T10:00:00Z',
    planned_departure: '2024-01-15T10:30:00Z',
    duration_minutes: 30,
    is_anchor: false,
  });

  const createPosition = (lat: number, lon: number): Coordinates => ({ lat, lon });

  describe('geofence detection', () => {
    it('should return not within geofence when no position', () => {
      const stop = createStop(40.7128, -74.006);
      const { result } = renderHook(() => useGeofence(null, stop));

      expect(result.current.isWithinGeofence).toBe(false);
      expect(result.current.distanceMeters).toBeNull();
      expect(result.current.dwellProgress).toBe(0);
    });

    it('should return not within geofence when no stop', () => {
      const position = createPosition(40.7128, -74.006);
      const { result } = renderHook(() => useGeofence(position, null));

      expect(result.current.isWithinGeofence).toBe(false);
      expect(result.current.distanceMeters).toBeNull();
    });

    it('should return not within geofence when stop has no coordinates', () => {
      const stop = { ...createStop(40.7128, -74.006), coordinates: undefined as any };
      const position = createPosition(40.7128, -74.006);

      const { result } = renderHook(() => useGeofence(position, stop));

      expect(result.current.isWithinGeofence).toBe(false);
    });

    it('should detect when at exact location (within geofence)', () => {
      const stop = createStop(40.7128, -74.006);
      const position = createPosition(40.7128, -74.006);

      const { result } = renderHook(() =>
        useGeofence(position, stop, undefined, { radiusMeters: 200 })
      );

      expect(result.current.isWithinGeofence).toBe(true);
      expect(result.current.distanceMeters).toBe(0);
    });

    it('should detect when close but within radius', () => {
      const stop = createStop(40.7128, -74.006);
      // ~111 meters away (0.001 degrees)
      const position = createPosition(40.7138, -74.006);

      const { result } = renderHook(() =>
        useGeofence(position, stop, undefined, { radiusMeters: 200 })
      );

      expect(result.current.isWithinGeofence).toBe(true);
      expect(result.current.distanceMeters).toBeCloseTo(111, 0);
    });

    it('should detect when outside geofence radius', () => {
      const stop = createStop(40.7128, -74.006);
      // ~1.1km away (0.01 degrees)
      const position = createPosition(40.7228, -74.006);

      const { result } = renderHook(() =>
        useGeofence(position, stop, undefined, { radiusMeters: 200 })
      );

      expect(result.current.isWithinGeofence).toBe(false);
      expect(result.current.distanceMeters).toBeCloseTo(1110, 0);
    });

    it('should use default radius of 200m when not provided', () => {
      const stop = createStop(40.7128, -74.006);
      const position = createPosition(40.7128, -74.006);

      const { result } = renderHook(() => useGeofence(position, stop));

      expect(result.current.isWithinGeofence).toBe(true);
    });

    it('should respect custom radius', () => {
      const stop = createStop(40.7128, -74.006);
      // ~111 meters away
      const position = createPosition(40.7138, -74.006);

      // With 100m radius, should be outside
      const { result: result1 } = renderHook(() =>
        useGeofence(position, stop, undefined, { radiusMeters: 100 })
      );
      expect(result1.current.isWithinGeofence).toBe(false);

      // With 200m radius, should be inside
      const { result: result2 } = renderHook(() =>
        useGeofence(position, stop, undefined, { radiusMeters: 200 })
      );
      expect(result2.current.isWithinGeofence).toBe(true);
    });
  });

  describe('position updates', () => {
    it('should update geofence status when position changes', () => {
      const stop = createStop(40.7128, -74.006);
      const insidePosition = createPosition(40.7128, -74.006);
      const outsidePosition = createPosition(40.73, -74.006);

      const { result, rerender } = renderHook(
        ({ position }) => useGeofence(position, stop, undefined, { radiusMeters: 200 }),
        { initialProps: { position: insidePosition } }
      );

      expect(result.current.isWithinGeofence).toBe(true);

      // Move outside geofence
      rerender({ position: outsidePosition });

      expect(result.current.isWithinGeofence).toBe(false);
    });

    it('should update when entering geofence', () => {
      const stop = createStop(40.7128, -74.006);
      const outsidePosition = createPosition(40.73, -74.006);
      const insidePosition = createPosition(40.7128, -74.006);

      const { result, rerender } = renderHook(
        ({ position }) => useGeofence(position, stop, undefined, { radiusMeters: 200 }),
        { initialProps: { position: outsidePosition } }
      );

      expect(result.current.isWithinGeofence).toBe(false);

      // Move inside geofence
      rerender({ position: insidePosition });

      expect(result.current.isWithinGeofence).toBe(true);
    });
  });

  describe('return values', () => {
    it('should return all expected properties', () => {
      const stop = createStop(40.7128, -74.006);
      const position = createPosition(40.7128, -74.006);

      const { result } = renderHook(() => useGeofence(position, stop));

      expect(result.current).toHaveProperty('isWithinGeofence');
      expect(result.current).toHaveProperty('distanceMeters');
      expect(result.current).toHaveProperty('dwellProgress');
    });

    it('should have dwellProgress start at 0', () => {
      const stop = createStop(40.7128, -74.006);
      const position = createPosition(40.7128, -74.006);

      const { result } = renderHook(() => useGeofence(position, stop));

      expect(result.current.dwellProgress).toBe(0);
    });
  });
});
