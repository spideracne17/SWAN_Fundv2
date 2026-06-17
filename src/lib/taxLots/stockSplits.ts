import type { TaxLotRecord, StockSplitRecord } from '@/types/database';
import pb from '@/lib/pocketbase';

export interface SplitAdjustmentResult {
  adjustedLots: TaxLotRecord[];
  adjustedCount: number;
}

export interface SaveSplitInput {
  symbol: string;
  split_date: string;
  ratio_from: number;
  ratio_to: number;
  lots_adjusted: number;
}

/**
 * Persists a stock split record to the PocketBase `stock_splits` collection.
 *
 * Sets `applied` to true, `applied_date` to the current ISO timestamp,
 * and `effective_date` to the provided `split_date`.
 */
export async function saveSplitRecord(split: SaveSplitInput): Promise<StockSplitRecord> {
  const record = await pb.collection('stock_splits').create<StockSplitRecord>({
    symbol: split.symbol,
    split_date: split.split_date,
    ratio_from: split.ratio_from,
    ratio_to: split.ratio_to,
    effective_date: split.split_date,
    lots_adjusted: split.lots_adjusted,
    applied: true,
    applied_date: new Date().toISOString(),
  });

  return record;
}

/**
 * Adjusts tax lots for a stock split while preserving total_cost_basis.
 *
 * The ratio means: for every `ratioFrom` shares, the holder gets `ratioTo` shares.
 * Example: a 4:1 forward split has ratioFrom=1, ratioTo=4.
 *
 * Only lots with matching symbol, status "open" or "partial", and acquisition_date
 * before the splitDate are adjusted.
 *
 * For each eligible lot:
 * - Stores original values in original_shares and original_cost_per_share
 * - Multiplies shares_acquired and remaining_shares by (ratioTo / ratioFrom)
 * - Divides cost_per_share by (ratioTo / ratioFrom)
 * - total_cost_basis remains unchanged
 * - Sets split_adjusted = true
 */
export function adjustLotsForSplit(
  symbol: string,
  ratioFrom: number,
  ratioTo: number,
  splitDate: string,
  lots: TaxLotRecord[]
): SplitAdjustmentResult {
  const multiplier = ratioTo / ratioFrom;
  let adjustedCount = 0;

  const adjustedLots = lots.map((lot) => {
    const isEligible =
      lot.symbol === symbol &&
      (lot.status === 'open' || lot.status === 'partial') &&
      lot.acquisition_date < splitDate;

    if (!isEligible) {
      return lot;
    }

    adjustedCount++;

    return {
      ...lot,
      original_shares: lot.shares_acquired,
      original_cost_per_share: lot.cost_per_share,
      shares_acquired: lot.shares_acquired * multiplier,
      remaining_shares: lot.remaining_shares * multiplier,
      cost_per_share: lot.cost_per_share * (ratioFrom / ratioTo),
      split_adjusted: true,
    };
  });

  return { adjustedLots, adjustedCount };
}
