/**
 * Dividend Growth Forecast Engine (Dividend OS V5)
 *
 * Forecasts future dividend income at 1, 3, 5, 10, 20 years.
 * Three scenarios: Conservative (50% growth), Base (historical), Optimistic (125% growth).
 */

export interface ForecastInputs {
  currentAnnualIncome: number;
  historicalGrowthRate: number; // % per year
  monthlyContribution: number;
  averageYield: number; // % yield on new purchases
  yearsToRetirement: number;
}

export interface ForecastPeriod {
  years: number;
  label: string;
  conservative: number;
  base: number;
  optimistic: number;
  contributionImpact: number; // Additional income from new contributions
}

export interface GrowthForecastResult {
  forecasts: ForecastPeriod[];
  currentIncome: number;
  growthRate: number;
  monthlyContribution: number;
}

const FORECAST_PERIODS = [1, 3, 5, 10, 20];

/**
 * Projects future income with dividend growth compounding.
 */
function projectIncome(
  currentIncome: number,
  growthRate: number,
  years: number,
): number {
  return currentIncome * Math.pow(1 + growthRate / 100, years);
}

/**
 * Projects additional income from future contributions.
 * Assumes contributions are invested evenly and grow at the dividend growth rate.
 */
function projectContributionIncome(
  monthlyContribution: number,
  averageYield: number,
  growthRate: number,
  years: number,
): number {
  if (monthlyContribution <= 0 || averageYield <= 0) return 0;

  let totalAdditionalIncome = 0;
  const annualContribution = monthlyContribution * 12;

  // Each year's contribution generates income that grows for remaining years
  for (let y = 1; y <= years; y++) {
    const incomeFromThisYear = annualContribution * (averageYield / 100);
    const yearsOfGrowth = years - y;
    totalAdditionalIncome += incomeFromThisYear * Math.pow(1 + growthRate / 100, yearsOfGrowth);
  }

  return totalAdditionalIncome;
}

/**
 * Generates the complete growth forecast.
 */
export function calculateGrowthForecast(inputs: ForecastInputs): GrowthForecastResult {
  const { currentAnnualIncome, historicalGrowthRate, monthlyContribution, averageYield } = inputs;

  const conservativeRate = historicalGrowthRate * 0.5;
  const baseRate = historicalGrowthRate;
  const optimisticRate = historicalGrowthRate * 1.25;

  const forecasts: ForecastPeriod[] = FORECAST_PERIODS.map((years) => {
    const conservative = projectIncome(currentAnnualIncome, conservativeRate, years);
    const base = projectIncome(currentAnnualIncome, baseRate, years);
    const optimistic = projectIncome(currentAnnualIncome, optimisticRate, years);
    const contributionImpact = projectContributionIncome(
      monthlyContribution,
      averageYield,
      baseRate,
      years,
    );

    return {
      years,
      label: `${years} Year${years > 1 ? 's' : ''}`,
      conservative: conservative + contributionImpact,
      base: base + contributionImpact,
      optimistic: optimistic + contributionImpact,
      contributionImpact,
    };
  });

  return {
    forecasts,
    currentIncome: currentAnnualIncome,
    growthRate: historicalGrowthRate,
    monthlyContribution,
  };
}
