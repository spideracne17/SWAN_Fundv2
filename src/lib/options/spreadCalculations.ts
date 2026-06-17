/**
 * Spread Calculation Helpers
 *
 * Standalone exported functions for computing key spread financials.
 * These formulas are also used internally by detectSpreads, but are
 * exported here for reuse in dashboards, summaries, and trade planning.
 */

/**
 * Calculates the net credit received when opening a credit spread.
 *
 * net_credit = short_premium - long_premium
 *
 * @param shortPremium Total premium received from the short leg
 * @param longPremium Total premium paid for the long (protective) leg
 * @returns Net credit received (positive means credit received)
 */
export function calculateNetCredit(
  shortPremium: number,
  longPremium: number
): number {
  return shortPremium - longPremium;
}

/**
 * Calculates the maximum possible loss on a credit spread.
 *
 * max_loss = (spread_width × 100 × contracts) - net_credit
 *
 * @param spreadWidth Distance between strikes in dollars (e.g., 5 for a $5-wide spread)
 * @param contracts Number of contracts in the spread
 * @param netCredit Net credit received when opening the spread
 * @returns Maximum loss in dollars
 */
export function calculateMaxLoss(
  spreadWidth: number,
  contracts: number,
  netCredit: number
): number {
  return spreadWidth * 100 * contracts - netCredit;
}

/**
 * Calculates the breakeven price for a credit spread at expiration.
 *
 * For put credit spreads:
 *   breakeven = short_strike - (net_credit / (100 × contracts))
 *
 * For call credit spreads:
 *   breakeven = short_strike + (net_credit / (100 × contracts))
 *
 * @param shortStrike Strike price of the short leg
 * @param netCredit Net credit received when opening the spread
 * @param contracts Number of contracts in the spread
 * @param spreadType Whether this is a 'put' or 'call' credit spread
 * @returns Breakeven price of the underlying at expiration
 */
export function calculateBreakeven(
  shortStrike: number,
  netCredit: number,
  contracts: number,
  spreadType: 'put' | 'call'
): number {
  const creditPerShare = netCredit / (100 * contracts);
  return spreadType === 'put'
    ? shortStrike - creditPerShare
    : shortStrike + creditPerShare;
}
