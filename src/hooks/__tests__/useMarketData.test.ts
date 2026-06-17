import { describe, it, expect } from 'vitest';
import { isMarketOpen } from '../useMarketData';

/**
 * Helper to create a Date in the America/New_York timezone.
 * We build a UTC date that corresponds to the desired ET time.
 *
 * Note: America/New_York is UTC-5 (EST) or UTC-4 (EDT).
 * We use specific dates where we know the offset:
 * - January dates are EST (UTC-5)
 * - July dates are EDT (UTC-4)
 */

describe('isMarketOpen', () => {
  describe('weekday during market hours → true', () => {
    it('returns true at 10:00 AM ET on a Wednesday (EST)', () => {
      // Wednesday Jan 15, 2025 10:00 AM ET = 15:00 UTC (EST, UTC-5)
      const date = new Date('2025-01-15T15:00:00Z');
      expect(isMarketOpen(date)).toBe(true);
    });

    it('returns true at 9:30 AM ET exactly (market open)', () => {
      // Wednesday Jan 15, 2025 9:30 AM ET = 14:30 UTC (EST, UTC-5)
      const date = new Date('2025-01-15T14:30:00Z');
      expect(isMarketOpen(date)).toBe(true);
    });

    it('returns true at 3:59 PM ET (one minute before close)', () => {
      // Wednesday Jan 15, 2025 3:59 PM ET = 20:59 UTC (EST, UTC-5)
      const date = new Date('2025-01-15T20:59:00Z');
      expect(isMarketOpen(date)).toBe(true);
    });

    it('returns true during EDT (summer)', () => {
      // Tuesday Jul 15, 2025 12:00 PM ET = 16:00 UTC (EDT, UTC-4)
      const date = new Date('2025-07-15T16:00:00Z');
      expect(isMarketOpen(date)).toBe(true);
    });
  });

  describe('weekend → false', () => {
    it('returns false on Saturday even during market hours', () => {
      // Saturday Jan 18, 2025 12:00 PM ET = 17:00 UTC (EST, UTC-5)
      const date = new Date('2025-01-18T17:00:00Z');
      expect(isMarketOpen(date)).toBe(false);
    });

    it('returns false on Sunday even during market hours', () => {
      // Sunday Jan 19, 2025 12:00 PM ET = 17:00 UTC (EST, UTC-5)
      const date = new Date('2025-01-19T17:00:00Z');
      expect(isMarketOpen(date)).toBe(false);
    });
  });

  describe('before 9:30 AM ET → false', () => {
    it('returns false at 9:29 AM ET (one minute before open)', () => {
      // Wednesday Jan 15, 2025 9:29 AM ET = 14:29 UTC (EST, UTC-5)
      const date = new Date('2025-01-15T14:29:00Z');
      expect(isMarketOpen(date)).toBe(false);
    });

    it('returns false at 6:00 AM ET (early morning)', () => {
      // Wednesday Jan 15, 2025 6:00 AM ET = 11:00 UTC (EST, UTC-5)
      const date = new Date('2025-01-15T11:00:00Z');
      expect(isMarketOpen(date)).toBe(false);
    });
  });

  describe('after 4:00 PM ET → false', () => {
    it('returns false at 4:00 PM ET exactly (market close)', () => {
      // Wednesday Jan 15, 2025 4:00 PM ET = 21:00 UTC (EST, UTC-5)
      const date = new Date('2025-01-15T21:00:00Z');
      expect(isMarketOpen(date)).toBe(false);
    });

    it('returns false at 5:00 PM ET (after hours)', () => {
      // Wednesday Jan 15, 2025 5:00 PM ET = 22:00 UTC (EST, UTC-5)
      const date = new Date('2025-01-15T22:00:00Z');
      expect(isMarketOpen(date)).toBe(false);
    });
  });
});
