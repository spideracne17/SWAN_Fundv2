/**
 * Wash Sale Detection
 *
 * Identifies wash sales per IRS rules: a sale at a loss where a substantially
 * identical security was purchased within 31 days before or after the sale date.
 */

import { differenceInCalendarDays } from 'date-fns';
import type { DispositionRecord, TaxLotRecord } from '@/types/database';

// ─── Types ───────────────────────────────────────────────────────────────────

/** A detected wash sale entry with the disallowed loss amount. */
export interface WashSaleEntry {
  disposition_id: string;
  sale_date: string;
  symbol: string;
  purchase_date: string;
  disallowed_loss: number;
}

// ─── Public API ──────────────────────────────────────────────────────────────

/**
 * Detects wash sales from a set of dispositions and tax lots.
 *
 * For each disposition with a loss (gain_loss < 0), checks whether any lot
 * with the same symbol was acquired within ±31 calendar days of the disposition
 * date. If so, the loss is disallowed and a WashSaleEntry is produced.
 *
 * This is a pure function with no side effects or database access.
 *
 * @param dispositions - Array of disposition records to check for wash sales
 * @param lots - Array of tax lot records representing purchases
 * @returns Array of wash sale entries for each detected wash sale
 */
export function detectWashSales(
  dispositions: DispositionRecord[],
  lots: TaxLotRecord[]
): WashSaleEntry[] {
  const washSales: WashSaleEntry[] = [];

  for (const disposition of dispositions) {
    // Only consider dispositions that resulted in a loss
    if (disposition.gain_loss >= 0) {
      continue;
    }

    const saleDate = new Date(disposition.disposition_date);

    // Find the symbol for this disposition from the originating lot
    const originLot = lots.find((lot) => lot.id === disposition.lot_id);
    if (!originLot) {
      continue;
    }

    const symbol = originLot.symbol;

    // Look for any lot with the same symbol acquired within ±31 days of the sale
    for (const lot of lots) {
      if (lot.symbol !== symbol) {
        continue;
      }

      // Skip the lot that was sold (the origin lot itself)
      if (lot.id === disposition.lot_id) {
        continue;
      }

      const acquisitionDate = new Date(lot.acquisition_date);
      const daysDiff = Math.abs(differenceInCalendarDays(acquisitionDate, saleDate));

      if (daysDiff <= 31) {
        washSales.push({
          disposition_id: disposition.id,
          sale_date: disposition.disposition_date,
          symbol,
          purchase_date: lot.acquisition_date,
          disallowed_loss: Math.abs(disposition.gain_loss),
        });
        // Once we find one qualifying purchase, this disposition is a wash sale
        break;
      }
    }
  }

  return washSales;
}
