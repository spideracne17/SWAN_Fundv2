/**
 * Dashboards Module
 *
 * Re-exports all dashboard data aggregation functions and types.
 */

export {
  fetchAccountingData,
  fetchRealizedGainLoss,
  applyMarketPrices,
  type AccountingDashboardData,
  type PositionSummary,
  type RealizedGainLoss,
} from './accounting';

export {
  fetchIncomeData,
  getStartDateForPeriod,
  calculateHourlyEquivalents,
  type IncomeDashboardData,
  type TimePeriod,
  type HourlyEquivalents,
} from './income';

export {
  fetchTraderData,
  calculateWinRate,
  calculateCapitalEfficiency,
  type TraderDashboardData,
  type SpreadWithMetrics,
  type WinRateStats,
} from './trader';

export { fetchTaxData, detectTLHOpportunities, type TaxDashboardData, type TLHOpportunity } from './tax';

export {
  calculateNetWorth,
  type NetWorthBreakdown,
  type NetWorthOptions,
} from './netWorth';

export { detectWashSales, type WashSaleEntry } from './washSale';

export {
  calculateMaxDrawdown,
  fetchConcentrationRisk,
  type ConcentrationEntry,
  type MaxDrawdownResult,
  type RiskDashboardData,
} from './risk';
