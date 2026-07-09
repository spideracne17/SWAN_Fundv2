/**
 * Schwab Data Service — Fallback-Aware
 *
 * Tries Schwab API first, falls back to Yahoo/Alpha Vantage/localStorage.
 * Never throws — always returns data (live or fallback).
 *
 * Priority:
 *   1. Schwab API (real-time, when connected)
 *   2. Yahoo Finance / Alpha Vantage (existing market data layer)
 *   3. localStorage cached values (last known good)
 *   4. Settings defaults (hardcoded fallback)
 */

import { getValidToken } from './tokenManager';
import { getAllAccountsWithPositions, getQuotes, type SchwabAccountDetails, type SchwabQuote, SchwabApiError } from './client';
import { fetchStockPrices } from '@/lib/market/fetchStockPrices';
import { loadLocalSettings } from '@/lib/dividendEngine/localSettings';

export type DataSource = 'schwab' | 'yahoo' | 'alpha_vantage' | 'cache' | 'default';

export interface DataResult<T> {
  data: T;
  source: DataSource;
  timestamp: number;
  error?: string;
}

/* ─── Token helpers for dual-app setup ─────────────────────────────────── */

const TRADING_TOKENS_KEY = 'schwab_trading_tokens';

function loadTradingTokens(): { access_token: string; expires_at: number; refresh_token: string; obtained_at: number } | null {
  try {
    const raw = localStorage.getItem(TRADING_TOKENS_KEY);
    if (!raw) return null;
    return JSON.parse(raw);
  } catch { return null; }
}

async function getValidTradingToken(): Promise<string | null> {
  // Try to load from Vite middleware (handles refresh)
  try {
    const resp = await fetch('/schwab-trading-tokens.json');
    if (resp.ok) {
      const tokens = await resp.json();
      if (tokens.access_token) {
        localStorage.setItem(TRADING_TOKENS_KEY, JSON.stringify(tokens));
        return tokens.access_token;
      }
    }
  } catch { /* fall through */ }

  // Try localStorage
  const tokens = loadTradingTokens();
  if (tokens && Date.now() < tokens.expires_at - 60000) {
    return tokens.access_token;
  }

  return null;
}

/* ─── Account Value ────────────────────────────────────────────────────── */

export interface AccountSummary {
  totalValue: number;
  accounts: {
    accountNumber: string;
    type: string;
    value: number;
    cashBalance: number;
    buyingPower: number;
  }[];
}

const ACCOUNT_CACHE_KEY = 'schwab_account_cache';

/**
 * Get account value — Schwab first, localStorage setting fallback.
 */
export async function getAccountValue(): Promise<DataResult<AccountSummary>> {
  // Try Schwab Trading API
  try {
    const token = await getValidTradingToken();
    if (token) {
      const BASE = import.meta.env.DEV ? '/schwab-api' : 'https://api.schwabapi.com';
      const response = await fetch(`${BASE}/trader/v1/accounts?fields=positions`, {
        headers: { 'Authorization': `Bearer ${token}`, 'Accept': 'application/json' },
        signal: AbortSignal.timeout(15000),
      });

      if (response.ok) {
        const accounts: SchwabAccountDetails[] = await response.json();
        const summary = mapAccountData(accounts);

        localStorage.setItem(ACCOUNT_CACHE_KEY, JSON.stringify({ data: summary, timestamp: Date.now() }));
        return { data: summary, source: 'schwab', timestamp: Date.now() };
      }
    }
  } catch (err) {
    console.warn('Schwab account fetch failed, using fallback:', err instanceof Error ? err.message : err);
  }

  // Try cached Schwab data
  try {
    const cached = localStorage.getItem(ACCOUNT_CACHE_KEY);
    if (cached) {
      const { data, timestamp } = JSON.parse(cached);
      return { data, source: 'cache', timestamp, error: 'Using cached Schwab data' };
    }
  } catch { /* ignore */ }

  // Fall back to localStorage settings
  const settings = loadLocalSettings();
  const fallback: AccountSummary = {
    totalValue: settings.spreadsAccountValue,
    accounts: [{
      accountNumber: '...0626',
      type: 'Taxable',
      value: settings.spreadsAccountValue,
      cashBalance: 0,
      buyingPower: 0,
    }],
  };

  return { data: fallback, source: 'default', timestamp: Date.now(), error: 'No Schwab connection — using Settings value' };
}

