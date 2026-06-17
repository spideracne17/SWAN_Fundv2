import { useState, useEffect, useRef, useCallback } from 'react';
import type { MarketSnapshot } from '@/lib/market/calculateMarketColor';
import { fetchMarketData, MarketDataError } from '@/lib/market/fetchMarketData';

/** Polling interval: 60 seconds during market hours. */
const POLL_INTERVAL_MS = 60_000;

/** Staleness threshold: data older than 30 minutes is considered stale. */
const STALENESS_THRESHOLD_MS = 30 * 60_000;

/**
 * Determines if the current time is within US equity market hours:
 * Monday–Friday, 9:30 AM – 4:00 PM Eastern Time.
 *
 * Uses Intl.DateTimeFormat to reliably get the current Eastern Time
 * regardless of the user's local timezone.
 */
export function isMarketOpen(now: Date = new Date()): boolean {
  // Get current time in America/New_York
  const formatter = new Intl.DateTimeFormat('en-US', {
    timeZone: 'America/New_York',
    weekday: 'short',
    hour: 'numeric',
    minute: 'numeric',
    hour12: false,
  });

  const parts = formatter.formatToParts(now);
  const weekday = parts.find((p) => p.type === 'weekday')?.value;
  const hour = Number(parts.find((p) => p.type === 'hour')?.value ?? 0);
  const minute = Number(parts.find((p) => p.type === 'minute')?.value ?? 0);

  // Weekend check
  if (weekday === 'Sat' || weekday === 'Sun') {
    return false;
  }

  const timeInMinutes = hour * 60 + minute;
  const marketOpen = 9 * 60 + 30; // 9:30 AM ET
  const marketClose = 16 * 60; // 4:00 PM ET

  return timeInMinutes >= marketOpen && timeInMinutes < marketClose;
}

export interface UseMarketDataReturn {
  /** The latest successfully fetched market snapshot, or null if never fetched. */
  snapshot: MarketSnapshot | null;
  /** Whether the data is stale (older than 30 minutes or fetch failed). */
  isStale: boolean;
  /** The last error encountered during fetching, or null. */
  error: MarketDataError | null;
  /** ISO timestamp of the last successful fetch, or null. */
  lastUpdated: string | null;
}

/**
 * React hook that polls market data every 60 seconds during market hours.
 *
 * Behavior:
 * - Fetches immediately on mount if market is open
 * - Sets up a 60-second interval during market hours
 * - Stops polling outside market hours (weekends, before 9:30 AM ET, after 4:00 PM ET)
 * - Marks data as stale if older than 30 minutes or if fetch fails
 * - Checks market open status every minute to start/stop polling dynamically
 */
export function useMarketData(): UseMarketDataReturn {
  const [snapshot, setSnapshot] = useState<MarketSnapshot | null>(null);
  const [error, setError] = useState<MarketDataError | null>(null);
  const [lastUpdated, setLastUpdated] = useState<string | null>(null);

  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const marketCheckRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const doFetch = useCallback(async () => {
    const result = await fetchMarketData();

    if (!result.stale && result.snapshot) {
      setSnapshot(result.snapshot);
      setLastUpdated(result.snapshot.timestamp);
      setError(null);
    } else {
      setError(result.error ?? null);
    }
  }, []);

  const startPolling = useCallback(() => {
    if (intervalRef.current) return; // Already polling

    // Fetch immediately
    void doFetch();

    // Set up 60-second interval
    intervalRef.current = setInterval(() => {
      void doFetch();
    }, POLL_INTERVAL_MS);
  }, [doFetch]);

  const stopPolling = useCallback(() => {
    if (intervalRef.current) {
      clearInterval(intervalRef.current);
      intervalRef.current = null;
    }
  }, []);

  useEffect(() => {
    // Initial check
    if (isMarketOpen()) {
      startPolling();
    }

    // Check every 60 seconds whether market has opened/closed
    marketCheckRef.current = setInterval(() => {
      if (isMarketOpen()) {
        startPolling();
      } else {
        stopPolling();
      }
    }, POLL_INTERVAL_MS);

    return () => {
      stopPolling();
      if (marketCheckRef.current) {
        clearInterval(marketCheckRef.current);
        marketCheckRef.current = null;
      }
    };
  }, [startPolling, stopPolling]);

  // Compute staleness
  const isStale = (() => {
    if (!lastUpdated) return true;
    const elapsed = Date.now() - new Date(lastUpdated).getTime();
    return elapsed > STALENESS_THRESHOLD_MS;
  })();

  return { snapshot, isStale, error, lastUpdated };
}
