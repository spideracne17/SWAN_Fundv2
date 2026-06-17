import pb from '@/lib/pocketbase';
import { createLot, createDripLot } from '@/lib/taxLots/createLot';
import { pairDripRecords } from './dripPairing';
import type { NormalizedRecord } from './normalization';
import type { BrokerFormat, ImportError } from '@/types/database';

// ─── Interfaces ──────────────────────────────────────────────────────────────

/**
 * Summary returned after an import operation completes.
 */
export interface ImportSummary {
  records_total: number;
  records_new: number;
  records_duplicate: number;
  records_error: number;
  errors: ImportError[];
}

/**
 * Options required to execute an import batch.
 */
export interface ImportOptions {
  filename: string;
  format: BrokerFormat;
  accountId: string;
  fileHash: string;
}

// ─── Constants ───────────────────────────────────────────────────────────────

/** Maximum records per PocketBase batch insert (stays within free tier rate limits). */
const BATCH_SIZE = 50;

// ─── importRecords ───────────────────────────────────────────────────────────

/**
 * Batch-imports validated records to PocketBase, creates tax lots for
 * purchases and DRIP reinvestments, and logs the import to csv_import_log.
 *
 * Records are inserted into the `cash_transactions` collection in groups of 50
 * to stay within pockethost.io free tier rate limits.
 *
 * For 'buy' transactions, a tax lot is created via createLot.
 * For 'reinvestment' transactions (DRIP), a DRIP lot is created via createDripLot,
 * linked to the paired dividend record when available.
 *
 * @param validated - Array of deduplicated, validated NormalizedRecord objects
 * @param options - Import metadata (filename, format, accountId, fileHash)
 * @returns ImportSummary with counts and any errors encountered
 */
