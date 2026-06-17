/**
 * Option Symbol Parser
 *
 * Parses option symbols from Schwab and Robinhood (OCC) formats into
 * a canonical ParsedOption structure.
 *
 * Schwab format: "SYMBOL MM/DD/YYYY STRIKE.XX C|P"
 *   e.g. "SPX 01/19/2024 4800.00 P"
 *
 * Robinhood OCC format: "SYMBOL(1-6 chars)YYMMDD(C|P)SSSSSSSS"
 *   where strike is strike*1000 zero-padded to 8 digits
 *   e.g. "SPX240119P04800000"
 */

export interface ParsedOption {
  underlying: string;
  expiration: string; // ISO 8601 date (YYYY-MM-DD)
  strike: number;
  type: 'call' | 'put';
}

export class OptionParseError extends Error {
  public readonly rawValue: string;

  constructor(rawValue: string, message?: string) {
    super(message ?? `Unable to parse option symbol: "${rawValue}"`);
    this.name = 'OptionParseError';
    this.rawValue = rawValue;
  }
}

/**
 * Regex for Schwab format: SYMBOL MM/DD/YYYY STRIKE C|P
 * - Underlying: one or more non-space chars
 * - Date: MM/DD/YYYY
 * - Strike: digits with optional decimal
 * - Type: C or P (case-insensitive)
 */
const SCHWAB_REGEX =
  /^(\S+)\s+(\d{2})\/(\d{2})\/(\d{4})\s+([\d.]+)\s+([CPcp])$/;

/**
 * Regex for Robinhood OCC format: SYMBOL(1-6)YYMMDD(C|P)SSSSSSSS
 * - Underlying: 1-6 uppercase alpha chars
 * - Date: YYMMDD (6 digits)
 * - Type: C or P
 * - Strike: 8 digits (strike * 1000, zero-padded)
 */
const OCC_REGEX = /^([A-Z]{1,6})(\d{6})([CP])(\d{8})$/;

function parseSchwab(raw: string): ParsedOption {
  const match = raw.match(SCHWAB_REGEX);
  if (!match) {
    throw new OptionParseError(raw, `Not a valid Schwab option symbol: "${raw}"`);
  }

  const [, underlying, month, day, year, strikeStr, typeChar] = match;

  const expiration = `${year}-${month}-${day}`;
  const strike = parseFloat(strikeStr!);
  const type: 'call' | 'put' = typeChar!.toUpperCase() === 'C' ? 'call' : 'put';

  return { underlying: underlying!, expiration, strike, type };
}

function parseOCC(raw: string): ParsedOption {
  const match = raw.match(OCC_REGEX);
  if (!match) {
    throw new OptionParseError(raw, `Not a valid OCC option symbol: "${raw}"`);
  }

  const [, underlying, dateStr, typeChar, strikeStr] = match;

  const yy = dateStr!.slice(0, 2);
  const mm = dateStr!.slice(2, 4);
  const dd = dateStr!.slice(4, 6);
  const expiration = `20${yy}-${mm}-${dd}`;

  const strike = parseInt(strikeStr!, 10) / 1000;
  const type: 'call' | 'put' = typeChar === 'C' ? 'call' : 'put';

  return { underlying: underlying!, expiration, strike, type };
}

/**
 * Detects whether a raw string matches the Schwab or OCC format.
 * Returns 'schwab' if it contains spaces (space-separated fields),
 * 'robinhood' if it matches the compact OCC pattern.
 */
function detectFormat(raw: string): 'schwab' | 'robinhood' {
  if (raw.includes(' ')) {
    return 'schwab';
  }
  return 'robinhood';
}

/**
 * Parse an option symbol string into its component parts.
 *
 * @param raw - The raw option symbol string
 * @param format - Optional format hint ('schwab' or 'robinhood'). Auto-detected if omitted.
 * @returns ParsedOption with underlying, expiration (ISO), strike, and type
 * @throws OptionParseError if the symbol cannot be parsed
 */
export function parseOptionSymbol(
  raw: string,
  format?: 'schwab' | 'robinhood'
): ParsedOption {
  const trimmed = raw.trim();

  if (!trimmed) {
    throw new OptionParseError(raw);
  }

  const resolvedFormat = format ?? detectFormat(trimmed);

  if (resolvedFormat === 'schwab') {
    return parseSchwab(trimmed);
  }

  return parseOCC(trimmed);
}
