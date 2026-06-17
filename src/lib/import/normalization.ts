import type { BrokerFormat } from '@/types/database';

// ─── Normalized Record ───────────────────────────────────────────────────────

/**
 * A fully normalized transaction record ready for deduplication and import.
 */
export interface NormalizedRecord {
  hash: string;
  account_id: string;
  transaction_date: string;
  settlement_date?: string;
  transaction_type: TransactionType;
  symbol?: string;
  description: string;
  quantity?: number;
  price_per_unit?: number;
  total_amount: number;
  fees?: number;
  source_format: BrokerFormat;
  raw_action: string;
}

// ─── Transaction Type ────────────────────────────────────────────────────────

/**
 * Canonical transaction types that broker-specific actions are mapped into.
 */
export type TransactionType =
  | 'buy'
  | 'sell'
  | 'dividend'
  | 'reinvestment'
  | 'split'
  | 'transfer'
  | 'fee'
  | 'interest'
  | 'other';

// ─── UnknownActionError ──────────────────────────────────────────────────────

/**
 * Custom error thrown when a broker action string cannot be mapped to a known TransactionType.
 */
export class UnknownActionError extends Error {
  public readonly rawAction: string;
  public readonly format: BrokerFormat;

  constructor(rawAction: string, format: BrokerFormat) {
    super(
      `Unknown action "${rawAction}" for format "${format}". Cannot map to a TransactionType.`,
    );
    this.name = 'UnknownActionError';
    this.rawAction = rawAction;
    this.format = format;
  }
}

// ─── Action Mapping Tables ───────────────────────────────────────────────────

/**
 * Schwab action string → TransactionType mapping (case-insensitive keys stored lowercase).
 */
const SCHWAB_ACTION_MAP: ReadonlyMap<string, TransactionType> = new Map([
  ['buy', 'buy'],
  ['sell', 'sell'],
  ['qual div', 'dividend'],
  ['non-qual div', 'dividend'],
  ['cash dividend', 'dividend'],
  ['reinvest shares', 'reinvestment'],
  ['reinvest dividend', 'reinvestment'],
  ['stock split', 'split'],
  ['journal', 'transfer'],
  ['wire funds', 'transfer'],
  ['moneylink transfer', 'transfer'],
  ['bank interest', 'interest'],
  ['misc cash entry', 'other'],
]);

/**
 * Robinhood action string → TransactionType mapping (case-insensitive keys stored lowercase).
 */
const ROBINHOOD_ACTION_MAP: ReadonlyMap<string, TransactionType> = new Map([
  ['buy', 'buy'],
  ['sell', 'sell'],
  ['div', 'dividend'],
  ['cdiv', 'dividend'],
  ['ach', 'transfer'],
  ['interest', 'interest'],
  ['int', 'interest'],
  // Additional Trans Code values seen in real Robinhood exports
  ['spl', 'split'],
  ['jnl', 'transfer'],
  ['itrf', 'transfer'],
  ['gold', 'fee'],
  ['fee', 'fee'],
  ['slip', 'other'],
  ['conv', 'transfer'],
  ['cil', 'other'],      // Cash In Lieu (fractional share liquidation)
  // Options Trans Codes
  ['sto', 'sell'],       // Sell To Open
  ['stc', 'sell'],       // Sell To Close
  ['bto', 'buy'],        // Buy To Open
  ['btc', 'buy'],        // Buy To Close
  ['spr', 'other'],      // Spread (multi-leg options order)
  ['oexp', 'other'],     // Option Expiration
  ['oasgn', 'other'],    // Option Assignment
  ['cxl', 'other'],      // Cancellation
]);

/**
 * Maps a raw broker action string to a canonical TransactionType.
 *
 * The matching is case-insensitive: both the input action and the lookup keys
 * are compared in lowercase.
 *
 * @param action - The raw action string from the CSV (e.g., "Buy", "SELL", "Qual Div")
 * @param format - The detected broker format, determines which mapping table to use
 * @returns The canonical TransactionType
 * @throws UnknownActionError if the action cannot be mapped for the given format
 */
