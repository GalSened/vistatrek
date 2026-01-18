/**
 * Geolocation Hook
 * Per PRD: Real-time GPS tracking for Pilot mode
 */

import { useState, useEffect, useCallback } from 'react';
import { Coordinates, GeolocationState } from '../types';
import { useUser } from '../context/UserContext';

const POSITION_OPTIONS: PositionOptions = {
  enableHighAccuracy: true,
  timeout: 10000,
  maximumAge: 5000,
};

export function useGeolocation(): GeolocationState & {
  startTracking: () => void;
  stopTracking: () => void;
} {
  const { settings } = useUser();
  const [state, setState] = useState<GeolocationState>({
    position: null,
    accuracy: null,
    timestamp: null,
    error: null,
    isTracking: false,
  });

  const [watchId, setWatchId] = useState<number | null>(null);

  const handleSuccess = useCallback((geoPosition: GeolocationPosition) => {
    setState((prev) => ({
      ...prev,
      position: {
        lat: geoPosition.coords.latitude,
        lon: geoPosition.coords.longitude,
      },
      accuracy: geoPosition.coords.accuracy,
      timestamp: geoPosition.timestamp,
      error: null,
    }));
  }, []);

  const handleError = useCallback((error: GeolocationPositionError) => {
    setState((prev) => ({
      ...prev,
      error,
    }));
  }, []);

  const startTracking = useCallback(() => {
    if (!navigator.geolocation) {
      setState((prev) => ({
        ...prev,
        error: {
          code: 2,
          message: 'Geolocation is not supported',
          PERMISSION_DENIED: 1,
          POSITION_UNAVAILABLE: 2,
          TIMEOUT: 3,
        } as GeolocationPositionError,
      }));
      return;
    }

    const id = navigator.geolocation.watchPosition(
      handleSuccess,
      handleError,
      POSITION_OPTIONS
    );

    setWatchId(id);
    setState((prev) => ({ ...prev, isTracking: true }));
  }, [handleSuccess, handleError]);

  const stopTracking = useCallback(() => {
    if (watchId !== null) {
      navigator.geolocation.clearWatch(watchId);
      setWatchId(null);
    }
    setState((prev) => ({ ...prev, isTracking: false }));
  }, [watchId]);

  // Auto-start tracking if settings allow
  useEffect(() => {
    if (settings.gps_tracking && !state.isTracking && watchId === null) {
      startTracking();
    }

    return () => {
      if (watchId !== null) {
        navigator.geolocation.clearWatch(watchId);
      }
    };
  }, [settings.gps_tracking, state.isTracking, watchId, startTracking]);

  return {
    ...state,
    startTracking,
    stopTracking,
  };
}

/**
 * Check if user is off-route
 */
export function useOffRouteDetection(
  position: Coordinates | null,
  route: [number, number][],
  thresholdKm: number = 0.5
): { isOffRoute: boolean; distanceKm: number } {
  const [state, setState] = useState({ isOffRoute: false, distanceKm: 0 });

  useEffect(() => {
    if (!position || route.length === 0) {
      setState({ isOffRoute: false, distanceKm: 0 });
      return;
    }

    // Find minimum distance to any route point
    let minDist = Infinity;
    for (const [lon, lat] of route) {
      const dist = haversineDistance(position, { lat, lon });
      if (dist < minDist) {
        minDist = dist;
      }
    }

    const distanceKm = minDist / 1000;
    setState({
      isOffRoute: distanceKm > thresholdKm,
      distanceKm,
    });
  }, [position, route, thresholdKm]);

  return state;
}

/**
 * Calculate distance between two coordinates (Haversine formula)
 */
function haversineDistance(c1: Coordinates, c2: Coordinates): number {
  const R = 6371000; // Earth radius in meters
  const lat1 = (c1.lat * Math.PI) / 180;
  const lat2 = (c2.lat * Math.PI) / 180;
  const dLat = ((c2.lat - c1.lat) * Math.PI) / 180;
  const dLon = ((c2.lon - c1.lon) * Math.PI) / 180;

  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLon / 2) * Math.sin(dLon / 2);

  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}
