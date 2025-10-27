import { beforeEach, describe, expect, it, vi } from 'vitest';

import { formatAge, simplifyDuration } from '../time';

describe('formatAge', () => {
  beforeEach(() => {
    // Mock Date.now() to return a fixed time for consistent testing
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2024-01-01T12:00:00Z'));
  });

  it('should return "-" for null or undefined timestamps', () => {
    expect(formatAge(null)).toBe('-');
    expect(formatAge(undefined)).toBe('-');
    expect(formatAge('')).toBe('-');
  });

  it('should return "now" for times less than 1 minute ago', () => {
    const now = new Date('2024-01-01T12:00:00Z');
    const thirtySecondsAgo = new Date(now.getTime() - 30 * 1000);
    expect(formatAge(thirtySecondsAgo.toISOString())).toBe('now');
  });

  it('should return "now" for future dates', () => {
    const future = new Date('2024-01-01T12:05:00Z');
    expect(formatAge(future.toISOString())).toBe('now');
  });

  it('should format minutes correctly', () => {
    const now = new Date('2024-01-01T12:00:00Z');

    // 5 minutes ago
    const fiveMinutesAgo = new Date(now.getTime() - 5 * 60 * 1000);
    expect(formatAge(fiveMinutesAgo.toISOString())).toBe('5m');

    // 12 minutes ago
    const twelveMinutesAgo = new Date(now.getTime() - 12 * 60 * 1000);
    expect(formatAge(twelveMinutesAgo.toISOString())).toBe('12m');

    // 59 minutes ago
    const fiftyNineMinutesAgo = new Date(now.getTime() - 59 * 60 * 1000);
    expect(formatAge(fiftyNineMinutesAgo.toISOString())).toBe('59m');
  });

  it('should format hours correctly', () => {
    const now = new Date('2024-01-01T12:00:00Z');

    // Exactly 3 hours ago
    const threeHoursAgo = new Date(now.getTime() - 3 * 60 * 60 * 1000);
    expect(formatAge(threeHoursAgo.toISOString())).toBe('3h');

    // 3 hours and 5 minutes ago
    const threeHoursFiveMinutesAgo = new Date(
      now.getTime() - (3 * 60 + 5) * 60 * 1000,
    );
    expect(formatAge(threeHoursFiveMinutesAgo.toISOString())).toBe('3h5m');

    // 3 hours and 14 minutes ago
    const threeHoursFourteenMinutesAgo = new Date(
      now.getTime() - (3 * 60 + 14) * 60 * 1000,
    );
    expect(formatAge(threeHoursFourteenMinutesAgo.toISOString())).toBe('3h14m');
  });

  it('should format days correctly', () => {
    const now = new Date('2024-01-01T12:00:00Z');

    // Exactly 2 days ago
    const twoDaysAgo = new Date(now.getTime() - 2 * 24 * 60 * 60 * 1000);
    expect(formatAge(twoDaysAgo.toISOString())).toBe('2d');

    // 2 days and 1 hour ago
    const twoDaysOneHourAgo = new Date(
      now.getTime() - (2 * 24 + 1) * 60 * 60 * 1000,
    );
    expect(formatAge(twoDaysOneHourAgo.toISOString())).toBe('2d1h');

    // 40 hours ago (1d16h)
    const fortyHoursAgo = new Date(now.getTime() - 40 * 60 * 60 * 1000);
    expect(formatAge(fortyHoursAgo.toISOString())).toBe('1d16h');
  });

  it('should return full date for times more than a week ago', () => {
    const now = new Date('2024-01-01T12:00:00Z');
    const eightDaysAgo = new Date(now.getTime() - 8 * 24 * 60 * 60 * 1000);

    // Should return a date string (format may vary by locale)
    const result = formatAge(eightDaysAgo.toISOString());
    expect(result).not.toBe('-');
    expect(result).not.toMatch(/^\d+[dhm]/); // Should not be in our custom format
  });

  it('should handle invalid date strings', () => {
    expect(formatAge('invalid-date')).toBe('-');
    expect(formatAge('not-a-date-at-all')).toBe('-');
  });
});

describe('simplifyDuration', () => {
  it('should return "-" for null, undefined, or empty strings', () => {
    expect(simplifyDuration(null)).toBe('-');
    expect(simplifyDuration(undefined)).toBe('-');
    expect(simplifyDuration('')).toBe('-');
  });

  it('should remove trailing "0s"', () => {
    expect(simplifyDuration('5m0s')).toBe('5m');
    expect(simplifyDuration('1h0s')).toBe('1h');
    expect(simplifyDuration('720h0s')).toBe('720h');
    expect(simplifyDuration('30s0s')).toBe('30s'); // Only removes the trailing one
  });

  it('should remove trailing "0m"', () => {
    expect(simplifyDuration('2h0m')).toBe('2h');
    expect(simplifyDuration('720h0m')).toBe('720h');
    expect(simplifyDuration('10m0m')).toBe('10m'); // Only removes the trailing one
  });

  it('should remove both trailing "0m" and "0s" in correct order', () => {
    expect(simplifyDuration('5m0s')).toBe('5m');
    expect(simplifyDuration('2h0m0s')).toBe('2h');
    expect(simplifyDuration('720h0m0s')).toBe('720h');
    expect(simplifyDuration('1h30m0s')).toBe('1h30m');
  });

  it('should not modify durations without trailing zeros', () => {
    expect(simplifyDuration('5m')).toBe('5m');
    expect(simplifyDuration('2h')).toBe('2h');
    expect(simplifyDuration('1h30m')).toBe('1h30m');
    expect(simplifyDuration('45s')).toBe('45s');
    expect(simplifyDuration('1h15m30s')).toBe('1h15m30s');
  });

  it('should not modify durations with non-zero seconds or minutes', () => {
    expect(simplifyDuration('5m30s')).toBe('5m30s');
    expect(simplifyDuration('2h15m')).toBe('2h15m');
    expect(simplifyDuration('1h5m30s')).toBe('1h5m30s');
  });

  it('should handle edge cases', () => {
    expect(simplifyDuration('0s')).toBe('0s'); // Don't remove if it would make empty
    expect(simplifyDuration('0m')).toBe('0m'); // Don't remove if it would make empty
    expect(simplifyDuration('0h')).toBe('0h'); // No trailing units to remove
    expect(simplifyDuration('0')).toBe('0'); // No units at all
  });

  it('should handle malformed or unusual input gracefully', () => {
    expect(simplifyDuration('invalid')).toBe('invalid');
    expect(simplifyDuration('5minutes')).toBe('5minutes');
    expect(simplifyDuration('h0m0s')).toBe('h'); // Removes trailing zeros even from malformed input
  });
});
