/**
 * usePacing Hook Tests
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { usePacing, formatTime, formatTimeRemaining } from './usePacing';
import { Stop } from '../types';

describe('usePacing', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  const createStop = (plannedArrival: string): Stop => ({
    id: 'test-stop',
    name: 'Test Stop',
    type: 'viewpoint',
    coordinates: { lat: 40.7128, lon: -74.006 },
    planned_arrival: plannedArrival,
    planned_departure: plannedArrival,
    duration_minutes: 30,
    is_anchor: false,
  });

  it('should return null when no stop is provided', () => {
    const { result } = renderHook(() => usePacing(null));
    expect(result.current.pacingInfo).toBeNull();
  });

  it('should return null when stop has no planned arrival', () => {
    const stop = { ...createStop(''), planned_arrival: '' };
    const { result } = renderHook(() => usePacing(stop));
    expect(result.current.pacingInfo).toBeNull();
  });

  it('should return on_time status when within 15 minutes', () => {
    const now = new Date('2024-01-15T10:00:00Z');
    vi.setSystemTime(now);

    // Planned arrival 5 minutes from now
    const stop = createStop('2024-01-15T10:05:00Z');
    const { result } = renderHook(() => usePacing(stop));

    expect(result.current.pacingInfo?.status).toBe('on_time');
    expect(result.current.pacingInfo?.minutesDelta).toBe(-5);
    expect(result.current.pacingInfo?.suggestion).toBeUndefined();
  });

  it('should return early status when more than 15 minutes ahead', () => {
    const now = new Date('2024-01-15T10:00:00Z');
    vi.setSystemTime(now);

    // Planned arrival 30 minutes from now (20+ min early)
    const stop = createStop('2024-01-15T10:30:00Z');
    const { result } = renderHook(() => usePacing(stop));

    expect(result.current.pacingInfo?.status).toBe('early');
    expect(result.current.pacingInfo?.minutesDelta).toBe(-30);
    expect(result.current.pacingInfo?.suggestion).toContain('time');
  });

  it('should return late status when more than 15 minutes behind', () => {
    const now = new Date('2024-01-15T10:30:00Z');
    vi.setSystemTime(now);

    // Planned arrival was 30 minutes ago
    const stop = createStop('2024-01-15T10:00:00Z');
    const { result } = renderHook(() => usePacing(stop));

    expect(result.current.pacingInfo?.status).toBe('late');
    expect(result.current.pacingInfo?.minutesDelta).toBe(30);
    expect(result.current.pacingInfo?.suggestion).toContain('skip');
  });

  it('should update every 30 seconds', () => {
    const now = new Date('2024-01-15T10:00:00Z');
    vi.setSystemTime(now);

    const stop = createStop('2024-01-15T10:15:00Z');
    const { result } = renderHook(() => usePacing(stop));

    const initialTime = result.current.currentTime;

    // Advance 30 seconds
    act(() => {
      vi.advanceTimersByTime(30000);
    });

    expect(result.current.currentTime.getTime()).toBeGreaterThan(initialTime.getTime());
  });

  it('should provide current time', () => {
    const now = new Date('2024-01-15T10:00:00Z');
    vi.setSystemTime(now);

    const stop = createStop('2024-01-15T10:15:00Z');
    const { result } = renderHook(() => usePacing(stop));

    expect(result.current.currentTime).toBeInstanceOf(Date);
  });
});

describe('formatTime', () => {
  it('should return --:-- for undefined input', () => {
    expect(formatTime(undefined)).toBe('--:--');
  });

  it('should return --:-- for empty string', () => {
    expect(formatTime('')).toBe('--:--');
  });

  it('should format valid date string', () => {
    const result = formatTime('2024-01-15T10:30:00Z');
    // Format depends on locale, just check it's not the fallback
    expect(result).not.toBe('--:--');
    expect(result).toMatch(/\d/);
  });

  it('should return --:-- for invalid date string', () => {
    expect(formatTime('not-a-date')).toBe('--:--');
  });
});

describe('formatTimeRemaining', () => {
  it('should show late status when past planned time', () => {
    const currentTime = new Date('2024-01-15T10:30:00Z');
    const result = formatTimeRemaining(currentTime, '2024-01-15T10:00:00Z');
    expect(result).toContain('late');
    expect(result).toContain('30');
  });

  it('should show minutes when less than an hour', () => {
    const currentTime = new Date('2024-01-15T10:00:00Z');
    const result = formatTimeRemaining(currentTime, '2024-01-15T10:30:00Z');
    expect(result).toBe('in 30 min');
  });

  it('should show hours and minutes when more than an hour', () => {
    const currentTime = new Date('2024-01-15T10:00:00Z');
    const result = formatTimeRemaining(currentTime, '2024-01-15T11:30:00Z');
    expect(result).toBe('in 1h 30m');
  });

  it('should show only hours when exactly on the hour', () => {
    const currentTime = new Date('2024-01-15T10:00:00Z');
    const result = formatTimeRemaining(currentTime, '2024-01-15T12:00:00Z');
    expect(result).toBe('in 2h');
  });
});
