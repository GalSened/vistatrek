/**
 * useWakeLock Hook
 * Per PRD: Keep screen on during Pilot Mode
 */

import { useState, useEffect, useCallback, useRef } from 'react';

interface WakeLockSentinel {
  released: boolean;
  type: 'screen';
  release(): Promise<void>;
  addEventListener(type: 'release', listener: () => void): void;
  removeEventListener(type: 'release', listener: () => void): void;
}

interface NavigatorWithWakeLock {
  wakeLock?: {
    request(type: 'screen'): Promise<WakeLockSentinel>;
  };
}

interface UseWakeLockReturn {
  isSupported: boolean;
  isActive: boolean;
  request: () => Promise<boolean>;
  release: () => Promise<void>;
}

export function useWakeLock(autoActivate = false): UseWakeLockReturn {
  const [isSupported] = useState(() =>
    typeof navigator !== 'undefined' &&
    'wakeLock' in navigator
  );
  const [isActive, setIsActive] = useState(false);
  const wakeLockRef = useRef<WakeLockSentinel | null>(null);

  const request = useCallback(async (): Promise<boolean> => {
    if (!isSupported) {
      console.warn('Wake Lock API not supported');
      return false;
    }

    try {
      const nav = navigator as NavigatorWithWakeLock;
      wakeLockRef.current = await nav.wakeLock!.request('screen');
      setIsActive(true);

      wakeLockRef.current.addEventListener('release', () => {
        setIsActive(false);
        wakeLockRef.current = null;
      });

      return true;
    } catch (err) {
      console.warn('Wake Lock request failed:', err);
      setIsActive(false);
      return false;
    }
  }, [isSupported]);

  const release = useCallback(async (): Promise<void> => {
    if (wakeLockRef.current) {
      try {
        await wakeLockRef.current.release();
        wakeLockRef.current = null;
        setIsActive(false);
      } catch (err) {
        console.warn('Wake Lock release failed:', err);
      }
    }
  }, []);

  // Re-acquire wake lock when page becomes visible again
  useEffect(() => {
    const handleVisibilityChange = async () => {
      if (document.visibilityState === 'visible' && isActive && !wakeLockRef.current) {
        await request();
      }
    };

    document.addEventListener('visibilitychange', handleVisibilityChange);
    return () => document.removeEventListener('visibilitychange', handleVisibilityChange);
  }, [isActive, request]);

  // Auto-activate if requested
  useEffect(() => {
    if (autoActivate && isSupported) {
      request();
    }

    return () => {
      release();
    };
  }, [autoActivate, isSupported, request, release]);

  return {
    isSupported,
    isActive,
    request,
    release,
  };
}
