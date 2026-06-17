import { differenceInDays } from 'date-fns';
import type { DispositionRecord, HoldingPeriod, TaxLotRecord } from '@/types/database';

/**
 * Input record representing a share sale to be processed against open lots.
 */
export interface SaleRecord {
  symbol: string;
  quantity: number;
  proceeds_per_share: number;
  date: string; // ISO 8601 date string
}

/**
 * Error thrown when there are insufficient open lots to fulfill a sale.
 */
export class InsufficientLotsError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'InsufficientLotsError';
    Object.setPrototypeOf(this, InsufficientLotsError.prototype);
  }
}

/**
 * Disposes of tax lots using FIFO (First In, First Out) ordering.
 *
 * Lots are sorted by acquisition_date ascending (oldest first) and consumed
 * in order until the sale quantity is fulfilled. Each consumed lot (or portion)
 * produces a DispositionRecord with gain/loss and holding period.
 *
 * This function mutates the openLots array — updating remaining_shares and status.
 *
 * @param sale - The sale to process
 * @param openLots - Array of tax lots with status 'open' or 'partial'
 * @returns Array of disposition records for each lot (or portion) consumed
 * @throws InsufficientLotsError if available shares cannot cover the sale quantity
 */
export function disposeLotsFIFO(
  sale: SaleRecord,
  openLots: TaxLotRecord[]
): DispositionRecord[] {
  // Sort lots by acquisition_date ascending (FIFO — oldest first)
  const sortedLots = openLots.sort(
    (a, b) => new Date(a.acquisition_date).getTime() - new Date(b.acquisition_date).getTime()
  );

  // Pre-check: ensure sufficient shares exist before mutating any lots
  const totalAvailable = sortedLots.reduce((sum, lot) => sum + lot.remaining_shares, 0);
  if (totalAvailable < sale.quantity) {
    throw new InsufficientLotsError(
      `Cannot sell ${sale.quantity} shares of ${sale.symbol}: only ${totalAvailable} available in open lots`
    );
  }

  const dispositions: DispositionRecord[] = [];
  let remainingToSell = sale.quantity;
  let lotIndex = 0;

  while (remainingToSell > 0 && lotIndex < sortedLots.length) {
    const lot = sortedLots[lotIndex]!;
    const disposedQty = Math.min(lot.remaining_shares, remainingToSell);

    const holdingDays = differenceInDays(
      new Date(sale.date),
      new Date(lot.acquisition_date)
    );
    const holdingPeriod: HoldingPeriod = holdingDays > 365 ? 'long_term' : 'short_term';

    const gainLoss = (sale.proceeds_per_share - lot.cost_per_share) * disposedQty;

    const now = new Date().toISOString();

    const disposition: DispositionRecord = {
      id: crypto.randomUUID(),
      lot_id: lot.id,
      disposition_date: sale.date,
      shares_disposed: disposedQty,
      proceeds_per_share: sale.proceeds_per_share,
      cost_basis_per_share: lot.cost_per_share,
      gain_loss: gainLoss,
      holding_period: holdingPeriod,
      created: now,
      updated: now,
    };

    dispositions.push(disposition);

    // Update lot state (mutates the input array)
    lot.remaining_shares -= disposedQty;
    lot.status = lot.remaining_shares === 0 ? 'closed' : 'partial';

    remainingToSell -= disposedQty;
    lotIndex++;
  }

  return dispositions;
}
