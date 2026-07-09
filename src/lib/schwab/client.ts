/**
 * Schwab API Client
 *
 * Authenticated HTTP client for the Schwab Individual Trader API.
 * All methods auto-refresh tokens when needed.
 *
 * Rate limit: 120 requests/minute
 *
 * Endpoints used:
 * - GET /trader/v1/accounts (account balances)
 * - GET /trader/v1/accounts/{accountHash}/orders (orders)
 * - GET /marketdata/v1/quotes (real-time quotes)
 * - GET /marketdata/v1/chains (option chains)
 * - GET /marketdata/v1/pricehistory (price history)
 */

import { getValidToken } from './tokenManager';

const BASE_URL = import.meta.env.DEV ? '/schwab-api' : 'https://api.schwabapi.com';

export class SchwabApiError extends Error {
  constructor(public status: number, message: string) {
    super(message);
    this.name = 'SchwabApiError';
  }
}

/**
 * Make an authenticated request to the Schwab API.
 */
async function schwabFetch<T>(endpoint: string, options?: RequestInit): Promise<T> {
  const token = await getValidToken();
  if (!token) {
    throw new SchwabApiError(401, 'No valid Schwab token. Run: node schwab/auth.mjs');
  }

  const response = await fetch(`${BASE_URL}${endpoint}`, {
    ...options,
    headers: {
      'Authorization': `Bearer ${token}`,
      'Accept': 'application/json',
      ...(options?.headers ?? {}),
    },
    signal: AbortSignal.timeout(15000),
  });

  if (!response.ok) {
    const body = await response.text().catch(() => '');
    throw new SchwabApiError(response.status, `Schwab API error ${response.status}: ${body}`);
  }

  return response.json();
}

/* ─── Types ────────────────────────────────────────────────────────────── */

export interface SchwabAccount {
  accountNumber: string;
  hashValue: string;
}

export interface SchwabAccountDetails {
  securitiesAccount: {
    accountNumber: string;
    type: string;
    roundTrips: number;
    isDayTrader: boolean;
    currentBalances: {
      liquidationValue: number;
      cashBalance: number;
      availableFunds: number;
      buyingPower: number;
      maintenanceRequirement: number;
    };
    positions?: SchwabPosition[];
  };
}

export interface SchwabPosition {
  shortQuantity: number;
  averagePrice: number;
  currentDayProfitLoss: number;
  currentDayProfitLossPercentage: number;
  longQuantity: number;
  settledLongQuantity: number;
  settledShortQuantity: number;
  marketValue: number;
  instrument: {
    assetType: string;
    cusip: string;
    symbol: string;
    description?: string;
    type?: string;
    putCall?: string;
    underlyingSymbol?: string;
  };
  maintenanceRequirement: number;
  currentDayCost: number;
  previousSessionLongQuantity: number;
}

export interface SchwabQuote {
  symbol: string;
  lastPrice: number;
  bidPrice: number;
  askPrice: number;
  highPrice: number;
  lowPrice: number;
  closePrice: number;
  netChange: number;
  netPercentChange: number;
  totalVolume: number;
  fiftyTwoWeekHigh: number;
  fiftyTwoWeekLow: number;
  peRatio?: number;
  divYield?: number;
}

export interface SchwabOptionChain {
  symbol: string;
  status: string;
  underlying: { symbol: string; last: number; };
  callExpDateMap: Record<string, Record<string, SchwabOptionContract[]>>;
  putExpDateMap: Record<string, Record<string, SchwabOptionContract[]>>;
}

export interface SchwabOptionContract {
  putCall: string;
  symbol: string;
  description: string;
  bid: number;
  ask: number;
  last: number;
  mark: number;
  delta: number;
  gamma: number;
  theta: number;
  vega: number;
  strikePrice: number;
  expirationDate: string;
  daysToExpiration: number;
  openInterest: number;
  volume: number;
  inTheMoney: boolean;
}

/* ─── API Methods ──────────────────────────────────────────────────────── */

/**
 * Get list of linked accounts.
 */
export async function getAccounts(): Promise<SchwabAccount[]> {
  return schwabFetch<SchwabAccount[]>('/trader/v1/accounts/accountNumbers');
}

/**
 * Get account details including positions and balances.
 */
export async function getAccountDetails(accountHash: string): Promise<SchwabAccountDetails> {
  return schwabFetch<SchwabAccountDetails>(`/trader/v1/accounts/${accountHash}?fields=positions`);
}

/**
 * Get all accounts with positions.
 */
export async function getAllAccountsWithPositions(): Promise<SchwabAccountDetails[]> {
  return schwabFetch<SchwabAccountDetails[]>('/trader/v1/accounts?fields=positions');
}

/**
 * Get real-time quotes for symbols.
 */
export async function getQuotes(symbols: string[]): Promise<Record<string, { quote: SchwabQuote }>> {
  const symbolList = symbols.join(',');
  return schwabFetch<Record<string, { quote: SchwabQuote }>>(`/marketdata/v1/quotes?symbols=${encodeURIComponent(symbolList)}`);
}

/**
 * Get option chain for a symbol.
 */
export async function getOptionChain(
  symbol: string,
  options?: {
    contractType?: 'CALL' | 'PUT' | 'ALL';
    strikeCount?: number;
    range?: 'ITM' | 'OTM' | 'NTM' | 'ALL';
    fromDate?: string;
    toDate?: string;
    daysToExpiration?: number;
  }
): Promise<SchwabOptionChain> {
  const params = new URLSearchParams({ symbol });
  if (options?.contractType) params.set('contractType', options.contractType);
  if (options?.strikeCount) params.set('strikeCount', String(options.strikeCount));
  if (options?.range) params.set('range', options.range);
  if (options?.fromDate) params.set('fromDate', options.fromDate);
  if (options?.toDate) params.set('toDate', options.toDate);

  return schwabFetch<SchwabOptionChain>(`/marketdata/v1/chains?${params.toString()}`);
}

/**
 * Get price history for a symbol.
 */
export async function getPriceHistory(
  symbol: string,
  options?: {
    periodType?: 'day' | 'month' | 'year' | 'ytd';
    period?: number;
    frequencyType?: 'minute' | 'daily' | 'weekly' | 'monthly';
    frequency?: number;
  }
): Promise<{ candles: { open: number; high: number; low: number; close: number; volume: number; datetime: number }[] }> {
  const params = new URLSearchParams({ symbol });
  if (options?.periodType) params.set('periodType', options.periodType);
  if (options?.period) params.set('period', String(options.period));
  if (options?.frequencyType) params.set('frequencyType', options.frequencyType);
  if (options?.frequency) params.set('frequency', String(options.frequency));

  return schwabFetch(`/marketdata/v1/pricehistory?${params.toString()}`);
}
