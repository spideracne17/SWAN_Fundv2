/**
 * Income Dashboard Data Aggregation
 *
 * Aggregates dividend income, options income, and interest income
 * by time period (MTD, QTD, YTD, trailing 12 months).
 *
 * All data comes from cash_transactions table:
 *   - Dividends: raw_action contains "Div" or transaction_type = "dividend"
 *   - Options: raw_action is "Sell to Open" (premium received) — net of "Buy to Open"
 *   - Interest: raw_action = "Credit Interest" or "Bank Interest" or transaction_type = "interest"
 */

import pb from '@/lib/pocketbase';
import type { CashTransactionRecord } from '@/types/database';

// ─── Types ───────────────────────────────────────────────────────────────────

export type TimePeriod = 'mtd' | 'qtd' | 'ytd' | 'trailing_12m';

export interface IncomeDashboardData {
  dividend_income: number;
  options_income: number;
  interest_income: number;
  total_income: number;
  period: TimePeriod;
  monthly_dividends: { month: string; amount: number; symbols: string[] }[];
}

// ─── Date Range Helpers ──────────────────────────────────────────────────────

export function getStartDateForPeriod(period: TimePeriod, now: Date = new Date()): string {
  let start: Date;

  switch (period) {
    case 'mtd':
      start = new Date(now.getFullYear(), now.getMonth(), 1);
      break;
    case 'qtd': {
      const quarterStartMonth = Math.floor(now.getMonth() / 3) * 3;
      start = new Date(now.getFullYear(), quarterStartMonth, 1);
      break;
    }
    case 'ytd':
      start = new Date(now.getFullYear(), 0, 1);
      break;
    case 'trailing_12m': {
      start = new Date(now.getFullYear(), now.getMonth() - 12, now.getDate());
      break;
    }
  }

  return start.toISOString().split('T')[0]!;
}

function getEndDate(now: Date = new Date()): string {
  return now.toISOString().split('T')[0]!;
}

// ─── Income Classification ───────────────────────────────────────────────────

function isDividend(tx: CashTransactionRecord): boolean {
  const action = (tx.raw_action ?? '').toLowerCase();
  const type = (tx.transaction_type ?? '').toLowerCase();
  return (
    type === 'dividend' ||
    type === 'reinvestment' ||
    action.includes('div') ||
    action === 'cdiv'
  );
}

function isOptionsIncome(tx: CashTransactionRecord): boolean {
  const action = (tx.raw_action ?? '').toLowerCase();
  return (
    action === 'sell to open' ||
    action === 'buy to open' ||
    action === 'buy to close' ||
    action === 'sell to close'
  );
}

function isInterest(tx: CashTransactionRecord): boolean {
  const action = (tx.raw_action ?? '').toLowerCase();
  const type = (tx.transaction_type ?? '').toLowerCase();
  return (
    type === 'interest' ||
    action.includes('interest') ||
    action === 'bank interest' ||
    action === 'credit interest'
  );
}

// ─── Hourly Equivalents ──────────────────────────────────────────────────────

export interface HourlyEquivalents {
  hourly_40hr: number;
  hourly_24hr: number;
}

/**
 * Calculates hourly wage equivalents for total investment income.
 * - 40hr/week: totalIncome ÷ 2080 (52 weeks × 40 hours/week)
 * - 24/7: totalIncome ÷ 8736 (52 weeks × 168 hours/week, i.e. 24hrs × 7 days)
 */
export function calculateHourlyEquivalents(totalIncome: number): HourlyEquivalents {
  return {
    hourly_40hr: totalIncome / 2080,
    hourly_24hr: totalIncome / 8736,
  };
}

// ─── Public API ──────────────────────────────────────────────────────────────

/**
 * Fetches aggregated income data for the specified time period.
 * Reads all cash_transactions in the date range and classifies by type.
 *
 * Options income = net premiums (Sell to Open credits + Buy to Open debits +
 *   Buy to Close debits + Sell to Close credits). This captures the full
 *   lifecycle: premium received minus cost to close.
 */
export async function fetchIncomeData(period: TimePeriod): Promise<IncomeDashboardData> {
  const now = new Date();
  const startDate = getStartDateForPeriod(period, now);
  const endDate = getEndDate(now);

  let transactions: CashTransactionRecord[] = [];
  try {
    transactions = await pb.collection('cash_transactions').getFullList<CashTransactionRecord>({
      filter: `transaction_date >= "${startDate}" && transaction_date <= "${endDate}"`,
      sort: 'transaction_date',
      requestKey: `income-${period}`,
    });
  } catch {
    transactions = [];
  }

  let dividend_income = 0;
  let options_income = 0;
  let interest_income = 0;
  const monthlyDivMap = new Map<string, { amount: number; symbols: Set<string> }>();

  for (const tx of transactions) {
    const amount = parseFloat(String(tx.total_amount)) || 0;

    if (isDividend(tx)) {
      // Only count positive amounts for dividends (reinvestment debits are negative)
      if (amount > 0) {
        dividend_income += amount;

        // Track monthly breakdown
        const month = tx.transaction_date.slice(0, 7); // YYYY-MM
        const entry = monthlyDivMap.get(month) ?? { amount: 0, symbols: new Set<string>() };
        entry.amount += amount;
        if (tx.symbol) entry.symbols.add(tx.symbol);
        monthlyDivMap.set(month, entry);
      }
    } else if (isOptionsIncome(tx)) {
      // Sum all option transactions (STO positive, BTO negative, BTC negative, STC positive)
      options_income += amount;
    } else if (isInterest(tx)) {
      if (amount > 0) {
        interest_income += amount;
      }
    }
  }

  const total_income = dividend_income + options_income + interest_income;

  // Build monthly dividends array sorted by month
  const monthly_dividends = [...monthlyDivMap.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([month, data]) => ({
      month,
      amount: data.amount,
      symbols: [...data.symbols].sort(),
    }));

  return {
    dividend_income,
    options_income,
    interest_income,
    total_income,
    period,
    monthly_dividends,
  };
}
