/**
 * Position Management Decision Engine (Trading Rules Spec Section 6)
 *
 * Implements the hold/roll/close decision table from Section 6.2
 * and delta monitoring rules from Section 6.4.
 */

import type { MarketConditionLevel } from './marketCondition';

export type PositionAction = 'HOLD' | 'ROLL' | 'CLOSE' | 'CLOSE_NOW' | 'DO_NOT_ADD';

export interface PositionDecision {
  action: PositionAction;
  reason: string;
  urgency: 'low' | 'medium' | 'high' | 'critical';
  color: string;
}

export interface PositionContext {
  dteRemaining: number;
  dropSizePct: number; // SPX drop from entry as percentage
  marketCondition: MarketConditionLevel;
  shortDelta: number | null; // current delta of short strike (null if unknown)
  dropDurationWeeks: number; // how many weeks the drop has persisted
  isVixElevated3Weeks: boolean; // VIX elevated 3+ consecutive weeks
}

/**
 * Evaluates a position against the decision table (Section 6.2)
 * and returns the single correct action.
 */
export function evaluatePositionDecision(ctx: PositionContext): PositionDecision {
  const { dteRemaining, dropSizePct, marketCondition, shortDelta, dropDurationWeeks, isVixElevated3Weeks } = ctx;

  // Rule 1: Black condition — close everything immediately
  if (marketCondition === 'BLACK') {
    return {
      action: 'CLOSE_NOW',
      reason: 'VIX > 35 — Black condition. Close all spreads immediately. Regime change.',
      urgency: 'critical',
      color: '#1A1A1A',
    };
  }

  // Rule 2: Panic crash — over 15% in under 4 weeks
  if (dropSizePct > 15 && dropDurationWeeks < 4) {
    return {
      action: 'CLOSE_NOW',
      reason: 'Panic crash pattern (>15% in <4 weeks). Close regardless of DTE.',
      urgency: 'critical',
      color: '#FF4444',
    };
  }

  // Rule 3: Under 21 DTE — close regardless
  if (dteRemaining < 21) {
    return {
      action: 'CLOSE',
      reason: 'Under 21 DTE — time stop. Take the defined loss. No exceptions.',
      urgency: 'high',
      color: '#ef5350',
    };
  }

  // Rule 4: VIX elevated 3+ weeks — do not add new positions
  if (isVixElevated3Weeks) {
    return {
      action: 'DO_NOT_ADD',
      reason: 'VIX elevated 3+ weeks — bear trend signal. No new spreads.',
      urgency: 'medium',
      color: '#FFB800',
    };
  }

  // Rule 5: 21-45 DTE ranges
  if (dteRemaining >= 21 && dteRemaining <= 45) {
    if (dropSizePct > 15) {
      return {
        action: 'CLOSE',
        reason: 'DTE 21-45, drop >15%. Too far down with too little time. Close for defined loss.',
        urgency: 'high',
        color: '#ef5350',
      };
    }
    if (dropSizePct >= 10 && dropSizePct <= 15 && (marketCondition === 'GREEN' || marketCondition === 'YELLOW')) {
      return {
        action: 'ROLL',
        reason: 'DTE 21-45, drop 10-15% in Green/Yellow. Roll: buy back, sell 4-6 weeks further out at lower strike.',
        urgency: 'medium',
        color: '#FFB800',
      };
    }
    if (dropSizePct < 10 && (marketCondition === 'GREEN' || marketCondition === 'YELLOW')) {
      return {
        action: 'HOLD',
        reason: 'DTE 21-45, drop <10% in Green/Yellow. Typical pullback with time remaining. Monitor delta.',
        urgency: 'low',
        color: '#66bb6a',
      };
    }
  }

  // Rule 6: 45-60 DTE
  if (dteRemaining > 45 && dteRemaining <= 60) {
    if (dropSizePct < 15 && (marketCondition === 'GREEN' || marketCondition === 'YELLOW')) {
      return {
        action: 'HOLD',
        reason: 'DTE 45-60, drop <15% in Green/Yellow. Severe-but-recoverable with sufficient time.',
        urgency: 'low',
        color: '#66bb6a',
      };
    }
    if (dropSizePct >= 15) {
      return {
        action: 'CLOSE',
        reason: 'DTE 45-60, drop ≥15%. Close for defined loss.',
        urgency: 'high',
        color: '#ef5350',
      };
    }
  }

  // Rule 7: 60+ DTE
  if (dteRemaining > 60) {
    if (dropSizePct < 15 && (marketCondition === 'GREEN' || marketCondition === 'YELLOW')) {
      return {
        action: 'HOLD',
        reason: 'DTE 60+, drop <15% in Green/Yellow. Ample time buffer for recovery.',
        urgency: 'low',
        color: '#66bb6a',
      };
    }
    if (dropSizePct >= 15) {
      return {
        action: 'CLOSE',
        reason: 'DTE 60+, drop ≥15%. Extreme correction — close for capital preservation.',
        urgency: 'high',
        color: '#ef5350',
      };
    }
  }

  // Default: hold
  return {
    action: 'HOLD',
    reason: 'No action triggers met. Monitor position.',
    urgency: 'low',
    color: '#66bb6a',
  };
}

/**
 * Delta monitoring rules (Section 6.4)
 */
export interface DeltaAlert {
  triggered: boolean;
  action: string;
  urgency: 'medium' | 'high';
  message: string;
}

export function evaluateDeltaAlert(
  shortDelta: number,
  marketCondition: MarketConditionLevel,
): DeltaAlert | null {
  if (shortDelta >= 0.30) {
    return {
      triggered: true,
      action: 'Close or roll immediately',
      urgency: 'high',
      message: `Short delta ${shortDelta.toFixed(2)} exceeds 0.30 — close or roll immediately.`,
    };
  }

  if (shortDelta >= 0.20 && marketCondition === 'YELLOW') {
    return {
      triggered: true,
      action: 'Roll immediately',
      urgency: 'high',
      message: `Short delta ${shortDelta.toFixed(2)} exceeds 0.20 in Yellow condition — roll immediately.`,
    };
  }

  if (shortDelta >= 0.20 && marketCondition === 'GREEN') {
    return {
      triggered: true,
      action: 'Monitor closely, consider rolling',
      urgency: 'medium',
      message: `Short delta ${shortDelta.toFixed(2)} exceeds 0.20 in Green — monitor closely.`,
    };
  }

  return null;
}
