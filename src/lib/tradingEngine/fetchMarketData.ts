/**
 * Market Data Fetcher for Trading Engine
 *
 * Fetches VIX and SPX data from Yahoo Finance via CORS proxy:
 * - Current VIX level (^VIX)
 * - VIX 5-day and 20-day ago levels (for expansion detection)
 * - SPX 200-day moving average (from 1-year chart)
 * - SPX 20-day ago price (for decline detection)
 */

import type { MarketConditions } from './marketSignals';

const CORS_PROXY = 'https://corsproxy.io/?';

interface YahooChartResult {
  meta: {
    regularMarketPrice?: number;
    fiftyTwoWeekHigh?: number;
    fiftyTwoWeekLow?: number;
  };
  timestamp?: number[];
  indicators?: {
    quote?: {
      close?: (number | null)[];
    }[];
  };
}

/** Extended data beyond what MarketConditions needs, for UI display */
export interface ExtendedMarketData extends MarketConditions {
  spx50DMA: number | null;
  vix30DayHigh: number | null;
  vix30DayLow: number | null;
  vix52WeekHigh: number | null;
  vix52WeekLow: number | null;
  /** Recent VIX closing values (last 5 trading days, most recent last) */
  recentVixCloses: number[];
  /** VIX 20-day simple moving average */
  vix20DayAvg: number | null;
  /** All VIX closes for the fetched period (for weeks-elevated calc) */
  allVixCloses: number[];
}

/**
 * Fetches Yahoo Finance chart data for a symbol.
 */
async function fetchYahooChart(symbol: string, range: string, interval: string): Promise<YahooChartResult | null> {
  try {
    const url = `${CORS_PROXY}${encodeURIComponent(
      `https://query1.finance.yahoo.com/v8/finance/chart/${symbol}?interval=${interval}&range=${range}`
    )}`;
    const response = await fetch(url, { signal: AbortSignal.timeout(10000) });
    if (!response.ok) return null;

    const data = await response.json();
    return data?.chart?.result?.[0] ?? null;
  } catch {
    return null;
  }
}

/**
 * Calculates Simple Moving Average from an array of closing prices.
 */
function calculateSMA(closes: (number | null)[], period: number): number | null {
  // Get the last `period` non-null values
  const validCloses = closes.filter((c): c is number => c !== null);
  if (validCloses.length < period) return null;

  const recent = validCloses.slice(-period);
  return recent.reduce((sum, v) => sum + v, 0) / recent.length;
}

/**
 * Gets a price from N trading days ago from close array.
 */
function getPriceNDaysAgo(closes: (number | null)[], daysAgo: number): number | null {
  const validCloses = closes.filter((c): c is number => c !== null);
  if (validCloses.length < daysAgo + 1) return null;
  return validCloses[validCloses.length - 1 - daysAgo] ?? null;
}

/**
 * Fetches all market data needed for the trading engine.
 * Returns an ExtendedMarketData object with everything for both logic and UI.
 */
export async function fetchTradingEngineData(): Promise<ExtendedMarketData | null> {
  try {
    // Fetch SPX 1-year daily chart (for 200 DMA, 50 DMA, 20-day ago price, 52W high/low)
    const spxChart = await fetchYahooChart('^GSPC', '1y', '1d');
    if (!spxChart) return null;

    const spxPrice = spxChart.meta.regularMarketPrice ?? 0;
    const spx52WeekHigh = spxChart.meta.fiftyTwoWeekHigh ?? spxPrice;
    const spx52WeekLow = spxChart.meta.fiftyTwoWeekLow ?? spxPrice;

    // Calculate moving averages from close prices
    const spxCloses = spxChart.indicators?.quote?.[0]?.close ?? [];
    const spx200DMA = calculateSMA(spxCloses, 200);
    const spx50DMA = calculateSMA(spxCloses, 50);
    const spx20DayAgo = getPriceNDaysAgo(spxCloses, 20);

    // Fetch VIX 1-year daily chart (for current, ranges, 5-day ago, 20-day ago)
    const vixChart = await fetchYahooChart('^VIX', '1y', '1d');
    let vixLevel = 0;
    let vix5DayAgo: number | null = null;
    let vix20DayAgo: number | null = null;
    let vix30DayHigh: number | null = null;
    let vix30DayLow: number | null = null;
    let vix52WeekHigh: number | null = null;
    let vix52WeekLow: number | null = null;

    let recentVixCloses: number[] = [];
    let vix20DayAvg: number | null = null;
    let allVixCloses: number[] = [];

    if (vixChart) {
      vixLevel = vixChart.meta.regularMarketPrice ?? 0;
      vix52WeekHigh = vixChart.meta.fiftyTwoWeekHigh ?? null;
      vix52WeekLow = vixChart.meta.fiftyTwoWeekLow ?? null;

      const vixCloses = vixChart.indicators?.quote?.[0]?.close ?? [];
      vix5DayAgo = getPriceNDaysAgo(vixCloses, 5);
      vix20DayAgo = getPriceNDaysAgo(vixCloses, 20);

      // 30-day high/low from last 30 data points
      const last30 = vixCloses.slice(-30).filter((c): c is number => c !== null);
      if (last30.length > 0) {
        vix30DayHigh = Math.max(...last30);
        vix30DayLow = Math.min(...last30);
      }

      // Recent VIX closes for pattern detection (last 5 valid values)
      const validVixCloses = vixCloses.filter((c): c is number => c !== null);
      recentVixCloses = validVixCloses.slice(-5);
      allVixCloses = validVixCloses;

      // 20-day simple moving average of VIX
      vix20DayAvg = calculateSMA(vixCloses, 20);
    }

    return {
      spxPrice,
      spx52WeekHigh,
      spx52WeekLow,
      spx200DMA,
      spx50DMA,
      vixLevel,
      vix5DayAgo,
      vix20DayAgo,
      spx20DayAgo,
      vix30DayHigh,
      vix30DayLow,
      vix52WeekHigh,
      vix52WeekLow,
      recentVixCloses,
      vix20DayAvg,
      allVixCloses,
    };
  } catch {
    return null;
  }
}
