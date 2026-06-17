/**
 * Trader Dashboard Data Aggregation
 *
 * Provides current market color, open spreads with P&L and DTE,
 * and slot availability for the Trader dashboard.
 */

import pb from '@/lib/pocketbase';
import type {
  MarketColor,
  MarketEventRecord,
  OptionPositionRecord,
  OptionSpreadRecord,
} from '@/types/database';
import { getAvailableSlots, type SlotAvailability } from '@/lib/tradeCapacity';

/**
 * An open spread enriched with days-to-expiration and unrealized P&L.
 */
export interface SpreadWithMetrics {
  spread: OptionSpreadRecord;
  /** Days remaining until the spread's expiration */
  dte: number;
  /** Unrealized P&L in dollars (positive = profit) */
  unrealized_pnl?: number;
}

/**
 * Aggregated data for the Trader dashboard.
 */
export interface TraderDashboardData {
  /** Current market regime color */
  market_color: MarketColor;
  /** All open spreads with calculated DTE and unrealized P&L */
  open_spreads: SpreadWithMetrics[];
  /** Current slot availability */
  slot_availability: SlotAvailability;
}

/**
 * Calculates the number of calendar days between two dates.
 * Returns 0 if expiration is today or in the past.
 */
function differenceInDays(from: Date, to: Date): number {
  const msPerDay = 1000 * 60 * 60 * 24;
  const diff = Math.floor((to.getTime() - from.getTime()) / msPerDay);
  return Math.max(0, diff);
}

/**
 * Fetches the current market color from the most recent market event record.
 * Falls back to GREEN if no market event is found.
 */
async function getCurrentMarketColor(): Promise<MarketColor> {
  try {
    const events = await pb
      .collection('market_events')
      .getList<MarketEventRecord>(1, 1, {
        sort: '-event_date',
        filter: 'market_color != null',
      });

    if (events.items.length > 0 && events.items[0]!.market_color) {
      return events.items[0]!.market_color;
    }

    return 'GREEN';
  } catch {
    return 'GREEN';
  }
}

/**
 * Fetches all open spreads for an account and enriches with DTE and unrealized P&L.
 *
 * DTE is calculated as the number of calendar days from today to the
 * expiration date of the spread's short leg.
 */
async function getOpenSpreadsWithMetrics(
  accountId: string
): Promise<SpreadWithMetrics[]> {
  try {
    // Fetch open spreads linked to this account
    const spreads = await pb
      .collection('option_spreads')
      .getFullList<OptionSpreadRecord>({
        filter: `status = "open" && short_leg_id.account_id = "${accountId}"`,
      });

    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const results: SpreadWithMetrics[] = [];

    for (const spread of spreads) {
      // Get the short leg to determine expiration date
      const shortLeg = await pb
        .collection('option_positions')
        .getOne(spread.short_leg_id);

      const expirationDate = new Date(shortLeg.expiration_date);
      expirationDate.setHours(0, 0, 0, 0);

      const dte = differenceInDays(today, expirationDate);

      // Unrealized P&L: net_credit is realized if the spread expires worthless.
      // For now, unrealized_pnl is undefined until live option pricing is integrated.
      results.push({
        spread,
        dte,
        unrealized_pnl: undefined,
      });
    }

    return results;
  } catch {
    return [];
  }
}

/**
 * Win rate statistics for option positions.
 */
export interface WinRateStats {
  /** Number of closed positions that were profitable */
  profitable_closes: number;
  /** Total number of closed positions */
  total_closes: number;
  /** Win rate as a percentage (profitable_closes / total_closes × 100) */
  win_rate_pct: number;
}

/**
 * Calculates win rate for option positions.
 *
 * Filters positions with status 'closed' or 'expired', then counts
 * profitable closes (pnl > 0, or expired positions which realize full premium).
 * Win rate = profitable_closes / total_closes × 100.
 *
 * Returns 0% win rate if there are no closed positions.
 *
 * @param positions - Array of option position records to analyze
 * @returns WinRateStats with profitable count, total count, and percentage
 */
export function calculateWinRate(positions: OptionPositionRecord[]): WinRateStats {
  const closedPositions = positions.filter(
    (p) => p.status === 'closed' || p.status === 'expired'
  );

  const total_closes = closedPositions.length;

  if (total_closes === 0) {
    return { profitable_closes: 0, total_closes: 0, win_rate_pct: 0 };
  }

  const profitable_closes = closedPositions.filter((p) => {
    // Expired positions realize full premium as profit (expired OTM)
    if (p.status === 'expired') {
      return true;
    }
    // Closed positions are profitable if pnl > 0
    return (p.pnl ?? 0) > 0;
  }).length;

  const win_rate_pct = (profitable_closes / total_closes) * 100;

  return { profitable_closes, total_closes, win_rate_pct };
}

/**
 * Calculates capital efficiency as annualized premium collected divided by
 * average collateral deployed.
 *
 * Annualizes the total premium over the given period:
 *   annualized = totalPremium × (365 / periodDays)
 *
 * Then divides by average collateral to get the efficiency ratio.
 * Returns 0 if averageCollateral is 0 (avoids division by zero).
 *
 * @param totalPremium - Total premium collected over the period (in dollars)
 * @param averageCollateral - Average collateral deployed over the period (in dollars)
 * @param periodDays - Number of days in the measurement period
 * @returns Capital efficiency ratio (annualized premium / average collateral), or 0
 */
export function calculateCapitalEfficiency(
  totalPremium: number,
  averageCollateral: number,
  periodDays: number
): number {
  if (averageCollateral === 0) {
    return 0;
  }

  const annualized = totalPremium * (365 / periodDays);
  return annualized / averageCollateral;
}

/**
 * Fetches and aggregates Trader dashboard data for a given account.
 *
 * - Current market color from the latest market event
 * - Open spreads with calculated DTE (days from today to expiration)
 * - Slot availability from the trade capacity engine
 *
 * @param accountId - The PocketBase account ID to fetch data for
 * @returns TraderDashboardData with market color, open spreads, and slot availability
 */
export async function fetchTraderData(
  accountId: string
): Promise<TraderDashboardData> {
  const [marketColor, openSpreads, slotAvailability] = await Promise.all([
    getCurrentMarketColor(),
    getOpenSpreadsWithMetrics(accountId),
    getAvailableSlots(accountId),
  ]);

  return {
    market_color: marketColor,
    open_spreads: openSpreads,
    slot_availability: slotAvailability,
  };
}
