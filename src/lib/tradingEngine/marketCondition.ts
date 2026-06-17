/**
 * Market Condition System (Trading Rules Spec Section 2)
 *
 * Exact thresholds and hex colors from the spec:
 *   Green:  VIX < 20   #00C087  Normal operations
 *   Yellow: VIX 20-25  #FFB800  Caution — reduced activity
 *   Red:    VIX 25-35  #FF4444  Stop — no new trades
 *   Black:  VIX > 35   #1A1A1A  Emergency — close everything
 */

export type MarketConditionLevel = 'GREEN' | 'YELLOW' | 'RED' | 'BLACK';

export interface MarketCondition {
  level: MarketConditionLevel;
  label: string;
  color: string;
  meaning: string;
  newTrades: boolean;
  sizingNote: string;
  rules: string[];
}

/**
 * Determines market condition from current VIX level.
 * Uses exact thresholds from Trading Rules Spec Section 2.1.
 */
export function evaluateMarketCondition(vixLevel: number): MarketCondition {
  if (vixLevel > 35) {
    return {
      level: 'BLACK',
      label: 'Black',
      color: '#1A1A1A',
      meaning: 'Emergency — close everything',
      newTrades: false,
      sizingNote: '0% — close all positions immediately',
      rules: [
        'Close everything immediately',
        'No analysis required',
        'Capital preservation overrides all other rules',
        'Return to trading only when VIX < 25 and fading',
      ],
    };
  }

  if (vixLevel >= 25) {
    return {
      level: 'RED',
      label: 'Red',
      color: '#FF4444',
      meaning: 'Stop — no new trades',
      newTrades: false,
      sizingNote: '0% — no new entries',
      rules: [
        'No new trades',
        'Apply recovery rules to existing positions',
        'Do not enter until VIX returns below 25',
      ],
    };
  }

  if (vixLevel >= 20) {
    return {
      level: 'YELLOW',
      label: 'Yellow',
      color: '#FFB800',
      meaning: 'Caution — reduced activity',
      newTrades: true,
      sizingNote: '50% — half size only',
      rules: [
        'New trades: half size only',
        'VIX must be above 20-day average',
        'Strike selection: 8–12 delta (wider)',
        'DTE: 90 and 120 only — no 60-70 DTE',
        'Monitor delta daily, roll if short delta > 0.20',
      ],
    };
  }

  return {
    level: 'GREEN',
    label: 'Green',
    color: '#00C087',
    meaning: 'Normal operations',
    newTrades: true,
    sizingNote: '100% — normal size',
    rules: [
      'New trades: yes, normal size',
      'Strike selection: 10–20 delta',
      'Full DTE ladder available',
      'Close at 50% profit or 21 DTE',
    ],
  };
}
