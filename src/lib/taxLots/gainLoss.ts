/**
 * Calculates the gain or loss for a disposition of shares.
 *
 * @param proceedsPerShare - Sale price per share
 * @param costBasisPerShare - Original cost basis per share
 * @param sharesDisposed - Number of shares disposed
 * @returns The total gain (positive) or loss (negative) for the disposition
 */
export function calculateGainLoss(
  proceedsPerShare: number,
  costBasisPerShare: number,
  sharesDisposed: number
): number {
  return (proceedsPerShare - costBasisPerShare) * sharesDisposed;
}
