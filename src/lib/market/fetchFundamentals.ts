/**
 * Fetches fundamental stock data from Alpha Vantage OVERVIEW endpoint.
 * Results are cached in localStorage for 24 hours to minimize API calls.
 */

export interface StockFundamentals {
  symbol: string;
  peRatio: number | null;
  dividendYield: number | null; // as percentage (e.g., 2.5 for 2.5%)
  exDividendDate: string | null; // ISO date string
  fiftyTwoWeekHigh: number | null;
  fiftyTwoWeekLow: number | null;
}

// Cache fundamentals in localStorage for 7 days (data doesn't change daily)
const CACHE_KEY = 'stock_fundamentals_cache';
const CACHE_TTL = 7 * 24 * 60 * 60 * 1000; // 7 days

interface FundamentalsCache {
  timestamp: number;
  data: Record<string, StockFundamentals>;
}

export async function fetchFundamentals(
  symbols: string[]
): Promise<Map<string, StockFundamentals>> {
  // Check localStorage cache first
  const cached = getCachedFundamentals();
  const uniqueSymbols = [...new Set(symbols)];

  // If all symbols are cached and fresh, return from cache
  if (cached && isCacheFresh(cached.timestamp)) {
    const allCached = uniqueSymbols.every((s) => cached.data[s]);
    if (allCached) {
      const result = new Map<string, StockFundamentals>();
      uniqueSymbols.forEach((s) => {
        const entry = cached.data[s];
        if (entry) result.set(s, entry);
      });
      return result;
    }
  }

  // Fetch from Alpha Vantage OVERVIEW endpoint
  const apiKey = import.meta.env.VITE_ALPHA_VANTAGE_KEY;
  const result = new Map<string, StockFundamentals>();

  // Only fetch symbols not in cache
  const toFetch =
    cached && isCacheFresh(cached.timestamp)
      ? uniqueSymbols.filter((s) => !cached.data[s])
      : uniqueSymbols;

  for (const symbol of toFetch) {
    try {
      // SPX/index symbols and ETFs (VGT, IVV, VOOG, etc.) don't work on Alpha Vantage OVERVIEW
      // Use Yahoo Finance fallback for these
      const etfSymbols = ['VGT', 'IVV', 'VOOG', 'SPY', 'QQQ', 'QYLD', 'RYLD', 'SLVO', 'TQQQ'];
      if (symbol.toUpperCase() === 'SPX' || etfSymbols.includes(symbol.toUpperCase())) {
        const yahooSym = symbol.toUpperCase() === 'SPX' ? '^GSPC' : symbol;
        const yahooFund = await fetchFundamentalsFromYahoo(yahooSym, symbol);
        if (yahooFund) {
          result.set(symbol, yahooFund);
          continue;
        }
      }

      const url = `https://www.alphavantage.co/query?function=OVERVIEW&symbol=${symbol}&apikey=${apiKey}`;
      const response = await fetch(url, { signal: AbortSignal.timeout(8000) });
      if (!response.ok) continue;
      const data = await response.json();

      // Alpha Vantage returns empty object {} if rate limited or invalid
      if (!data.Symbol) continue;

      result.set(symbol, {
        symbol,
        peRatio:
          data.PERatio && data.PERatio !== 'None'
            ? parseFloat(data.PERatio)
            : null,
        dividendYield:
          data.DividendYield &&
          data.DividendYield !== 'None' &&
          data.DividendYield !== '0'
            ? parseFloat(data.DividendYield) * 100
            : null,
        exDividendDate:
          data.ExDividendDate && data.ExDividendDate !== 'None'
            ? data.ExDividendDate
            : null,
        fiftyTwoWeekHigh:
          data['52WeekHigh'] && data['52WeekHigh'] !== 'None'
            ? parseFloat(data['52WeekHigh'])
            : null,
        fiftyTwoWeekLow:
          data['52WeekLow'] && data['52WeekLow'] !== 'None'
            ? parseFloat(data['52WeekLow'])
            : null,
      });
    } catch {
      continue;
    }
  }

  // Merge with existing cache and save
  const mergedData: Record<string, StockFundamentals> = cached?.data ?? {};
  result.forEach((v, k) => {
    mergedData[k] = v;
  });
  saveFundamentalsCache(mergedData);

  // Return all requested symbols
  const finalResult = new Map<string, StockFundamentals>();
  uniqueSymbols.forEach((s) => {
    if (mergedData[s]) finalResult.set(s, mergedData[s]);
  });
  return finalResult;
}

function getCachedFundamentals(): FundamentalsCache | null {
  try {
    const raw = localStorage.getItem(CACHE_KEY);
    if (!raw) return null;
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

function isCacheFresh(timestamp: number): boolean {
  return Date.now() - timestamp < CACHE_TTL;
}

function saveFundamentalsCache(data: Record<string, StockFundamentals>): void {
  try {
    localStorage.setItem(
      CACHE_KEY,
      JSON.stringify({ timestamp: Date.now(), data })
    );
  } catch {
    /* localStorage full or unavailable */
  }
}

/**
 * Fetches 52-week high/low from Yahoo Finance chart API for index symbols.
 */
async function fetchFundamentalsFromYahoo(
  yahooSymbol: string,
  displaySymbol: string
): Promise<StockFundamentals | null> {
  try {
    const url = `https://corsproxy.io/?${encodeURIComponent(
      `https://query1.finance.yahoo.com/v8/finance/chart/${yahooSymbol}?interval=1d&range=1y`
    )}`;
    const response = await fetch(url, { signal: AbortSignal.timeout(8000) });
    if (!response.ok) return null;

    const data = await response.json();
    const meta = data?.chart?.result?.[0]?.meta;
    if (!meta) return null;

    // Try to get dividend yield from meta (Yahoo provides trailingAnnualDividendYield for some)
    const divYield = meta.trailingAnnualDividendYield
      ? meta.trailingAnnualDividendYield * 100
      : null;

    return {
      symbol: displaySymbol,
      peRatio: null, // Yahoo chart API doesn't provide P/E directly
      dividendYield: divYield,
      exDividendDate: null, // Not available from chart endpoint
      fiftyTwoWeekHigh: meta.fiftyTwoWeekHigh ?? null,
      fiftyTwoWeekLow: meta.fiftyTwoWeekLow ?? null,
    };
  } catch {
    return null;
  }
}
