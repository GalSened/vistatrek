/**
 * useGeofence Hook
 * Per PRD Section 3.3: Geofence arrival detection (200m radius)
 */

import { useState, useEffect, useCallback, useRef } from 'react';
import { Coordinates, Stop } from '../types';
import { haversineDistance } from '../utils/geo';

interface GeofenceOptions {
  radiusMeters?: number;
  dwellTimeMs?: number; // How long user must be in geofence before triggering
}

interface UseGeofenceReturn {
  isWithinGeofence: boolean;
  distanceMeters: number | null;
  dwellProgress: number; // 0-100, progress toward dwell time completion
}

const DEFAULT_RADIUS_METERS = 200;
const DEFAULT_DWELL_TIME_MS = 5000; // 5 seconds of being within fence

export function useGeofence(
  currentPosition: Coordinates | null,
  targetStop: Stop | null | undefined,
  onArrival?: () => void,
  options: GeofenceOptions = {}
): UseGeofenceReturn {
  const {
    radiusMeters = DEFAULT_RADIUS_METERS,
    dwellTimeMs = DEFAULT_DWELL_TIME_MS,
  } = options;

  const [isWithinGeofence, setIsWithinGeofence] = useState(false);
  const [distanceMeters, setDistanceMeters] = useState<number | null>(null);
  const [dwellProgress, setDwellProgress] = useState(0);

  const dwellStartRef = useRef<number | null>(null);
  const hasTriggeredRef = useRef(false);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const resetDwell = useCallback(() => {
    dwellStartRef.current = null;
    setDwellProgress(0);
    if (intervalRef.current) {
      clearInterval(intervalRef.current);
      intervalRef.current = null;
    }
  }, []);

  useEffect(() => {
    if (!currentPosition || !targetStop?.coordinates) {
      setIsWithinGeofence(false);
      setDistanceMeters(null);
      resetDwell();
      return;
    }

    // Calculate distance to target
    const distance = haversineDistance(
      currentPosition.lat,
      currentPosition.lon,
      targetStop.coordinates.lat,
      targetStop.coordinates.lon
    );

    // Convert km to meters
    const distM = distance * 1000;
    setDistanceMeters(distM);

    const withinFence = distM <= radiusMeters;
    setIsWithinGeofence(withinFence);

    if (withinFence && !hasTriggeredRef.current) {
      // Start or continue dwell timer
      if (!dwellStartRef.current) {
        dwellStartRef.current = Date.now();

        // Update progress every 100ms
        intervalRef.current = setInterval(() => {
          const elapsed = Date.now() - (dwellStartRef.current || Date.now());
          const progress = Math.min(100, (elapsed / dwellTimeMs) * 100);
          setDwellProgress(progress);

          if (elapsed >= dwellTimeMs && !hasTriggeredRef.current) {
            hasTriggeredRef.current = true;
            onArrival?.();
            if (intervalRef.current) {
              clearInterval(intervalRef.current);
            }
          }
        }, 100);
      }
    } else if (!withinFence) {
      // Left geofence, reset dwell
      resetDwell();
    }

    return () => {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
      }
    };
  }, [currentPosition, targetStop, radiusMeters, dwellTimeMs, onArrival, resetDwell]);

  // Reset triggered flag when target changes
  useEffect(() => {
    hasTriggeredRef.current = false;
    resetDwell();
  }, [targetStop?.id, resetDwell]);

  return {
    isWithinGeofence,
    distanceMeters,
    dwellProgress,
  };
}
