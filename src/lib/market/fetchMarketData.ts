import type { MarketSnapshot } from './calculateMarketColor';

/**
 * Error class for market data fetch failures.
 */
export class MarketDataError extends Error {
  public readonly statusCode?: number;
  public readonly cause?: unknown;

  constructor(message: string, options?: { statusCode?: number; cause?: unknown }) {
    super(message);
    this.name = 'MarketDataError';
    this.statusCode = options?.statusCode;
    this.cause = options?.cause;
  }
}

/**
 * Result of a market data fetch attempt.
 * When `stale` is true, the data could not be fetched and the snapshot
 * contains the last known values (or undefined if never fetched).
 */
export interface MarketDataResult {
  snapshot: MarketSnapshot | null;
  stale: boolean;
  error?: MarketDataError;
}

/**
 * Fetches market data (VIX level, SPX price, SPX 50DMA, SPX 200DMA) from
 * a configurable data source.
 *
 * Strategy:
 * - Primary: Uses the VITE_MARKET_DATA_URL env var if configured. This allows
 *   the user to set up their own CORS proxy or server-side function that returns
 *   market data in the expected JSON format.
 * - Fallback: If no URL is configured or the fetch fails, returns a stale indicator
 *   so the UI knows data couldn't be fetched.
 *
 * Expected response JSON format from the configured URL:
 * ```json
 * {
 *   "vix_level": 15.2,
 *   "spx_price": 5450.30,
 *   "spx_50dma": 5380.00,
 *   "spx_200dma": 5100.00,
 *   "iv_rank": 25
 * }
 * ```
 */
export async function fetchMarketData(): Promise<MarketDataResult> {
  const marketDataUrl = import.meta.env.VITE_MARKET_DATA_URL as string | undefined;

  if (!marketDataUrl) {
    return {
      snapshot: null,
      stale: true,
      error: new MarketDataError(
        'VITE_MARKET_DATA_URL is not configured. Set up a market data proxy to enable live data.',
      ),
    };
  }

  try {
    const response = await fetch(marketDataUrl, {
      method: 'GET',
      headers: { Accept: 'application/json' },
      signal: AbortSignal.timeout(10_000), // 10-second timeout
    });

    if (!response.ok) {
      throw new MarketDataError(
        `Market data fetch failed with status ${response.status}`,
        { statusCode: response.status },
      );
    }

    const data: unknown = await response.json();

    const snapshot = parseMarketDataResponse(data);
    return { snapshot, stale: false };
  } catch (err) {
    if (err instanceof MarketDataError) {
      return { snapshot: null, stale: true, error: err };
    }

    return {
      snapshot: null,
      stale: true,
      error: new MarketDataError('Failed to fetch market data', { cause: err }),
    };
  }
}

/**
 * Parses and validates the raw JSON response into a MarketSnapshot.
 * Throws MarketDataError if the response shape is invalid.
 */
function parseMarketDataResponse(data: unknown): MarketSnapshot {
  if (!data || typeof data !== 'object') {
    throw new MarketDataError('Invalid market data response: expected an object');
  }

  const obj = data as Record<string, unknown>;

  const vixLevel = Number(obj.vix_level);
  const spxPrice = Number(obj.spx_price);
  const spx50dma = Number(obj.spx_50dma);
  const spx200dma = Number(obj.spx_200dma);
  const ivRank = Number(obj.iv_rank ?? 0);

  if (!isFinite(vixLevel) || vixLevel < 0) {
    throw new MarketDataError(`Invalid vix_level: ${String(obj.vix_level)}`);
  }
  if (!isFinite(spxPrice) || spxPrice <= 0) {
    throw new MarketDataError(`Invalid spx_price: ${String(obj.spx_price)}`);
  }
  if (!isFinite(spx50dma) || spx50dma <= 0) {
    throw new MarketDataError(`Invalid spx_50dma: ${String(obj.spx_50dma)}`);
  }
  if (!isFinite(spx200dma) || spx200dma <= 0) {
    throw new MarketDataError(`Invalid spx_200dma: ${String(obj.spx_200dma)}`);
  }
  if (!isFinite(ivRank) || ivRank < 0 || ivRank > 100) {
    throw new MarketDataError(`Invalid iv_rank: ${String(obj.iv_rank)}`);
  }

  return {
    vix_level: vixLevel,
    spx_price: spxPrice,
    spx_50dma: spx50dma,
    spx_200dma: spx200dma,
    iv_rank: ivRank,
    timestamp: new Date().toISOString(),
  };
}
