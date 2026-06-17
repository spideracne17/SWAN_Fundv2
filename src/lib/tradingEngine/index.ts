/**
 * SPX Long-DTE Put Credit Spread Trading Engine
 * Portfolio Operating System v3
 *
 * Evaluates market conditions against the rule set and produces
 * actionable signals: GO, CAUTION, or NO_TRADE.
 */

export { evaluateMarketConditions, type MarketConditions, type TradingSignal } from './marketSignals';
export { calculatePortfolioHeat, type PortfolioHeatData } from './portfolioHeat';
export { calculateSlotMetrics, type SlotMetrics, type SlotHistory } from './slotReuse';
export { evaluateCircuitBreakers, type CircuitBreakerStatus } from './circuitBreakers';
export { generateEntryChecklist, type ChecklistItem } from './entryChecklist';
export { evaluateMarketCondition, type MarketCondition, type MarketConditionLevel } from './marketCondition';
export { classifyVixPattern, estimateWeeksElevated, type VixPattern, type VixPatternNumber } from './vixPatterns';
export { evaluatePositionDecision, evaluateDeltaAlert, type PositionDecision, type PositionContext } from './positionDecision';
export { generatePositionAlerts, type PositionAlert, type AlertSeverity } from './positionAlerts';
export { evaluateDteLadder, type DteLadderRung, type DteLadderState } from './dteLadder';