export function mapActionToType(action: string, format: BrokerFormat): TransactionType {
  const normalizedAction = action.trim().toLowerCase();

  let actionMap: ReadonlyMap<string, TransactionType>;

  if (format === 'schwab_taxable' || format === 'schwab_roth_ira') {
    actionMap = SCHWAB_ACTION_MAP;
  } else if (format === 'robinhood_trad_ira') {
    actionMap = ROBINHOOD_ACTION_MAP;
  } else {
    throw new UnknownActionError(action, format);
  }

  const transactionType = actionMap.get(normalizedAction);

  if (transactionType === undefined) {
    // For any format, treat unknown actions as 'other' instead of throwing
    // (brokers have many obscure action strings — we don't want to block imports)
    return 'other';
  }

  return transactionType;
}

// ─── Amount Parsing ──────────────────────────────────────────────────────────

/**
 * Custom error thrown when an amount string cannot be parsed to a valid number.
 */
export class AmountParseError extends Error {
  public readonly rawValue: string;

  constructor(message: string, rawValue: string) {
    super(message);
    this.name = 'AmountParseError';
    this.rawValue = rawValue;
  }
}

/**
 * Parses a raw amount string into a numeric value.
 *
 * Handles:
 * - Dollar signs: "$1,234.56" → 1234.56
 * - Commas as thousand separators: "1,234,567.89" → 1234567.89
 * - Parenthesized negatives: "($1,234.56)" or "(1234.56)" → -1234.56
 * - Explicit negative sign: "-$1,234.56" → -1234.56
 * - Empty string or whitespace → 0
 * - Plain numbers: "1234" → 1234
 *
 * @param raw - The raw amount string from the CSV
 * @returns Parsed numeric value
 * @throws AmountParseError if the result is NaN after parsing
 */
export function parseAmount(raw: string): number {
  // Handle empty/whitespace-only input
  if (!raw || raw.trim().length === 0) {
    return 0;
  }

  let trimmed = raw.trim();

  // Detect parenthesized negatives: "(123.45)" or "($1,234.56)"
  let isNegative = false;
  if (trimmed.startsWith('(') && trimmed.endsWith(')')) {
    isNegative = true;
    trimmed = trimmed.slice(1, -1).trim();
  }

  // Detect explicit negative sign
  if (trimmed.startsWith('-')) {
    isNegative = true;
    trimmed = trimmed.slice(1).trim();
  }

  // Strip dollar signs and commas
  trimmed = trimmed.replace(/[$,]/g, '');

  // Parse the cleaned string to a number
  const value = parseFloat(trimmed);

  if (isNaN(value)) {
    throw new AmountParseError(
      `Unable to parse amount: "${raw}". Expected a numeric value, optionally with $, commas, or parenthesized negatives.`,
      raw,
    );
  }

  return isNegative ? -value : value;
}

/**
 * Custom error thrown when a date string cannot be normalized.
 */
export class DateNormalizationError extends Error {
  public readonly rawValue: string;

  constructor(message: string, rawValue: string) {
    super(message);
    this.name = 'DateNormalizationError';
    this.rawValue = rawValue;
  }
}

/** Regex matching MM/DD/YYYY format */
const MM_DD_YYYY_REGEX = /^(\d{2})\/(\d{2})\/(\d{4})$/;

/** Regex matching short date M/D/YY or M/DD/YY or MM/D/YY (1-2 digit month/day, 2-digit year) */
const SHORT_DATE_REGEX = /^(\d{1,2})\/(\d{1,2})\/(\d{2})$/;

/** Regex matching ISO 8601 date format YYYY-MM-DD */
const ISO_DATE_REGEX = /^(\d{4})-(\d{2})-(\d{2})$/;

/** Regex matching Schwab "as of" pattern: "MM/DD/YYYY as of MM/DD/YYYY" */
const AS_OF_REGEX = /^(\d{2}\/\d{2}\/\d{4})\s+as\s+of\s+\d{2}\/\d{2}\/\d{4}$/i;

