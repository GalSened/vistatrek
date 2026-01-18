/**
 * useWakeLock Hook Tests
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useWakeLock } from './useWakeLock';

describe('useWakeLock', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('should start inactive', () => {
    const { result } = renderHook(() => useWakeLock());
    expect(result.current.isActive).toBe(false);
  });

  it('should provide request and release functions', () => {
    const { result } = renderHook(() => useWakeLock());

    expect(typeof result.current.request).toBe('function');
    expect(typeof result.current.release).toBe('function');
  });

  it('should expose isSupported, isActive, request, and release', () => {
    const { result } = renderHook(() => useWakeLock());

    expect(result.current).toHaveProperty('isSupported');
    expect(result.current).toHaveProperty('isActive');
    expect(result.current).toHaveProperty('request');
    expect(result.current).toHaveProperty('release');
  });

  it('should handle release gracefully when not active', async () => {
    const { result } = renderHook(() => useWakeLock());

    // Should not throw
    await act(async () => {
      await result.current.release();
    });

    expect(result.current.isActive).toBe(false);
  });

  it('should report isSupported based on navigator.wakeLock', () => {
    const { result } = renderHook(() => useWakeLock());
    const hasWakeLock = typeof navigator !== 'undefined' && 'wakeLock' in navigator;
    expect(result.current.isSupported).toBe(hasWakeLock);
  });

  it('should not be active on initial render', () => {
    const { result } = renderHook(() => useWakeLock(false));
    expect(result.current.isActive).toBe(false);
  });

  it('should return boolean from request', async () => {
    const { result } = renderHook(() => useWakeLock());

    let requestResult: boolean | undefined;
    await act(async () => {
      requestResult = await result.current.request();
    });

    expect(typeof requestResult).toBe('boolean');
  });
});
