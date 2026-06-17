/**
 * Collateral Calculation for Trade Capacity Engine
 *
 * Calculates the collateral required for a spread position:
 *   collateral = spread_width × contracts × 100
 *
 * This is the maximum potential loss (max risk) for a credit spread.
 * Each options contract controls 100 shares, so the per-point risk
 * is multiplied by the contract multiplier (100).
 */

/**
 * Calculates the collateral (buying power) required for a credit spread.
 *
 * Formula: spread_width × contracts × 100
 *
 * @param spreadWidth - The width of the spread in points (e.g. 50 for a $50-wide spread)
 * @param contracts - The number of contracts
 * @returns The total collateral required in dollars
 * @throws {Error} If spreadWidth or contracts is negative
 */
export function calculateCollateral(spreadWidth: number, contracts: number): number {
  if (spreadWidth < 0) {
    throw new Error('spreadWidth must be non-negative');
  }
  if (contracts < 0) {
    throw new Error('contracts must be non-negative');
  }
  return spreadWidth * contracts * 100;
}

/**
 * Validates whether the required collateral for a spread fits
 * within the available buying power.
 *
 * @param spreadWidth - The width of the spread in points
 * @param contracts - The number of contracts
 * @param availableBuyingPower - The buying power currently available (dollars)
 * @returns An object indicating whether collateral fits, with details
 */
export function validateCollateral(
  spreadWidth: number,
  contracts: number,
  availableBuyingPower: number
): { valid: boolean; requiredCollateral: number; availableBuyingPower: number; shortfall: number } {
  const requiredCollateral = calculateCollateral(spreadWidth, contracts);
  const shortfall = Math.max(0, requiredCollateral - availableBuyingPower);

  return {
    valid: requiredCollateral <= availableBuyingPower,
    requiredCollateral,
    availableBuyingPower,
    shortfall,
  };
}