export async function importRecords(
  validated: NormalizedRecord[],
  options: ImportOptions,
): Promise<ImportSummary> {
  const summary: ImportSummary = {
    records_total: validated.length,
    records_new: 0,
    records_duplicate: 0,
    records_error: 0,
    errors: [],
  };

  // Fetch symbols that have manual lots — these are protected from import lot creation and sell processing
  let manualSymbols = new Set<string>();
  try {
    const manualLots = await pb.collection('tax_lots').getFullList({
      fields: 'symbol',
    });
    manualSymbols = new Set(
      manualLots
        .filter((lot) => (lot as Record<string, unknown>).acquisition_type === 'manual')
        .map((lot) => (lot as Record<string, unknown>).symbol as string)
    );
  } catch {
    // If we can't fetch, assume no manual symbols
  }

  // Pair DRIP records to link reinvestments to their source dividends
  const { paired, unpaired } = pairDripRecords(validated);

  // Build a map of reinvestment hash → dividend hash for DRIP lot linking
  const dripDividendMap = new Map<string, string>();
  for (const pair of paired) {
    dripDividendMap.set(pair.reinvestment.hash, pair.dividend.hash);
  }

  // Collect all records to import (paired dividends + reinvestments + unpaired)
  const allRecords: NormalizedRecord[] = [
    ...paired.flatMap((p) => [p.dividend, p.reinvestment]),
    ...unpaired,
  ];

  // Batch insert into cash_transactions in groups of BATCH_SIZE
  for (let i = 0; i < allRecords.length; i += BATCH_SIZE) {
    const batch = allRecords.slice(i, i + BATCH_SIZE);

    for (const record of batch) {
      try {
        // Insert into cash_transactions
        await pb.collection('cash_transactions').create({
          account_id: record.account_id,
          transaction_date: record.transaction_date,
          settlement_date: record.settlement_date,
          transaction_type: record.transaction_type,
          symbol: record.symbol,
          description: record.description,
          quantity: record.quantity,
          price_per_unit: record.price_per_unit,
          total_amount: record.total_amount,
          fees: record.fees,
          source_format: record.source_format,
          raw_action: record.raw_action,
          hash: record.hash,
        });

        summary.records_new++;

        // Create tax lot for buy transactions (skip symbols with manual lots)
        if (record.transaction_type === 'buy' && record.symbol && record.quantity && record.price_per_unit && !manualSymbols.has(record.symbol)) {
          const lot = createLot({
            account_id: record.account_id,
            symbol: record.symbol,
            acquisition_date: record.transaction_date,
            settlement_date: record.settlement_date,
            shares_acquired: record.quantity,
            cost_per_share: record.price_per_unit,
            fees: record.fees,
            source_transaction_hash: record.hash,
          });

          // Strip auto-generated fields — let PocketBase assign id/created/updated
          const { id: _id, created: _c, updated: _u, ...lotData } = lot;
          await pb.collection('tax_lots').create(lotData);
        }

        // Create DRIP lot for reinvestment transactions (skip symbols with manual lots)
        if (record.transaction_type === 'reinvestment' && record.symbol && record.quantity && record.price_per_unit && !manualSymbols.has(record.symbol)) {
          const dividendHash = dripDividendMap.get(record.hash);

          const lot = createDripLot({
            account_id: record.account_id,
            symbol: record.symbol,
            acquisition_date: record.transaction_date,
            shares_acquired: record.quantity,
            cost_per_share: record.price_per_unit,
            drip_source_dividend_id: dividendHash ?? '',
            source_transaction_hash: record.hash,
          });

          // Strip auto-generated fields — let PocketBase assign id/created/updated
          const { id: _id, created: _c, updated: _u, ...dripLotData } = lot;
          await pb.collection('tax_lots').create(dripLotData);
        }
      } catch (error) {
        summary.records_error++;
        summary.errors.push({
          row_number: i + batch.indexOf(record) + 1,
          field: 'record',
          value: record.hash,
          error: error instanceof Error ? error.message : 'Unknown error during import',
        });
      }
    }
  }

  // ─── Process sell transactions to close lots (FIFO) ───────────────────────
  const sellRecords = allRecords
    .filter((r) => r.transaction_type === 'sell' && r.symbol && r.quantity && !manualSymbols.has(r.symbol!))
    .sort((a, b) => (a.transaction_date ?? '').localeCompare(b.transaction_date ?? ''));

  for (const sell of sellRecords) {
    try {
      // Get all open lots for this symbol + account, sorted by date (FIFO)
      const openLots = await pb.collection('tax_lots').getFullList({
        filter: `symbol = "${sell.symbol}" && account_id = "${sell.account_id}" && status != "closed"`,
        sort: 'acquisition_date',
      });

      let remainingToSell = sell.quantity!;
      const proceedsPerShare = sell.price_per_unit ?? (Math.abs(sell.total_amount) / sell.quantity!);

      for (const lot of openLots) {
        if (remainingToSell <= 0) break;

        const lotShares = parseFloat(lot.remaining_shares as string) || 0;
        if (lotShares <= 0) continue;

        const disposed = Math.min(lotShares, remainingToSell);
        const newRemaining = lotShares - disposed;
        const newStatus = newRemaining <= 0.0001 ? 'closed' : 'partial';

        await pb.collection('tax_lots').update(lot.id, {
          remaining_shares: String(newRemaining),
          status: newStatus,
        });

        // Create disposition record
        const costBasisPerShare = parseFloat(lot.cost_per_share as string) || 0;
        const gainLoss = (proceedsPerShare - costBasisPerShare) * disposed;
        const acquisitionDate = new Date(lot.acquisition_date as string);
        const dispositionDate = new Date(sell.transaction_date);
        const daysDiff = (dispositionDate.getTime() - acquisitionDate.getTime()) / (1000 * 60 * 60 * 24);
        const holdingPeriod = daysDiff > 365 ? 'long_term' : 'short_term';

        await pb.collection('dispositions').create({
          lot_id: lot.id,
          disposition_date: sell.transaction_date,
          shares_disposed: String(disposed),
          proceeds_per_share: String(proceedsPerShare),
          cost_basis_per_share: String(costBasisPerShare),
          gain_loss: String(gainLoss),
          holding_period: holdingPeriod,
        });

        remainingToSell -= disposed;
      }
    } catch {
      // Sell processing errors are non-fatal
    }
  }

  // Log the import to csv_import_log
  await pb.collection('csv_import_log').create({
    filename: options.filename,
    format_detected: options.format,
    account_id: options.accountId,
    import_date: new Date().toISOString(),
    records_total: summary.records_total,
    records_new: summary.records_new,
    records_duplicate: summary.records_duplicate,
    records_error: summary.records_error,
    errors: summary.errors,
    file_hash: options.fileHash,
    backup_generated: false,
  });

  return summary;
}
