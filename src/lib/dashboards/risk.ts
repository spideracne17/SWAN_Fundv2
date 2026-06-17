import { fetchAccountingData } from './accounting';
import { fetchSettingsByCategory } from '@/lib/settings';

/**
 * Result of a maximum drawdown calculation.
 */
export interface MaxDrawdownResult {
  /** Maximum drawdown as a negative percentage (e.g., -15.2 for 15.2% drawdown) */
  maxDrawdown: number;
  /** Index in the values array where the peak occurred before the maximum drawdown */
  peakIndex: number;
  /** Index in the values array where the trough occurred during the maximum drawdown */
  troughIndex: number;
}

/**
 * Calculates the maximum drawdown from a series of historical portfolio values.
 *
 * Maximum drawdown measures the largest peak-to-trough decline in portfolio value.
 * It tracks the running peak and at each point calculates the percentage decline
 * from that peak, recording the maximum decline observed.
 *
 * @param values - Array of historical portfolio values (e.g., daily closing values)
 * @returns Object containing maxDrawdown (negative percentage), peakIndex, and troughIndex
 *
 * @example
 * calculateMaxDrawdown([100, 120, 90, 110, 80])
 * // Returns { maxDrawdown: -33.33, peakIndex: 1, troughIndex: 4 }
 * // Peak was 120 at index 1, trough was 80 at index 4 → (80-120)/120 * 100 = -33.33%
 */
export function calculateMaxDrawdown(values: number[]): MaxDrawdownResult {
  if (values.length < 2) {
    return { maxDrawdown: 0, peakIndex: 0, troughIndex: 0 };
  }

  let peak = values[0]!;
  let peakIdx = 0;
  let maxDrawdown = 0;
  let resultPeakIndex = 0;
  let resultTroughIndex = 0;

  for (let i = 1; i < values.length; i++) {
    if (values[i]! > peak) {
      peak = values[i]!;
      peakIdx = i;
    }

    const drawdown = peak > 0 ? ((values[i]! - peak) / peak) * 100 : 0;

    if (drawdown < maxDrawdown) {
      maxDrawdown = drawdown;
      resultPeakIndex = peakIdx;
      resultTroughIndex = i;
    }
  }

  return {
    maxDrawdown,
    peakIndex: resultPeakIndex,
    troughIndex: resultTroughIndex,
  };
}

/**
 * A single holding's concentration within the portfolio.
 */
export interface ConcentrationEntry {
  symbol: string;
  value: number;
  percentage: number;
  flagged: boolean;
}

/**
 * Aggregated data for the Risk dashboard.
 */
export interface RiskDashboardData {
  concentration: ConcentrationEntry[];
  threshold_pct: number;
}

/**
 * Default concentration threshold percentage.
 * Used when the setting is not found in the database.
 */
const DEFAULT_CONCENTRATION_THRESHOLD_PCT = 25;

/**
 * Fetches concentration risk data for the portfolio.
 *
 * Retrieves all open positions from the accounting module, calculates each
 * position's percentage of total cost basis, and flags positions that exceed
 * the concentration threshold from settings (default 25%).
 */
export async function fetchConcentrationRisk(): Promise<RiskDashboardData> {
  // Fetch positions and the concentration threshold in parallel
  const [accountingData, riskSettings] = await Promise.all([
    fetchAccountingData(),
    fetchSettingsByCategory('risk'),
  ]);

  // Resolve the concentration threshold from settings
  const thresholdSetting = riskSettings.find(
    (s) => s.key === 'concentration_threshold_pct'
  );
  const threshold_pct = thresholdSetting
    ? Number(JSON.parse(thresholdSetting.value))
    : DEFAULT_CONCENTRATION_THRESHOLD_PCT;

  const totalCostBasis = accountingData.cost_basis_total;

  // Build concentration entries from positions
  const concentration: ConcentrationEntry[] = accountingData.positions.map(
    (position) => {
      const percentage =
        totalCostBasis > 0 ? (position.cost_basis / totalCostBasis) * 100 : 0;

      return {
        symbol: position.symbol,
        value: position.cost_basis,
        percentage,
        flagged: percentage > threshold_pct,
      };
    }
  );

  // Sort descending by percentage for easier consumption
  concentration.sort((a, b) => b.percentage - a.percentage);

  return {
    concentration,
    threshold_pct,
  };
}
