import type { MarketColor } from '@/types/database';

/**
 * A snapshot of current market data used to determine the market color regime.
 */
export interface MarketSnapshot {
  /** Current VIX index level */
  vix_level: number;
  /** Current SPX price */
  spx_price: number;
  /** SPX 50-day moving average */
  spx_50dma: number;
  /** SPX 200-day moving average */
  spx_200dma: number;
  /** IV rank percentile (0-100) */
  iv_rank: number;
  /** ISO 8601 timestamp of the snapshot */
  timestamp: string;
}

/**
 * Threshold settings that define the boundaries for each market color.
 * Values are loaded from the settings table.
 */
export interface ColorThresholds {
  /** Maximum VIX level for GREEN (default 18) */
  green_vix_max: number;
  /** GREEN requires SPX above 50DMA */
  green_spx_above_50dma: boolean;
  /** GREEN requires SPX above 200DMA */
  green_spx_above_200dma: boolean;
  /** Maximum VIX level for YELLOW (default 25) */
  yellow_vix_max: number;
  /** YELLOW triggered when SPX below 50DMA */
  yellow_spx_below_50dma: boolean;
  /** Maximum VIX level for RED (default 35) */
  red_vix_max: number;
  /** RED triggered when SPX below 200DMA */
  red_spx_below_200dma: boolean;
  /** VIX level above which triggers BLACK circuit breaker (default 35) */
  black_vix_above: number;
  /** SPX drop percentage relative to 200DMA that triggers BLACK (default -5) */
  black_spx_drop_pct: number;
}

/**
 * Calculates the market condition color from a market data snapshot.
 *
 * Priority order (highest to lowest):
 *   BLACK → RED → YELLOW → GREEN
 *
 * BLACK: Circuit breaker — any single condition triggers:
 *   - VIX > black_vix_above
 *   - SPX drop > black_spx_drop_pct below 200DMA
 *
 * RED: High stress — both conditions required:
 *   - VIX > red_vix_max (which equals yellow_vix_max, default 25)
 *   - SPX below 200DMA
 *
 * YELLOW: Elevated caution — any single condition triggers:
 *   - VIX > green_vix_max
 *   - SPX below 50DMA
 *   - IV rank > 50
 *
 * GREEN: All conditions normal.
 */
export function calculateMarketColor(
  snapshot: MarketSnapshot,
  thresholds: ColorThresholds
): MarketColor {
  // BLACK: Circuit breaker — any single condition triggers
  if (snapshot.vix_level > thresholds.black_vix_above) {
    return 'BLACK';
  }

  const spxDropPct =
    ((snapshot.spx_price - snapshot.spx_200dma) / snapshot.spx_200dma) * 100;
  if (spxDropPct < thresholds.black_spx_drop_pct) {
    return 'BLACK';
  }

  // RED: High stress — VIX elevated AND below 200DMA
  if (
    snapshot.vix_level > thresholds.red_vix_max &&
    snapshot.spx_price < snapshot.spx_200dma
  ) {
    return 'RED';
  }

  // YELLOW: Caution — VIX moderately elevated OR below 50DMA OR IV rank elevated
  if (
    snapshot.vix_level > thresholds.green_vix_max ||
    snapshot.spx_price < snapshot.spx_50dma ||
    snapshot.iv_rank > 50
  ) {
    return 'YELLOW';
  }

  // GREEN: Everything normal
  return 'GREEN';
}
