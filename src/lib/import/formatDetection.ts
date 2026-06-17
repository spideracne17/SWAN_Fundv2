import type { BrokerFormat } from '@/types/database';

/**
 * Custom error thrown when CSV headers don't match any known broker format.
 * Includes the detected headers for diagnostic purposes.
 */
export class FormatDetectionError extends Error {
  public readonly detectedHeaders: string[];

  constructor(message: string, detectedHeaders: string[] = []) {
    super(
      detectedHeaders.length > 0
        ? `${message}: [${detectedHeaders.join(', ')}]`
        : message,
    );
    this.name = 'FormatDetectionError';
    this.detectedHeaders = detectedHeaders;
  }
}

/**
 * Detects the broker format from a CSV header row.
 *
 * - Schwab Taxable: has "Action", "Symbol", and "Fees & Comm" columns
 * - Schwab Roth IRA: has "Action" and "Symbol" but no "Fees & Comm"
 * - Robinhood Traditional IRA: has "Activity Type" and "Instrument" columns
 *
 * @param headerRow - The first row of the CSV as a string array
 * @returns The detected BrokerFormat
 * @throws FormatDetectionError if no known format matches
 */
export function detectBrokerFormat(headerRow: string[]): BrokerFormat {
  const normalized = headerRow.map((h) => h.trim().toLowerCase());

  // Schwab format detection: has "Action" and "Symbol" columns
  if (normalized.includes('action') && normalized.includes('symbol')) {
    // Distinguish taxable vs IRA by presence of "Fees & Comm" column
    if (normalized.includes('fees & comm')) {
      return 'schwab_taxable';
    }
    return 'schwab_roth_ira';
  }

  // Robinhood format: has "Instrument" column with either "Activity Type" or "Trans Code"
  if (
    normalized.includes('instrument') &&
    (normalized.includes('activity type') || normalized.includes('trans code'))
  ) {
    return 'robinhood_trad_ira';
  }

  throw new FormatDetectionError(
    'Unable to detect CSV format from headers',
    headerRow,
  );
}
