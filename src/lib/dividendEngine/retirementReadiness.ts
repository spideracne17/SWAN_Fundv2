/**
 * Retirement Income Readiness Engine (Dividend OS V6)
 *
 * Coverage % = Annual Dividend Income / Annual Expenses
 * FI Score = Coverage %
 * Years to Dividend Independence estimate
 */

export interface RetirementInputs {
  annualDividendIncome: number;
  annualExpenses: number;
  monthlyContribution: number;
  averageYield: number;       // %
  dividendGrowthRate: number; // % per year
  qualifiedDividendPct: number; // % of dividends that are qualified
}

export interface RetirementReadinessResult {
  annualIncome: number;
  monthlyIncome: number;
  annualExpenses: number;
  coveragePct: number;
  fiScore: number;
  fiStatus: string;
  fiStatusColor: string;
  yearsToDividendIndependence: number | null;
  qualifiedPct: number;
  projectedIncome5yr: number;
  projectedIncome10yr: number;
  projectedIncome20yr: number;
}

/**
 * Determines FI status label from coverage percentage.
 */
function getFiStatus(coverage: number): { status: string; color: string } {
  if (coverage >= 125) return { status: 'Excess Income', color: '#00C087' };
  if (coverage >= 100) return { status: 'Financial Independence', color: '#66bb6a' };
  if (coverage >= 75) return { status: 'Near Goal', color: '#4fc3f7' };
  if (coverage >= 50) return { status: 'Progressing', color: '#FFB800' };
  if (coverage >= 25) return { status: 'Early Stage', color: '#ff8a65' };
  return { status: 'Starting', color: '#ef5350' };
}

/**
 * Estimates years until dividend income exceeds expenses.
 * Returns null if already achieved or if impossible to reach.
 */
function estimateYearsToFI(
  currentIncome: number,
  expenses: number,
  growthRate: number,
  monthlyContribution: number,
  averageYield: number,
): number | null {
  if (currentIncome >= expenses) return 0;
  if (growthRate <= 0 && monthlyContribution <= 0) return null;

  const annualContribution = monthlyContribution * 12;
  const yieldDecimal = averageYield / 100;
  const growthDecimal = growthRate / 100;

  let income = currentIncome;
  for (let year = 1; year <= 50; year++) {
    // Existing income grows
    income *= (1 + growthDecimal);
    // New contributions add income
    income += annualContribution * yieldDecimal;

    if (income >= expenses) return year;
  }

  return null; // Can't reach in 50 years
}

/**
 * Calculates complete retirement readiness metrics.
 */
export function calculateRetirementReadiness(inputs: RetirementInputs): RetirementReadinessResult {
  const {
    annualDividendIncome,
    annualExpenses,
    monthlyContribution,
    averageYield,
    dividendGrowthRate,
    qualifiedDividendPct,
  } = inputs;

  const coveragePct = annualExpenses > 0 ? (annualDividendIncome / annualExpenses) * 100 : 0;
  const { status: fiStatus, color: fiStatusColor } = getFiStatus(coveragePct);

  const yearsToDI = estimateYearsToFI(
    annualDividendIncome,
    annualExpenses,
    dividendGrowthRate,
    monthlyContribution,
    averageYield,
  );

  // Projected income (base case with contributions)
  const growthDecimal = dividendGrowthRate / 100;
  const annualContrib = monthlyContribution * 12;
  const yieldDecimal = averageYield / 100;

  function project(years: number): number {
    let income = annualDividendIncome;
    for (let y = 0; y < years; y++) {
      income *= (1 + growthDecimal);
      income += annualContrib * yieldDecimal;
    }
    return income;
  }

  return {
    annualIncome: annualDividendIncome,
    monthlyIncome: annualDividendIncome / 12,
    annualExpenses,
    coveragePct,
    fiScore: coveragePct,
    fiStatus,
    fiStatusColor,
    yearsToDividendIndependence: yearsToDI,
    qualifiedPct: qualifiedDividendPct,
    projectedIncome5yr: project(5),
    projectedIncome10yr: project(10),
    projectedIncome20yr: project(20),
  };
}
