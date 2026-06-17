/**
 * Income Smoothing Engine (Dividend OS V2)
 *
 * Calendar Groups:
 *   Group A: March / June / September / December
 *   Group B: January / April / July / October
 *   Group C: February / May / August / November
 *
 * Target Monthly Income = Annual Dividend Income / 12
 * Coverage Score = 1 - ABS((Actual - Target) / Target) → 0-100 scale
 */

import type { DividendStockData } from './qualityScoring';

export type CalendarGroup = 'A' | 'B' | 'C';

export interface MonthlyIncome {
  month: number;       // 1-12
  monthLabel: string;  // "Jan", "Feb", etc.
  group: CalendarGroup;
  projected: number;   // Expected income this month
  actual: number;      // Actual income received
}

export interface IncomeSmoothingResult {
  annualIncome: number;
  targetMonthly: number;
  monthlyBreakdown: MonthlyIncome[];
  coverageScore: number;
  incomeVariance: number;
  weakestMonth: MonthlyIncome | null;
  strongestMonth: MonthlyIncome | null;
  gapAnalysis: IncomeGapAnalysis;
  groupTotals: { group: CalendarGroup; total: number; pct: number }[];
}

export interface IncomeGapAnalysis {
  lowestMonth: string;
  largestDeficit: number;
  requiredAdditionalAnnual: number;
  requiredAdditionalCapital: number; // At 3% yield assumption
}

const MONTH_LABELS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

/**
 * Determines calendar group for a given month.
 */
export function getCalendarGroup(month: number): CalendarGroup {
  // Group A: 3, 6, 9, 12
  if ([3, 6, 9, 12].includes(month)) return 'A';
  // Group B: 1, 4, 7, 10
  if ([1, 4, 7, 10].includes(month)) return 'B';
  // Group C: 2, 5, 8, 11
  return 'C';
}

/**
 * Calculates income smoothing metrics from portfolio holdings.
 */
export function calculateIncomeSmoothing(
  holdings: DividendStockData[],
  actualMonthlyIncome?: Map<number, number>,
): IncomeSmoothingResult {
  // Calculate projected monthly income from holdings
  const monthlyProjected = new Array(12).fill(0) as number[];

  for (const stock of holdings) {
    const annualDividend = stock.annualDividendPerShare * stock.sharesHeld;
    const group = stock.calendarGroup;

    // Distribute quarterly dividends to appropriate months
    let months: number[];
    switch (group) {
      case 'A': months = [3, 6, 9, 12]; break;
      case 'B': months = [1, 4, 7, 10]; break;
      case 'C': months = [2, 5, 8, 11]; break;
    }

    const perPayment = annualDividend / 4;
    for (const m of months) {
      monthlyProjected[m - 1] += perPayment;
    }
  }

  const annualIncome = monthlyProjected.reduce((s, v) => s + v, 0);
  const targetMonthly = annualIncome / 12;

  // Build monthly breakdown
  const monthlyBreakdown: MonthlyIncome[] = monthlyProjected.map((projected, i) => ({
    month: i + 1,
    monthLabel: MONTH_LABELS[i]!,
    group: getCalendarGroup(i + 1),
    projected,
    actual: actualMonthlyIncome?.get(i + 1) ?? projected,
  }));

  // Coverage Score
  let coverageScore = 100;
  if (targetMonthly > 0) {
    const deviations = monthlyBreakdown.map((m) => Math.abs(m.projected - targetMonthly) / targetMonthly);
    const avgDeviation = deviations.reduce((s, v) => s + v, 0) / deviations.length;
    coverageScore = Math.max(0, Math.min(100, (1 - avgDeviation) * 100));
  }

  // Variance
  const mean = targetMonthly;
  const variance = monthlyBreakdown.reduce((sum, m) => sum + Math.pow(m.projected - mean, 2), 0) / 12;
  const incomeVariance = Math.sqrt(variance);

  // Weakest and strongest months
  const sorted = [...monthlyBreakdown].sort((a, b) => a.projected - b.projected);
  const weakestMonth = sorted[0] ?? null;
  const strongestMonth = sorted[sorted.length - 1] ?? null;

  // Gap Analysis
  const lowestMonth = weakestMonth?.monthLabel ?? '—';
  const largestDeficit = targetMonthly - (weakestMonth?.projected ?? 0);
  const requiredAdditionalAnnual = Math.max(0, largestDeficit * 12);
  const requiredAdditionalCapital = requiredAdditionalAnnual > 0 ? requiredAdditionalAnnual / 0.03 : 0;

  // Group totals
  const groupMap = new Map<CalendarGroup, number>([['A', 0], ['B', 0], ['C', 0]]);
  for (const m of monthlyBreakdown) {
    groupMap.set(m.group, (groupMap.get(m.group) ?? 0) + m.projected);
  }
  const groupTotals: { group: CalendarGroup; total: number; pct: number }[] = [
    { group: 'A', total: groupMap.get('A')!, pct: annualIncome > 0 ? (groupMap.get('A')! / annualIncome) * 100 : 0 },
    { group: 'B', total: groupMap.get('B')!, pct: annualIncome > 0 ? (groupMap.get('B')! / annualIncome) * 100 : 0 },
    { group: 'C', total: groupMap.get('C')!, pct: annualIncome > 0 ? (groupMap.get('C')! / annualIncome) * 100 : 0 },
  ];

  return {
    annualIncome,
    targetMonthly,
    monthlyBreakdown,
    coverageScore,
    incomeVariance,
    weakestMonth,
    strongestMonth,
    gapAnalysis: {
      lowestMonth,
      largestDeficit: Math.max(0, largestDeficit),
      requiredAdditionalAnnual,
      requiredAdditionalCapital,
    },
    groupTotals,
  };
}
