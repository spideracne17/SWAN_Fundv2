/**
 * Tax Dashboard Data Aggregation
 *
 * Aggregates realized gains/losses by holding period (short-term vs long-term)
 * and dividend income by classification (qualified vs ordinary) for a given tax year.
 */

import pb from '@/lib/pocketbase';
import type { DispositionRecord } from '@/types/database';
import type { PositionSummary } from './accounting';

// ─── Types ───────────────────────────────────────────────────────────────────

/** Aggregated tax data for the dashboard. */
export interface TaxDashboardData {
  tax_year: number;
  short_term_gains: number;
  long_term_gains: number;
  qualified_dividends: number;
  ordinary_dividends: number;
  total_gains: number;
}

/** A tax-loss harvest opportunity for a position with unrealized loss > $1,000. */
export interface TLHOpportunity {
  symbol: string;
  cost_basis: number;
  market_value: number;
  unrealized_loss: number;
  wash_sale_restricted: boolean;
}

// ─── Data Fetching ───────────────────────────────────────────────────────────

/**
 * Fetches dispositions for a given tax year and sums gain_loss by holding_period.
 *
 * Queries the dispositions table where disposition_date falls within
 * the tax year (Jan 1 – Dec 31) and groups totals by short_term vs long_term.
 */
async function fetchGainsByHoldingPeriod(
  taxYear: number
): Promise<{ short_term: number; long_term: number }> {
  const startDate = `${taxYear}-01-01`;
  const endDate = `${taxYear}-12-31`;

  try {
    const records = await pb.collection('dispositions').getFullList<DispositionRecord>({
      filter: `disposition_date >= "${startDate}" && disposition_date <= "${endDate}"`,
    });

    let short_term = 0;
    let long_term = 0;

    for (const record of records) {
      const gl = parseFloat(String(record.gain_loss)) || 0;
      if (record.holding_period === 'short_term') {
        short_term += gl;
      } else {
        long_term += gl;
      }
    }

    return { short_term, long_term };
  } catch {
    return { short_term: 0, long_term: 0 };
  }
}

/**
 * Fetches dividends for a given tax year from cash_transactions.
 * Only counts TAXABLE account dividends (Robinhood + Schwab Spreads).
 * IRA dividends are tax-sheltered and excluded.
 */
async function fetchDividendsByClassification(
  taxYear: number
): Promise<{ qualified: number; ordinary: number }> {
  const startDate = `${taxYear}-01-01`;
  const endDate = `${taxYear}-12-31`;

  // Only taxable accounts matter for tax reporting
  const TAXABLE_ACCOUNTS = ['pd64pe7tiyvwro8', '7oq9h56iacbrxj3']; // Robinhood + Schwab Spreads

  try {
    const filter = TAXABLE_ACCOUNTS.map(id => `account_id = "${id}"`).join(' || ');
    const records = await pb.collection('cash_transactions').getFullList({
      filter: `(${filter}) && transaction_date >= "${startDate}" && transaction_date <= "${endDate}"`,
      requestKey: `tax-divs-${taxYear}`,
    });

    let qualified = 0;
    let ordinary = 0;

    for (const record of records) {
      const txType = ((record as Record<string, unknown>).transaction_type as string || '').toLowerCase();
      const rawAction = ((record as Record<string, unknown>).raw_action as string || '').toLowerCase();
      const amount = parseFloat(String((record as Record<string, unknown>).total_amount)) || 0;

      if ((txType === 'dividend' || rawAction === 'cdiv' || rawAction.includes('div')) && amount > 0) {
        qualified += amount;
      }
    }

    return { qualified, ordinary };
  } catch {
    return { qualified: 0, ordinary: 0 };
  }
}

// ─── Public API ──────────────────────────────────────────────────────────────

/**
 * Fetches aggregated tax data for a specified tax year.
 *
 * Combines realized gains/losses (split by holding period) with dividend
 * income (split by classification) into a single dashboard payload.
 *
 * @param taxYear - The calendar tax year to aggregate (e.g. 2024)
 * @returns Aggregated tax data for the year
 */
export async function fetchTaxData(taxYear: number): Promise<TaxDashboardData> {
  const [gains, dividends] = await Promise.all([
    fetchGainsByHoldingPeriod(taxYear),
    fetchDividendsByClassification(taxYear),
  ]);

  const total_gains = gains.short_term + gains.long_term;

  return {
    tax_year: taxYear,
    short_term_gains: gains.short_term,
    long_term_gains: gains.long_term,
    qualified_dividends: dividends.qualified,
    ordinary_dividends: dividends.ordinary,
    total_gains,
  };
}

// ─── Tax-Loss Harvesting ─────────────────────────────────────────────────────

/**
 * Detects tax-loss harvest opportunities from portfolio positions.
 *
 * Filters positions with unrealized losses exceeding $1,000 (unrealized_gain_loss < -1000)
 * and excludes positions whose symbol is in the wash sale restricted list.
 *
 * This is a pure function with no side effects or database access.
 *
 * @param positions - Array of position summaries with market values populated
 * @param washSaleSymbols - Array of symbols currently restricted by wash sale rules
 * @returns Array of qualifying TLH opportunities
 */
export function detectTLHOpportunities(
  positions: PositionSummary[],
  washSaleSymbols: string[]
): TLHOpportunity[] {
  const washSaleSet = new Set(washSaleSymbols.map((s) => s.toUpperCase()));

  return positions
    .filter((position) => {
      // Must have unrealized gain/loss data available
      if (position.unrealized_gain_loss === undefined || position.unrealized_gain_loss === null) {
        return false;
      }
      // Loss must exceed $1,000 (unrealized_gain_loss < -1000)
      if (position.unrealized_gain_loss >= -1000) {
        return false;
      }
      // Must not be wash-sale restricted
      if (washSaleSet.has(position.symbol.toUpperCase())) {
        return false;
      }
      return true;
    })
    .map((position) => ({
      symbol: position.symbol,
      cost_basis: position.cost_basis,
      market_value: position.market_value ?? 0,
      unrealized_loss: Math.abs(position.unrealized_gain_loss!),
      wash_sale_restricted: false,
    }));
}