function mapAccountData(accounts: SchwabAccountDetails[]): AccountSummary {
  const mapped = accounts.map((a) => ({
    accountNumber: a.securitiesAccount.accountNumber,
    type: a.securitiesAccount.type,
    value: a.securitiesAccount.currentBalances?.cashBalance ?? a.securitiesAccount.currentBalances?.liquidationValue ?? 0,
    cashBalance: a.securitiesAccount.currentBalances?.cashBalance ?? 0,
    buyingPower: a.securitiesAccount.currentBalances?.buyingPower ?? 0,
  }));

  // For totalValue, use the spreads account (0626) cash balance if available
  const spreadsAcct = mapped.find(a => a.accountNumber.endsWith('0626') || a.accountNumber.endsWith('1626'));
  const totalValue = spreadsAcct?.cashBalance ?? mapped.reduce((sum, a) => sum + a.value, 0);

  return {
    totalValue,
    accounts: mapped,
  };
}

/* ─── Stock Prices ─────────────────────────────────────────────────────── */

const PRICE_CACHE_KEY = 'schwab_prices_cache';

/**
 * Get stock prices — Schwab first, Yahoo fallback, localStorage cache last.
 */
export async function getStockPrices(symbols: string[]): Promise<DataResult<Map<string, number>>> {
  // Try Schwab
  try {
    const token = await getValidToken();
    if (token) {
      const quotes = await getQuotes(symbols);
      const prices = new Map<string, number>();
      for (const [sym, data] of Object.entries(quotes)) {
        if (data?.quote?.lastPrice) {
          prices.set(sym, data.quote.lastPrice);
        }
      }

      if (prices.size > 0) {
        // Cache
        const cacheObj: Record<string, number> = {};
        prices.forEach((v, k) => { cacheObj[k] = v; });
        localStorage.setItem(PRICE_CACHE_KEY, JSON.stringify({ data: cacheObj, timestamp: Date.now() }));

        return { data: prices, source: 'schwab', timestamp: Date.now() };
      }
    }
  } catch (err) {
    console.warn('Schwab quotes failed, trying Yahoo:', err instanceof Error ? err.message : err);
  }

  // Try Yahoo Finance (existing implementation)
  try {
    const prices = await fetchStockPrices(symbols);
    if (prices.size > 0) {
      return { data: prices, source: 'yahoo', timestamp: Date.now() };
    }
  } catch (err) {
    console.warn('Yahoo prices failed:', err instanceof Error ? err.message : err);
  }

  // Try cache
  try {
    const cached = localStorage.getItem(PRICE_CACHE_KEY);
    if (cached) {
      const { data, timestamp } = JSON.parse(cached);
      const prices = new Map<string, number>(Object.entries(data));
      return { data: prices, source: 'cache', timestamp, error: 'Using cached prices' };
    }
  } catch { /* ignore */ }

  // Empty fallback
  return { data: new Map(), source: 'default', timestamp: Date.now(), error: 'No price data available' };
}

/* ─── Quotes with Fundamentals ─────────────────────────────────────────── */

export interface EnrichedQuote {
  symbol: string;
  price: number;
  fiftyTwoWeekHigh: number;
  fiftyTwoWeekLow: number;
  peRatio: number | null;
  divYield: number | null;
}

/**
 * Get enriched quotes (price + fundamentals) — Schwab first, existing fallback.
 */
export async function getEnrichedQuotes(symbols: string[]): Promise<DataResult<Map<string, EnrichedQuote>>> {
  // Try Schwab
  try {
    const token = await getValidToken();
    if (token) {
      const quotes = await getQuotes(symbols);
      const enriched = new Map<string, EnrichedQuote>();

      for (const [sym, data] of Object.entries(quotes)) {
        if (data?.quote) {
          const q = data.quote;
          enriched.set(sym, {
            symbol: sym,
            price: q.lastPrice,
            fiftyTwoWeekHigh: q.fiftyTwoWeekHigh,
            fiftyTwoWeekLow: q.fiftyTwoWeekLow,
            peRatio: q.peRatio ?? null,
            divYield: q.divYield ?? null,
          });
        }
      }

      if (enriched.size > 0) {
        return { data: enriched, source: 'schwab', timestamp: Date.now() };
      }
    }
  } catch (err) {
    console.warn('Schwab enriched quotes failed:', err instanceof Error ? err.message : err);
  }

  // Fallback: return empty and let existing Yahoo/AV code handle it
  return { data: new Map(), source: 'default', timestamp: Date.now(), error: 'Schwab unavailable — using existing data sources' };
}

/* ─── Connection Status ────────────────────────────────────────────────── */

/**
 * Quick check if Schwab is available (has valid token).
 */
export async function isSchwabAvailable(): Promise<boolean> {
  try {
    const token = await getValidToken();
    return token !== null;
  } catch {
    return false;
  }
}
