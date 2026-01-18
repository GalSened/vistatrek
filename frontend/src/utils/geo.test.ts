/**
 * Geo Utilities Tests
 */

import { describe, it, expect } from 'vitest';
import { haversineDistance, formatDistance, calculateBearing } from './geo';

describe('haversineDistance', () => {
  it('should return 0 for same coordinates', () => {
    const distance = haversineDistance(40.7128, -74.006, 40.7128, -74.006);
    expect(distance).toBe(0);
  });

  it('should calculate distance between NYC and LA correctly', () => {
    // NYC: 40.7128, -74.0060
    // LA: 34.0522, -118.2437
    // Known distance: ~3940 km
    const distance = haversineDistance(40.7128, -74.006, 34.0522, -118.2437);
    expect(distance).toBeGreaterThan(3900);
    expect(distance).toBeLessThan(4000);
  });

  it('should calculate short distances accurately', () => {
    // Two points ~1km apart
    // Approx 0.009 degrees latitude = 1km
    const distance = haversineDistance(40.7128, -74.006, 40.7218, -74.006);
    expect(distance).toBeGreaterThan(0.9);
    expect(distance).toBeLessThan(1.1);
  });

  it('should handle equator crossings', () => {
    const distance = haversineDistance(1, 0, -1, 0);
    // ~222 km
    expect(distance).toBeGreaterThan(200);
    expect(distance).toBeLessThan(250);
  });

  it('should handle international date line', () => {
    const distance = haversineDistance(0, 179, 0, -179);
    // ~222 km (crossing at equator)
    expect(distance).toBeGreaterThan(200);
    expect(distance).toBeLessThan(250);
  });
});

describe('formatDistance', () => {
  it('should format meters under 1000', () => {
    expect(formatDistance(50)).toBe('50m');
    expect(formatDistance(500)).toBe('500m');
    expect(formatDistance(999)).toBe('999m');
  });

  it('should format kilometers for 1000+', () => {
    expect(formatDistance(1000)).toBe('1.0km');
    expect(formatDistance(1500)).toBe('1.5km');
    expect(formatDistance(10000)).toBe('10.0km');
  });

  it('should round meters to whole numbers', () => {
    expect(formatDistance(123.7)).toBe('124m');
  });

  it('should round kilometers to one decimal', () => {
    expect(formatDistance(1234)).toBe('1.2km');
    expect(formatDistance(1250)).toBe('1.3km');
  });
});

describe('calculateBearing', () => {
  it('should return 0 for due north', () => {
    const bearing = calculateBearing(40, 0, 41, 0);
    expect(bearing).toBeCloseTo(0, 0);
  });

  it('should return 90 for due east', () => {
    const bearing = calculateBearing(0, 0, 0, 1);
    expect(bearing).toBeCloseTo(90, 0);
  });

  it('should return 180 for due south', () => {
    const bearing = calculateBearing(41, 0, 40, 0);
    expect(bearing).toBeCloseTo(180, 0);
  });

  it('should return 270 for due west', () => {
    const bearing = calculateBearing(0, 1, 0, 0);
    expect(bearing).toBeCloseTo(270, 0);
  });

  it('should handle diagonal bearings', () => {
    // NE should be around 45 degrees
    const bearing = calculateBearing(0, 0, 1, 1);
    expect(bearing).toBeGreaterThan(40);
    expect(bearing).toBeLessThan(50);
  });

  it('should always return positive bearing (0-360)', () => {
    const bearing = calculateBearing(0, 0, -1, -1);
    expect(bearing).toBeGreaterThanOrEqual(0);
    expect(bearing).toBeLessThan(360);
  });
});
