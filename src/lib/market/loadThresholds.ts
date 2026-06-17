import { fetchSettingsByCategory } from '@/lib/settings';
import type { ColorThresholds } from './calculateMarketColor';

/**
 * Default color thresholds used when PocketBase is unavailable
 * or when individual settings are missing from the database.
 *
 * These values match the documented defaults in the design spec:
 * - GREEN: VIX ≤ 18, SPX above both 50DMA and 200DMA
 * - YELLOW: VIX 18–25, SPX below 50DMA
 * - RED: VIX > 25, SPX below 200DMA
 * - BLACK: VIX > 35, or SPX drop > 5% below 200DMA
 */
export const DEFAULT_THRESHOLDS: ColorThresholds = {
  green_vix_max: 18,
  green_spx_above_50dma: true,
  green_spx_above_200dma: true,
  yellow_vix_max: 25,
  yellow_spx_below_50dma: true,
  red_vix_max: 25,
  red_spx_below_200dma: true,
  black_vix_above: 35,
  black_spx_drop_pct: -5,
};

/**
 * Maps a settings key to a typed value for the ColorThresholds interface.
 * Handles both numeric and boolean setting values stored as JSON strings.
 */
function parseSettingValue(key: keyof ColorThresholds, raw: string): number | boolean {
  const parsed = JSON.parse(raw);

  // Boolean fields
  if (
    key === 'green_spx_above_50dma' ||
    key === 'green_spx_above_200dma' ||
    key === 'yellow_spx_below_50dma' ||
    key === 'red_spx_below_200dma'
  ) {
    return Boolean(parsed);
  }

  // Numeric fields
  return Number(parsed);
}

/**
 * Loads color thresholds from the PocketBase settings table (category: 'market_color').
 *
 * - Fetches all settings with category 'market_color'
 * - Maps each setting key to the corresponding ColorThresholds field
 * - Falls back to DEFAULT_THRESHOLDS for any missing keys
 * - Falls back entirely to DEFAULT_THRESHOLDS if PocketBase fetch fails
 */
export async function loadColorThresholds(): Promise<ColorThresholds> {
  try {
    const settings = await fetchSettingsByCategory('market_color');

    // Start with defaults and override with any values found in settings
    const thresholds: ColorThresholds = { ...DEFAULT_THRESHOLDS };

    for (const setting of settings) {
      const key = setting.key as keyof ColorThresholds;
      if (key in DEFAULT_THRESHOLDS) {
        try {
          const value = parseSettingValue(key, setting.value);
          // Type-safe assignment: booleans go to boolean fields, numbers to number fields
          (thresholds as unknown as Record<string, number | boolean>)[key] = value;
        } catch {
          // If parsing fails for a single value, keep the default for that key
        }
      }
    }

    return thresholds;
  } catch {
    // PocketBase unavailable — return all defaults
    return { ...DEFAULT_THRESHOLDS };
  }
}