/**
 * Normalizes a raw date string to ISO 8601 (YYYY-MM-DD) format.
 *
 * Handles:
 * - MM/DD/YYYY → YYYY-MM-DD conversion (Schwab format)
 * - "MM/DD/YYYY as of MM/DD/YYYY" → extracts the first date (transaction date)
 * - YYYY-MM-DD → passes through as-is (Robinhood format)
 *
 * @param raw - The raw date string from the CSV
 * @param format - Optional broker format hint (not currently needed for logic but available for future use)
 * @returns ISO 8601 date string (YYYY-MM-DD)
 * @throws DateNormalizationError for invalid or empty date strings
 */
export function normalizeDate(raw: string, _format?: BrokerFormat): string {
  // Guard against empty/whitespace-only input
  if (!raw || raw.trim().length === 0) {
    throw new DateNormalizationError(
      'Date string is empty or contains only whitespace',
      raw ?? '',
    );
  }

  const trimmed = raw.trim();

  // Check for "as of" pattern first (most specific match)
  const asOfMatch = trimmed.match(AS_OF_REGEX);
  if (asOfMatch) {
    // Use the first date (transaction date), which is before "as of"
    return convertMMDDYYYY(asOfMatch[1]!);
  }

  // Check for MM/DD/YYYY format
  const mmddMatch = trimmed.match(MM_DD_YYYY_REGEX);
  if (mmddMatch) {
    return convertMMDDYYYY(trimmed);
  }

  // Check for short date format M/D/YY (Robinhood uses this)
  const shortMatch = trimmed.match(SHORT_DATE_REGEX);
  if (shortMatch) {
    const month = parseInt(shortMatch[1]!, 10);
    const day = parseInt(shortMatch[2]!, 10);
    const shortYear = parseInt(shortMatch[3]!, 10);
    // Convert 2-digit year: 00-49 → 2000-2049, 50-99 → 1950-1999
    const year = shortYear < 50 ? 2000 + shortYear : 1900 + shortYear;
    validateDateComponents(year, month, day, trimmed);
    const mm = String(month).padStart(2, '0');
    const dd = String(day).padStart(2, '0');
    return `${year}-${mm}-${dd}`;
  }

  // Check for already-valid ISO format (YYYY-MM-DD)
  const isoMatch = trimmed.match(ISO_DATE_REGEX);
  if (isoMatch) {
    // Validate the date components are reasonable
    validateDateComponents(
      parseInt(isoMatch[1]!, 10),
      parseInt(isoMatch[2]!, 10),
      parseInt(isoMatch[3]!, 10),
      trimmed,
    );
    return trimmed;
  }

  throw new DateNormalizationError(
    `Unable to parse date: "${trimmed}". Expected MM/DD/YYYY, YYYY-MM-DD, or "MM/DD/YYYY as of MM/DD/YYYY" format.`,
    trimmed,
  );
}

/**
 * Converts a MM/DD/YYYY date string to ISO 8601 YYYY-MM-DD format.
 */
function convertMMDDYYYY(dateStr: string): string {
  const match = dateStr.match(MM_DD_YYYY_REGEX);
  if (!match) {
    throw new DateNormalizationError(
      `Invalid MM/DD/YYYY format: "${dateStr}"`,
      dateStr,
    );
  }

  const month = parseInt(match[1]!, 10);
  const day = parseInt(match[2]!, 10);
  const year = parseInt(match[3]!, 10);

  validateDateComponents(year, month, day, dateStr);

  const mm = match[1]!;
  const dd = match[2]!;
  const yyyy = match[3]!;

  return `${yyyy}-${mm}-${dd}`;
}

/**
 * Validates that date components form a reasonable date.
 */
function validateDateComponents(
  year: number,
  month: number,
  day: number,
  rawValue: string,
): void {
  if (month < 1 || month > 12) {
    throw new DateNormalizationError(
      `Invalid month ${month} in date: "${rawValue}"`,
      rawValue,
    );
  }

  if (day < 1 || day > 31) {
    throw new DateNormalizationError(
      `Invalid day ${day} in date: "${rawValue}"`,
      rawValue,
    );
  }

  if (year < 1900 || year > 2100) {
    throw new DateNormalizationError(
      `Invalid year ${year} in date: "${rawValue}"`,
      rawValue,
    );
  }

  // Check days in month (accounting for leap years)
  const daysInMonth = new Date(year, month, 0).getDate();
  if (day > daysInMonth) {
    throw new DateNormalizationError(
      `Invalid day ${day} for month ${month} in date: "${rawValue}"`,
      rawValue,
    );
  }
}


