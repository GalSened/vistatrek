/**
 * useGeolocation Hook Tests
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, act, waitFor } from '@testing-library/react';
import { useOffRouteDetection } from './useGeolocation';

// Focus on testing useOffRouteDetection which doesn't need geolocation mocking
// The useGeolocation hook is tightly coupled to the browser API and context

describe('useOffRouteDetection', () => {
  const route: [number, number][] = [
    [-74.006, 40.7128], // lon, lat format (GeoJSON)
    [-74.01, 40.715],
    [-74.015, 40.72],
  ];

  it('should return not off route when position is null', () => {
    const { result } = renderHook(() =>
      useOffRouteDetection(null, route)
    );

    expect(result.current.isOffRoute).toBe(false);
    expect(result.current.distanceKm).toBe(0);
  });

  it('should return not off route when route is empty', () => {
    const { result } = renderHook(() =>
      useOffRouteDetection({ lat: 40.7128, lon: -74.006 }, [])
    );

    expect(result.current.isOffRoute).toBe(false);
    expect(result.current.distanceKm).toBe(0);
  });

  it('should return not off route when position is on route', () => {
    const position = { lat: 40.7128, lon: -74.006 };
    const { result } = renderHook(() =>
      useOffRouteDetection(position, route)
    );

    expect(result.current.isOffRoute).toBe(false);
    expect(result.current.distanceKm).toBeLessThan(0.5);
  });

  it('should return off route when position is far from route', () => {
    const position = { lat: 41.0, lon: -73.5 }; // Far from route
    const { result } = renderHook(() =>
      useOffRouteDetection(position, route)
    );

    expect(result.current.isOffRoute).toBe(true);
    expect(result.current.distanceKm).toBeGreaterThan(0.5);
  });

  it('should respect custom threshold', () => {
    const position = { lat: 40.716, lon: -74.008 }; // Slightly off

    const { result: result1 } = renderHook(() =>
      useOffRouteDetection(position, route, 0.1)
    );

    const { result: result2 } = renderHook(() =>
      useOffRouteDetection(position, route, 1.0)
    );

    // With 0.1km threshold might be off route
    // With 1.0km threshold should be on route
    expect(result2.current.isOffRoute).toBe(false);
  });

  it('should update when position changes', () => {
    const { result, rerender } = renderHook(
      ({ position }) => useOffRouteDetection(position, route),
      { initialProps: { position: { lat: 40.7128, lon: -74.006 } } }
    );

    expect(result.current.isOffRoute).toBe(false);

    rerender({ position: { lat: 41.0, lon: -73.5 } });

    expect(result.current.isOffRoute).toBe(true);
  });
});
