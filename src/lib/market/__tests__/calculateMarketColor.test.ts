import { describe, it, expect } from 'vitest';
import {
  calculateMarketColor,
  type MarketSnapshot,
  type ColorThresholds,
} from '../calculateMarketColor';
import { DEFAULT_THRESHOLDS } from '../loadThresholds';

/**
 * Helper to create a MarketSnapshot with sensible defaults.
 * SPX defaults: price 4500, 50DMA 4400, 200DMA 4300 (above both MAs).
 */
function makeSnapshot(overrides: Partial<MarketSnapshot> = {}): MarketSnapshot {
  return {
    vix_level: 15,
    spx_price: 4500,
    spx_50dma: 4400,
    spx_200dma: 4300,
    iv_rank: 30,
    timestamp: '2024-01-15T16:00:00Z',
    ...overrides,
  };
}

describe('calculateMarketColor', () => {
  const thresholds: ColorThresholds = { ...DEFAULT_THRESHOLDS };

  // ─── GREEN ───────────────────────────────────────────────────────────────────

  describe('GREEN regime', () => {
    it('returns GREEN when VIX=15, SPX above both MAs, IV rank=30', () => {
      const snapshot = makeSnapshot({
        vix_level: 15,
        spx_price: 4500,
        spx_50dma: 4400,
        spx_200dma: 4300,
        iv_rank: 30,
      });
      expect(calculateMarketColor(snapshot, thresholds)).toBe('GREEN');
    });
  });

  // ─── GREEN → YELLOW boundary ────────────────────────────────────────────────

  describe('GREEN → YELLOW boundary (green_vix_max = 18)', () => {
    it('returns GREEN when VIX=18 (at boundary, not exceeding)', () => {
      const snapshot = makeSnapshot({ vix_level: 18 });
      expect(calculateMarketColor(snapshot, thresholds)).toBe('GREEN');
    });

    it('returns YELLOW when VIX=18.01 (just above boundary)', () => {
      const snapshot = makeSnapshot({ vix_level: 18.01 });
      expect(calculateMarketColor(snapshot, thresholds)).toBe('YELLOW');
    });
  });

  // ─── YELLOW ──────────────────────────────────────────────────────────────────

  describe('YELLOW regime', () => {
    it('returns YELLOW when VIX=20 (between 18 and 25), SPX above 200DMA', () => {
      const snapshot = makeSnapshot({ vix_level: 20 });
      expect(calculateMarketColor(snapshot, thresholds)).toBe('YELLOW');
    });

    it('returns YELLOW when SPX below 50DMA (VIX normal)', () => {
      // VIX is fine (15), but SPX below 50DMA triggers YELLOW
      const snapshot = makeSnapshot({
        vix_level: 15,
        spx_price: 4350, // below 50DMA of 4400
        spx_50dma: 4400,
        spx_200dma: 4300,
      });
      expect(calculateMarketColor(snapshot, thresholds)).toBe('YELLOW');
    });

    it('returns YELLOW when IV rank > 50', () => {
      const snapshot = makeSnapshot({ iv_rank: 55 });
      expect(calculateMarketColor(snapshot, thresholds)).toBe('YELLOW');
    });
  });

  // ─── YELLOW → RED boundary ──────────────────────────────────────────────────

  describe('YELLOW → RED boundary (needs VIX > 25 AND below 200DMA)', () => {
    it('returns RED when VIX=25.01 AND SPX below 200DMA (both conditions met)', () => {
      const snapshot = makeSnapshot({
        vix_level: 25.01,
        spx_price: 4200, // below 200DMA of 4300
        spx_200dma: 4300,
      });
      expect(calculateMarketColor(snapshot, thresholds)).toBe('RED');
    });

    it('returns YELLOW when VIX=25 (at boundary, not exceeding) even if below 200DMA', () => {
      // VIX at exactly 25 does NOT exceed red_vix_max of 25, so no RED
      // But VIX > green_vix_max (18) triggers YELLOW
      const snapshot = makeSnapshot({
        vix_level: 25,
        spx_price: 4200, // below 200DMA
        spx_200dma: 4300,
      });
      expect(calculateMarketColor(snapshot, thresholds)).toBe('YELLOW');
    });

    it('returns YELLOW when VIX=26 but SPX above 200DMA (only one condition)', () => {
      // VIX above red_vix_max but SPX NOT below 200DMA → not RED, but YELLOW via VIX > green_vix_max
      const snapshot = makeSnapshot({
        vix_level: 26,
        spx_price: 4500, // above 200DMA of 4300
        spx_200dma: 4300,
      });
      expect(calculateMarketColor(snapshot, thresholds)).toBe('YELLOW');
    });
  });

  // ─── RED ─────────────────────────────────────────────────────────────────────

  describe('RED regime', () => {
    it('returns RED when VIX=30 and SPX below 200DMA', () => {
      const snapshot = makeSnapshot({
        vix_level: 30,
        spx_price: 4200, // below 200DMA of 4300
        spx_200dma: 4300,
      });
      expect(calculateMarketColor(snapshot, thresholds)).toBe('RED');
    });
  });

  // ─── BLACK ───────────────────────────────────────────────────────────────────

  describe('BLACK regime (circuit breaker)', () => {
    it('returns BLACK when VIX=36 (above black_vix_above=35), regardless of other conditions', () => {
      // All other conditions look GREEN, but VIX alone triggers BLACK
      const snapshot = makeSnapshot({
        vix_level: 36,
        spx_price: 4500,
        spx_50dma: 4400,
        spx_200dma: 4300,
        iv_rank: 20,
      });
      expect(calculateMarketColor(snapshot, thresholds)).toBe('BLACK');
    });

    it('returns BLACK when SPX drop > 5% below 200DMA', () => {
      // 200DMA = 4300, 5% below = 4085. Price of 4050 is a ~5.8% drop → BLACK
      const snapshot = makeSnapshot({
        vix_level: 15,
        spx_price: 4050,
        spx_200dma: 4300,
      });
      expect(calculateMarketColor(snapshot, thresholds)).toBe('BLACK');
    });

    it('BLACK takes priority over RED conditions', () => {
      // This meets RED conditions (VIX > 25, below 200DMA) but also meets BLACK (VIX > 35)
      const snapshot = makeSnapshot({
        vix_level: 36,
        spx_price: 4200, // below 200DMA
        spx_200dma: 4300,
      });
      expect(calculateMarketColor(snapshot, thresholds)).toBe('BLACK');
    });
  });
});
