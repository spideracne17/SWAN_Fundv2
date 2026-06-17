/**
 * Trade capacity staleness gate.
 *
 * When market data is stale (older than 30 minutes or fetch has failed),
 * new trade capacity should be disabled to prevent opening positions
 * without current market information.
 *
 * This function is the single source of truth for whether staleness
 * should block new trades. Components and the Trade Capacity Engine
 * should call this to determine if new position opening is allowed.
 */

/**
 * Returns true when new trade capacity should be disabled due to stale data.
 *
 * @param isStale - The `isStale` flag from useMarketData hook
 * @returns true if new trades should be blocked
 */
export function isTradeCapacityDisabled(isStale: boolean): boolean {
  return isStale;
}
