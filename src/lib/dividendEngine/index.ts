/**
 * Dividend Portfolio Operating System v6
 *
 * Complete dividend quality, income smoothing, capital allocation,
 * growth forecasting, and retirement readiness system.
 */

export { calculateQualityScore, type DividendStockData, type QualityScore } from './qualityScoring';
export { calculateIncomeSmoothing, getCalendarGroup, type IncomeSmoothingResult, type MonthlyIncome, type CalendarGroup } from './incomeSmoothing';
export { calculateGrowthForecast, type ForecastInputs, type GrowthForecastResult, type ForecastPeriod } from './growthForecast';
export { calculateRetirementReadiness, type RetirementInputs, type RetirementReadinessResult } from './retirementReadiness';
export { calculateAllocation, type AllocationResult, type AllocationCandidate, type AllocationInputs } from './capitalAllocation';
