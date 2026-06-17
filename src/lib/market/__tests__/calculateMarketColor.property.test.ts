import { describe, it, expect } from 'vitest';
import * as fc from 'fast-check';
import {
  calculateMarketColor,
  type MarketSnapshot,
} from '../calculateMarketColor';
import { DEFAULT_THRESHOLDS } from '../loadThresholds';

/**
 * Property-based tests for calculateMarketColor.
 *
 * **Validates: Requirements 5.1**
 */

const VALID_COLORS = ['GREEN', 'YELLOW', 'RED', 'BLACK'] as const;

/**
 * Arbitrary for a valid MarketSnapshot with realistic ranges:
 * - VIX: 0–100
 * - SPX price: 1000–7000
 * - SPX 50DMA: 1000–7000
 * - SPX 200DMA: 1000–7000
 * - IV rank: 0–100
 */
const validMarketSnapshotArb: fc.Arbitrary<MarketSnapshot> = fc.record({
  vix_level: fc.double({ min: 0, max: 100, noNaN: true, noDefaultInfinity: true }),
  spx_price: fc.double({ min: 1000, max: 7000, noNaN: true, noDefaultInfinity: true }),
  spx_50dma: fc.double({ min: 1000, max: 7000, noNaN: true, noDefaultInfinity: true }),
  spx_200dma: fc.double({ min: 1000, max: 7000, noNaN: true, noDefaultInfinity: true }),
  iv_rank: fc.double({ min: 0, max: 100, noNaN: true, noDefaultInfinity: true }),
  timestamp: fc.date().map((d) => d.toISOString()),
});

describe('calculateMarketColor - property-based tests', () => {
  describe('Property 7: Market Color Exhaustiveness', () => {
    it('for any valid MarketSnapshot, returns exactly one of GREEN/YELLOW/RED/BLACK', () => {
      fc.assert(
        fc.property(validMarketSnapshotArb, (snapshot) => {
          const result = calculateMarketColor(snapshot, DEFAULT_THRESHOLDS);
          expect(VALID_COLORS).toContain(result);
        }),
        { numRuns: 1000 },
      );
    });
  });

  describe('Property 8: Market Color Priority — BLACK override', () => {
    it('if VIX > black_vix_above (35), result is always BLACK regardless of other values', () => {
      const highVixSnapshotArb = fc.record({
        vix_level: fc.double({
          min: 35.01,
          max: 100,
          noNaN: true,
          noDefaultInfinity: true,
        }),
        spx_price: fc.double({ min: 1000, max: 7000, noNaN: true, noDefaultInfinity: true }),
        spx_50dma: fc.double({ min: 1000, max: 7000, noNaN: true, noDefaultInfinity: true }),
        spx_200dma: fc.double({ min: 1000, max: 7000, noNaN: true, noDefaultInfinity: true }),
        iv_rank: fc.double({ min: 0, max: 100, noNaN: true, noDefaultInfinity: true }),
        timestamp: fc.date().map((d) => d.toISOString()),
      });

      fc.assert(
        fc.property(highVixSnapshotArb, (snapshot) => {
          const result = calculateMarketColor(snapshot, DEFAULT_THRESHOLDS);
          expect(result).toBe('BLACK');
        }),
        { numRuns: 1000 },
      );
    });
  });
});
