import type { BrokerFormat } from '@/types/database';

// ─── Stock Split Event ───────────────────────────────────────────────────────

/**
 * Represents a detected stock split event parsed from a CSV import row.
 */
export interface StockSplitEvent {
  /** The ticker symbol that split */
  symbol: string;
  /** ISO 8601 date of the split */
  split_date: string;
  /** The "from" side of the ratio (e.g., 1 in a 4-for-1 split) */
  ratio_from: number;
  /** The "to" side of the ratio (e.g., 4 in a 4-for-1 split) */
  ratio_to: number;
}

// ─── Regex for parsing split ratio from description ──────────────────────────

/**
 * Matches patterns like "FORWARD SPLIT 4 FOR 1", "REVERSE SPLIT 1 FOR 4",
 * "2 for 1", etc. Captures ratioTo (first number) and ratioFrom (second number).
 */
const SPLIT_RATIO_REGEX = /(\d+)\s+(?:FOR|for)\s+(\d+)/;

// ─── detectStockSplit ────────────────────────────────────────────────────────

/**
 * Detects whether a CSV row represents a stock split event.
 *
 * For Schwab formats, a stock split row has:
 * - Action column = "Stock Split"
 * - Description containing ratio info (e.g., "FORWARD SPLIT 4 FOR 1")
 * - Symbol column with the ticker
 * - Date column with the split date
 *
 * The ratio is parsed from the description using the pattern "N FOR M",
 * where N is ratio_to and M is ratio_from.
 *
 * @param row - A raw CSV row as key-value pairs
 * @param format - The detected broker format
 * @returns A StockSplitEvent if the row is a stock split, or null otherwise
 */
export function detectStockSplit(
  row: Record<string, string>,
  format: BrokerFormat,
): StockSplitEvent | null {
  if (format === 'schwab_taxable' || format === 'schwab_roth_ira') {
    return detectSchwabStockSplit(row);
  }

  // Robinhood format does not currently have a known stock split action pattern.
  // Return null for unsupported formats.
  return null;
}

// ─── Schwab-specific detection ───────────────────────────────────────────────

/**
 * Detects a stock split from a Schwab CSV row.
 *
 * Schwab split rows have:
 * - Action: "Stock Split"
 * - Description: e.g., "FORWARD SPLIT 4 FOR 1" or "REVERSE SPLIT 1 FOR 4"
 * - Symbol: the ticker
 * - Date: transaction date in MM/DD/YYYY format (or normalized)
 * - Quantity: new shares received (informational, not used for ratio)
 */
function detectSchwabStockSplit(row: Record<string, string>): StockSplitEvent | null {
  const action = (row['Action'] ?? '').trim().toLowerCase();

  if (action !== 'stock split') {
    return null;
  }

  const symbol = (row['Symbol'] ?? '').trim();
  if (!symbol) {
    return null;
  }

  const rawDate = (row['Date'] ?? '').trim();
  if (!rawDate) {
    return null;
  }

  const splitDate = normalizeSplitDate(rawDate);

  const description = (row['Description'] ?? '').trim();
  const ratioMatch = description.match(SPLIT_RATIO_REGEX);

  if (ratioMatch) {
    const ratioTo = parseInt(ratioMatch[1]!, 10);
    const ratioFrom = parseInt(ratioMatch[2]!, 10);

    if (ratioTo > 0 && ratioFrom > 0) {
      return {
        symbol,
        split_date: splitDate,
        ratio_from: ratioFrom,
        ratio_to: ratioTo,
      };
    }
  }

  // If ratio cannot be parsed from description, attempt to infer from quantity.
  // This is a fallback — Schwab typically includes the ratio in the description.
  return null;
}

// ─── Date normalization helper ───────────────────────────────────────────────

/** Regex matching MM/DD/YYYY format */
const MM_DD_YYYY_REGEX = /^(\d{2})\/(\d{2})\/(\d{4})$/;

/** Regex matching "as of" pattern */
const AS_OF_REGEX = /^(\d{2}\/\d{2}\/\d{4})\s+as\s+of\s+\d{2}\/\d{2}\/\d{4}$/i;

/**
 * Normalizes a split date to ISO 8601 format.
 * Handles MM/DD/YYYY, "as of" patterns, and already-ISO dates.
 */
function normalizeSplitDate(raw: string): string {
  // Handle "as of" pattern — extract the first date
  const asOfMatch = raw.match(AS_OF_REGEX);
  if (asOfMatch) {
    return convertMMDDYYYYToISO(asOfMatch[1]!);
  }

  // Handle MM/DD/YYYY
  const mmddMatch = raw.match(MM_DD_YYYY_REGEX);
  if (mmddMatch) {
    return convertMMDDYYYYToISO(raw);
  }

  // Assume already ISO if no other pattern matches
  return raw;
}

/**
 * Converts MM/DD/YYYY to YYYY-MM-DD.
 */
function convertMMDDYYYYToISO(dateStr: string): string {
  const match = dateStr.match(MM_DD_YYYY_REGEX);
  if (!match) return dateStr;
  return `${match[3]}-${match[1]}-${match[2]}`;
}
