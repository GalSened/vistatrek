/**
 * usePacing Hook
 * Per PRD Section 4.4: Pacing Engine (30-second interval)
 *
 * Calculates LATE/ON_TIME/EARLY status:
 * - LATE: currentTime > plannedArrival + 15min (Red)
 * - EARLY: currentTime < plannedArrival - 15min (Green)
 * - ON_TIME: within 15 minutes (Blue)
 */

import { useState, useEffect, useMemo } from 'react';
import { Stop, PacingStatus } from '../types';

interface PacingInfo {
  status: PacingStatus;
  minutesDelta: number; // positive = late, negative = early
  suggestion?: string;
}

interface UsePacingReturn {
  pacingInfo: PacingInfo | null;
  currentTime: Date;
}

const PACING_THRESHOLD_MINUTES = 15;
const UPDATE_INTERVAL_MS = 30000; // 30 seconds per PRD

export function usePacing(currentStop: Stop | null | undefined): UsePacingReturn {
  const [currentTime, setCurrentTime] = useState(new Date());

  // Update current time every 30 seconds
  useEffect(() => {
    const interval = setInterval(() => {
      setCurrentTime(new Date());
    }, UPDATE_INTERVAL_MS);

    return () => clearInterval(interval);
  }, []);

  const pacingInfo = useMemo((): PacingInfo | null => {
    if (!currentStop?.planned_arrival) {
      return null;
    }

    const plannedArrival = new Date(currentStop.planned_arrival);
    const deltaMs = currentTime.getTime() - plannedArrival.getTime();
    const minutesDelta = Math.round(deltaMs / (1000 * 60));

    let status: PacingStatus;
    let suggestion: string | undefined;

    if (minutesDelta > PACING_THRESHOLD_MINUTES) {
      status = 'late';
      suggestion = 'Consider skipping a stop to get back on schedule';
    } else if (minutesDelta < -PACING_THRESHOLD_MINUTES) {
      status = 'early';
      suggestion = 'You have time! Consider adding a viewpoint';
    } else {
      status = 'on_time';
    }

    return {
      status,
      minutesDelta,
      suggestion,
    };
  }, [currentStop?.planned_arrival, currentTime]);

  return {
    pacingInfo,
    currentTime,
  };
}

/**
 * Calculate time remaining until planned arrival
 */
export function formatTimeRemaining(currentTime: Date, plannedArrival: string): string {
  const planned = new Date(plannedArrival);
  const deltaMs = planned.getTime() - currentTime.getTime();

  if (deltaMs <= 0) {
    const lateMinutes = Math.abs(Math.round(deltaMs / (1000 * 60)));
    return `${lateMinutes} min late`;
  }

  const minutes = Math.round(deltaMs / (1000 * 60));
  if (minutes < 60) {
    return `in ${minutes} min`;
  }

  const hours = Math.floor(minutes / 60);
  const remainingMins = minutes % 60;
  return remainingMins > 0 ? `in ${hours}h ${remainingMins}m` : `in ${hours}h`;
}

/**
 * Format time for display
 */
export function formatTime(dateStr: string | undefined): string {
  if (!dateStr) return '--:--';

  try {
    const date = new Date(dateStr);
    if (isNaN(date.getTime())) {
      return '--:--';
    }
    return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  } catch {
    return '--:--';
  }
}
