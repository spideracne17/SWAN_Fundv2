/**
 * Stock Price Fetcher — Optimized
 *
 * Strategy:
 * 1. Yahoo Finance as PRIMARY (no daily limit via CORS proxy)
 * 2. Alpha Vantage as FALLBACK only
 * 3. localStorage cache with 24-hour TTL (survives page refresh)
 * 4. Parallel fetching for multiple symbols
 */

const CORS_PROXY = 'https://corsproxy.io/?';
const ALPHA_VANTAGE_KEY = import.meta.env.VITE_ALPHA_VANTAGE_KEY as string | undefined;
const PRICE_CACHE_KEY = 'stock_prices_cache';
const PRICE_CACHE_TTL = 24 * 60 * 60 * 1000; // 24 hours

export interface StockPrice {
  symbol: string;
  price: number;
  previousClose: number;
  change: number;
  changePercent: number;
}

/* ─── Cache (localStorage) ─────────────────────────────────────────────── */

interface PriceCache {
  timestamp: number;
  prices: Record<string, number>;
}

function getCachedPrices(): PriceCache | null {
  try {
    const raw = localStorage.getItem(PRICE_CACHE_KEY);
    if (!raw) return null;
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

function savePriceCache(prices: Record<string, number>): void {
  try {
    localStorage.setItem(PRICE_CACHE_KEY, JSON.stringify({ timestamp: Date.now(), prices }));
  } catch { /* full */ }
}

function isCacheFresh(timestamp: number): boolean {
  return Date.now() - timestamp < PRICE_CACHE_TTL;
}

/* ─── Yahoo Finance (Primary) ──────────────────────────────────────────── */

async function fetchFromYahoo(symbol: string): Promise<StockPrice | null> {
  // Map special symbols
  const yahooSymbol = symbol === 'SPX' ? '^GSPC' : symbol;

  try {
    const url = `${CORS_PROXY}${encodeURIComponent(
      `https://query1.finance.yahoo.com/v8/finance/chart/${yahooSymbol}?interval=1d&range=1d`
    )}`;
    const response = await fetch(url, { signal: AbortSignal.timeout(8000) });
    if (!response.ok) return null;

    const data = await response.json();
    const meta = data?.chart?.result?.[0]?.meta;
    if (!meta?.regularMarketPrice) return null;

    const price = meta.regularMarketPrice;
    const previousClose = meta.chartPreviousClose ?? meta.previousClose ?? price;

    return {
      symbol, // Return original symbol name
      price,
      previousClose,
      change: price - previousClose,
      changePercent: previousClose > 0 ? ((price - previousClose) / previousClose) * 100 : 0,
    };
  } catch {
    return null;
  }
}

/* ─── Alpha Vantage (Fallback only) ───────────────────────────────────── */

async function fetchFromAlphaVantage(symbol: string): Promise<StockPrice | null> {
  if (!ALPHA_VANTAGE_KEY) return null;

  try {
    const url = `https://www.alphavantage.co/query?function=GLOBAL_QUOTE&symbol=${symbol}&apikey=${ALPHA_VANTAGE_KEY}`;
    const response = await fetch(url, { signal: AbortSignal.timeout(8000) });
    if (!response.ok) return null;

    const data = await response.json();
    const quote = data?.['Global Quote'];
    if (!quote || !quote['05. price']) return null;

    const price = parseFloat(quote['05. price']);
    if (price <= 0) return null;

    return {
      symbol,
      price,
      previousClose: parseFloat(quote['08. previous close'] || '0'),
      change: parseFloat(quote['09. change'] || '0'),
      changePercent: parseFloat((quote['10. change percent'] || '0').replace('%', '')),
    };
  } catch {
    return null;
  }
}

/* ─── Fetch Single Price (Yahoo first, AV fallback) ────────────────────── */

async function fetchSinglePrice(symbol: string): Promise<StockPrice | null> {
  const yahooResult = await fetchFromYahoo(symbol);
  if (yahooResult) return yahooResult;
  return fetchFromAlphaVantage(symbol);
}

/* ─── Public API ───────────────────────────────────────────────────────── */

/**
 * Fetches current prices for multiple symbols.
 * Uses localStorage cache (24h). Only fetches uncached symbols.
 * Yahoo Finance primary, Alpha Vantage fallback.
 */
export async function fetchStockPrices(symbols: string[]): Promise<Map<string, number>> {
  const uniqueSymbols = [...new Set(symbols)];
  const cached = getCachedPrices();
  const result = new Map<string, number>();

  // If cache is fresh, return cached values for symbols we have
  if (cached && isCacheFresh(cached.timestamp)) {
    const missing: string[] = [];
    for (const sym of uniqueSymbols) {
      if (cached.prices[sym] !== undefined) {
        result.set(sym, cached.prices[sym]!);
      } else {
        missing.push(sym);
      }
    }
    if (missing.length === 0) return result;
    // Only fetch missing symbols
    const fetched = await fetchMultiple(missing);
    for (const [sym, price] of fetched) {
      result.set(sym, price);
      cached.prices[sym] = price;
    }
    savePriceCache(cached.prices);
    return result;
  }

  // Cache expired or doesn't exist — fetch all
  const fetched = await fetchMultiple(uniqueSymbols);
  const allPrices: Record<string, number> = cached?.prices ?? {};
  for (const [sym, price] of fetched) {
    result.set(sym, price);
    allPrices[sym] = price;
  }
  savePriceCache(allPrices);
  return result;
}

/**
 * Fetch multiple symbols in parallel.
 */
async function fetchMultiple(symbols: string[]): Promise<Map<string, number>> {
  const results = await Promise.allSettled(
    symbols.map((sym) => fetchSinglePrice(sym))
  );

  const prices = new Map<string, number>();
  for (const result of results) {
    if (result.status === 'fulfilled' && result.value) {
      prices.set(result.value.symbol, result.value.price);
    }
  }
  return prices;
}

/**
 * Fetches detailed price info for multiple symbols.
 */
export async function fetchDetailedPrices(symbols: string[]): Promise<StockPrice[]> {
  const results = await Promise.allSettled(
    [...new Set(symbols)].map((sym) => fetchSinglePrice(sym))
  );

  return results
    .filter((r): r is PromiseFulfilledResult<StockPrice> => r.status === 'fulfilled' && r.value !== null)
    .map((r) => r.value);
}
