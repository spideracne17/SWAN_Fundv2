import type { NormalizedRecord } from './normalization';

// ─── Interfaces ──────────────────────────────────────────────────────────────

/**
 * A paired DRIP record linking a dividend to its same-day reinvestment.
 */
export interface DripPair {
  dividend: NormalizedRecord;
  reinvestment: NormalizedRecord;
  shares_acquired: number;
  cost_per_share: number;
}

/**
 * Result of the DRIP pairing process.
 * - paired: dividend+reinvestment pairs identified as DRIP transactions
 * - unpaired: all other records (cash dividends, orphan reinvestments, non-dividend/reinvestment records)
 */
export interface PairedResult {
  paired: DripPair[];
  unpaired: NormalizedRecord[];
}

// ─── DRIP Pairing ────────────────────────────────────────────────────────────

/**
 * Pairs DRIP dividend records with their same-day reinvestment records by symbol.
 *
 * Algorithm:
 * 1. Iterate through all records sequentially
 * 2. For each dividend record, store it in a pending map keyed by symbol + date
 * 3. For each reinvestment record, look for a matching pending dividend
 * 4. If a match is found, create a DripPair and remove from pending
 * 5. If no match is found, the reinvestment is flagged as orphan (goes to unpaired)
 * 6. After processing all records, remaining pending dividends are cash dividends (unpaired)
 *
 * @param records - Array of NormalizedRecord from a single import batch
 * @returns PairedResult with matched DRIP pairs and unmatched records
 */
export function pairDripRecords(records: NormalizedRecord[]): PairedResult {
  const paired: DripPair[] = [];
  const unpaired: NormalizedRecord[] = [];
  const pendingDividends: Map<string, NormalizedRecord> = new Map();

  for (const record of records) {
    if (record.transaction_type === 'dividend') {
      // Key: symbol + date (DRIP reinvestment occurs same day)
      const key = `${record.symbol}_${record.transaction_date}`;
      pendingDividends.set(key, record);
    } else if (record.transaction_type === 'reinvestment') {
      const key = `${record.symbol}_${record.transaction_date}`;
      const dividendRecord = pendingDividends.get(key);

      if (dividendRecord) {
        paired.push({
          dividend: dividendRecord,
          reinvestment: record,
          shares_acquired: record.quantity!,
          cost_per_share: record.price_per_unit!,
        });
        pendingDividends.delete(key);
      } else {
        // Reinvestment without matching dividend — flag for review
        unpaired.push(record);
      }
    } else {
      unpaired.push(record);
    }
  }

  // Remaining pending dividends are cash dividends (no reinvestment)
  for (const [, div] of pendingDividends) {
    unpaired.push(div);
  }

  return { paired, unpaired };
}