// ─── Column Mappings ─────────────────────────────────────────────────────────

/**
 * Column name mappings per broker format.
 */
const COLUMN_MAP = {
  schwab: {
    date: 'Date',
    action: 'Action',
    symbol: 'Symbol',
    description: 'Description',
    quantity: 'Quantity',
    price: 'Price',
    fees: 'Fees & Comm',
    amount: 'Amount',
  },
  schwab_ira: {
    date: 'Date',
    action: 'Action',
    symbol: 'Symbol',
    description: 'Description',
    quantity: 'Quantity',
    price: 'Price',
    fees: 'Fees & Comm',
    amount: 'Amount',
  },
  robinhood: {
    date: 'Activity Date',
    action: 'Trans Code',
    symbol: 'Instrument',
    description: 'Description',
    quantity: 'Quantity',
    price: 'Price',
    fees: 'Fees',
    amount: 'Amount',
  },
} as const;

/**
 * Resolves column mapping for a given broker format.
 */
function getColumnMap(format: BrokerFormat) {
  if (format === 'schwab_taxable') return COLUMN_MAP.schwab;
  if (format === 'schwab_roth_ira') return COLUMN_MAP.schwab_ira;
  return COLUMN_MAP.robinhood;
}

// ─── normalizeRecords ────────────────────────────────────────────────────────

/**
 * Orchestrates normalization of raw CSV rows into canonical NormalizedRecord objects.
 *
 * For each row:
 * 1. Normalizes the date to ISO 8601
 * 2. Maps the action string to a canonical TransactionType
 * 3. Extracts symbol, description, quantity, price, fees, and total amount
 * 4. Computes a placeholder hash (concatenation of canonical fields; real SHA-256 is task 4.1)
 *
 * @param rows - Array of raw CSV rows (each row is a Record<string, string>)
 * @param format - The detected broker format
 * @param accountId - The account ID to associate with all records
 * @returns Array of NormalizedRecord objects
 */
export function normalizeRecords(
  rows: Record<string, string>[],
  format: BrokerFormat,
  accountId: string,
): NormalizedRecord[] {
  const columns = getColumnMap(format);
  const records: NormalizedRecord[] = [];

  for (const row of rows) {
    const rawDate = row[columns.date] ?? '';
    const rawAction = row[columns.action] ?? '';
    const rawSymbol = row[columns.symbol] ?? '';
    const rawDescription = row[columns.description] ?? '';
    const rawQuantity = row[columns.quantity] ?? '';
    const rawPrice = row[columns.price] ?? '';
    const rawFees = row[columns.fees] ?? '';
    const rawAmount = row[columns.amount] ?? '';

    // Skip rows with no date or action (e.g., empty trailing rows, summary rows)
    if (!rawDate.trim() || !rawAction.trim()) {
      continue;
    }

    const transactionDate = normalizeDate(rawDate, format);
    const transactionType = mapActionToType(rawAction, format);
    const symbol = rawSymbol.trim() || undefined;
    const description = rawDescription.trim();
    const quantity = rawQuantity.trim() ? parseAmount(rawQuantity) : undefined;
    const pricePerUnit = rawPrice.trim() ? parseAmount(rawPrice) : undefined;
    const fees = rawFees.trim() ? parseAmount(rawFees) : undefined;
    const totalAmount = parseAmount(rawAmount);

    // Placeholder hash: concatenation of canonical fields (real SHA-256 in task 4.1)
    const hash = [
      accountId,
      transactionDate,
      transactionType,
      symbol ?? '',
      quantity?.toString() ?? '',
      totalAmount.toString(),
    ].join('|');

    records.push({
      hash,
      account_id: accountId,
      transaction_date: transactionDate,
      transaction_type: transactionType,
      symbol,
      description,
      quantity,
      price_per_unit: pricePerUnit,
      total_amount: totalAmount,
      fees,
      source_format: format,
      raw_action: rawAction.trim(),
    });
  }

  return records;
}
