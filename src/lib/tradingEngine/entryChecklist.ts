/**
 * Entry Checklist Generator
 *
 * Produces a list of all conditions that must be met before opening a new trade.
 * Each item is pass/fail with an explanation.
 */

import type { TradingSignal } from './marketSignals';
import type { PortfolioHeatData } from './portfolioHeat';
import type { CircuitBreakerStatus } from './circuitBreakers';

export interface ChecklistItem {
  label: string;
  passed: boolean;
  detail: string;
  category: 'volatility' | 'market' | 'portfolio' | 'rules' | 'timing' | 'condition';
}

export function generateEntryChecklist(
  signal: TradingSignal,
  heat: PortfolioHeatData,
  breakers: CircuitBreakerStatus,
): ChecklistItem[] {
  const items: ChecklistItem[] = [];

  // Volatility conditions
  items.push({
    label: 'VIX ≥ 12',
    passed: signal.volatility.label !== 'Low',
    detail: signal.volatility.label === 'Low'
      ? `VIX too low — no premium available`
      : `VIX ${signal.volatility.label} — adequate premium`,
    category: 'volatility',
  });

  items.push({
    label: 'No rapid VIX expansion',
    passed: !signal.vixExpansion.isExtreme,
    detail: signal.vixExpansion.isExtreme
      ? `VIX expanded ${signal.vixExpansion.pct5Day?.toFixed(0)}% in 5 days — PAUSE`
      : signal.vixExpansion.isRapid
        ? `VIX expanded ${signal.vixExpansion.pct5Day?.toFixed(0)}% in 5 days — reduce 50%`
        : 'VIX expansion normal',
    category: 'volatility',
  });

  // Market conditions
  items.push({
    label: 'Not at all-time high',
    passed: signal.correction.pctFromHigh > 2,
    detail: signal.correction.pctFromHigh <= 2
      ? `SPX within 2% of high — smallest allocations only`
      : `SPX ${signal.correction.pctFromHigh.toFixed(1)}% from high`,
    category: 'market',
  });

  items.push({
    label: 'Trend not bearish',
    passed: signal.trend.label !== 'Bearish',
    detail: signal.trend.label === 'Bearish'
      ? `SPX below 200 DMA — reduce 50%`
      : signal.trend.pctFrom200DMA !== null
        ? `SPX ${signal.trend.pctFrom200DMA.toFixed(1)}% ${signal.trend.pctFrom200DMA > 0 ? 'above' : 'below'} 200 DMA`
        : '200 DMA data unavailable',
    category: 'market',
  });

  items.push({
    label: 'No black swan detected',
    passed: !signal.isBlackSwan,
    detail: signal.isBlackSwan
      ? 'BLACK SWAN PROTOCOL — stop all new trades'
      : 'No extreme market events detected',
    category: 'market',
  });

  // Portfolio conditions
  items.push({
    label: 'Portfolio heat < 30%',
    passed: heat.heatPct < 30,
    detail: `Current heat: ${heat.heatPct.toFixed(1)}% (target 20-30%, max 35%)`,
    category: 'portfolio',
  });

  items.push({
    label: 'No active circuit breakers',
    passed: !breakers.anyActive,
    detail: breakers.anyActive
      ? breakers.statusLabel
      : 'All clear',
    category: 'portfolio',
  });

  items.push({
    label: 'Available risk capacity',
    passed: heat.availableNewRisk > 0,
    detail: heat.availableNewRisk > 0
      ? `$${heat.availableNewRisk.toFixed(0)} available for new trades`
      : 'No available risk capacity',
    category: 'portfolio',
  });

  // Trade rules
  items.push({
    label: 'DTE 90-120 (min 75)',
    passed: true, // This is a reminder — user must verify on actual trade
    detail: 'Target 90-120 DTE, minimum 75, avoid <60',
    category: 'rules',
  });

  items.push({
    label: 'Delta 8-12 on short strike',
    passed: true, // Placeholder until Schwab API provides delta
    detail: 'Target 8-12 delta, acceptable 8-15 (verify in thinkorswim)',
    category: 'rules',
  });

  items.push({
    label: 'Credit ≥ $55 per $500 spread',
    passed: true, // Reminder — user verifies actual credit
    detail: 'Minimum $55 credit (11% return on risk)',
    category: 'rules',
  });

  items.push({
    label: 'Spread width 5 points',
    passed: true,
    detail: 'Standard 5-point SPX put credit spread ($500 max risk)',
    category: 'rules',
  });

  // Timing
  items.push({
    label: 'Staggered entry (not all at once)',
    passed: true, // Reminder
    detail: 'Preferred: Mon/Wed/Fri entries, max 5% new risk/week',
    category: 'timing',
  });

  // Market Condition checks (Spec Section 2 — Yellow restrictions)
  const isYellow = signal.volatility.label === 'High' || (signal.volatility.label === 'Normal' && signal.volatility.sizingMultiplier < 1);
  const vixAbove20 = signal.volatility.label !== 'Low';

  items.push({
    label: 'Market condition Green or Yellow',
    passed: vixAbove20 && signal.volatility.sizingMultiplier > 0,
    detail: signal.volatility.sizingMultiplier === 0
      ? 'Red/Black condition — no new trades allowed'
      : `Condition allows trading (VIX ${signal.volatility.label})`,
    category: 'condition',
  });

  items.push({
    label: 'VIX pattern allows entry (P1 or P2)',
    passed: true, // Placeholder — resolved by VIX pattern engine in panel
    detail: 'Check VIX Pattern display above (Pattern 1 or 2 = enter)',
    category: 'condition',
  });

  items.push({
    label: 'Yellow: No 60-70 DTE rung',
    passed: true, // Reminder — enforced in DTE ladder
    detail: isYellow
      ? '⚠️ Yellow condition active — 60-70 DTE rung disabled'
      : 'Green condition — full ladder available',
    category: 'condition',
  });

  items.push({
    label: 'Yellow: Half size only',
    passed: true, // Reminder
    detail: isYellow
      ? '⚠️ Yellow condition — reduce position size to 50%'
      : 'Green condition — normal sizing',
    category: 'condition',
  });

  return items;
}
