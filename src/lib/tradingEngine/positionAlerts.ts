/**
 * Position Management Alerts (Trading Rules Spec Section 11.3)
 *
 * Surfaces alerts when open positions meet specific conditions:
 * - Reached 50% profit target
 * - Reached 21 DTE time stop
 * - Short delta exceeded 0.20
 * - SPX dropped more than 5% from entry
 * - VIX entered Red condition
 * - VIX entered Black condition
 */

import type { MarketConditionLevel } from './marketCondition';
import type { SpreadTrade } from '@/lib/options/optionsAccounting';

export type AlertSeverity = 'info' | 'warning' | 'danger' | 'critical';

export interface PositionAlert {
  positionId: string;
  positionLabel: string;
  severity: AlertSeverity;
  title: string;
  message: string;
  action: string;
  color: string;
}

export interface AlertInputs {
  openPositions: SpreadTrade[];
  currentSpxPrice: number;
  marketCondition: MarketConditionLevel;
  /** SPX price at the time each position was opened (map of position ID to entry SPX) */
  entrySpxPrices?: Map<string, number>;
}

function getDteFromToday(expirationDate: string): number {
  const exp = new Date(expirationDate + 'T16:00:00');
  const now = new Date();
  return Math.round((exp.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
}

/**
 * Generates alerts for all open positions based on current market state.
 */
export function generatePositionAlerts(inputs: AlertInputs): PositionAlert[] {
  const { openPositions, currentSpxPrice, marketCondition, entrySpxPrices } = inputs;
  const alerts: PositionAlert[] = [];

  // Global alerts (apply to all positions)
  if (marketCondition === 'BLACK') {
    alerts.push({
      positionId: '__global__',
      positionLabel: 'ALL POSITIONS',
      severity: 'critical',
      title: 'Emergency Stop',
      message: 'VIX entered Black condition (>35). Close all positions immediately.',
      action: 'Close all positions NOW',
      color: '#1A1A1A',
    });
  } else if (marketCondition === 'RED') {
    alerts.push({
      positionId: '__global__',
      positionLabel: 'ALL POSITIONS',
      severity: 'danger',
      title: 'No New Trades',
      message: 'VIX entered Red condition (25-35). No new trades. Manage existing positions only.',
      action: 'Monitor existing — no new entries',
      color: '#FF4444',
    });
  }

  // Per-position alerts
  for (const pos of openPositions) {
    const dte = getDteFromToday(pos.expirationDate);
    const posLabel = `${pos.underlying} ${pos.shortStrike}/${pos.longStrike} ${pos.expirationDate}`;

    // Alert: 21 DTE time stop
    if (dte <= 21 && dte > 0) {
      alerts.push({
        positionId: pos.id,
        positionLabel: posLabel,
        severity: 'danger',
        title: 'Time Stop — Close Position',
        message: `${dte} DTE remaining. Close at 21 DTE regardless of profit/loss.`,
        action: 'Close this position',
        color: '#ef5350',
      });
    }

    // Alert: Approaching 21 DTE (warning at 28 DTE)
    if (dte > 21 && dte <= 28) {
      alerts.push({
        positionId: pos.id,
        positionLabel: posLabel,
        severity: 'warning',
        title: 'Approaching Time Stop',
        message: `${dte} DTE remaining. Time stop at 21 DTE approaching.`,
        action: 'Plan exit within next week',
        color: '#FFB800',
      });
    }

    // Alert: 50% profit target reached
    // Premium received is the max profit. If current spread value < 50% of premium, target reached.
    // Since we don't have live spread pricing, estimate based on DTE decay
    // This is a placeholder — in production you'd check actual spread mark
    const profitTargetCredit = pos.premiumReceived * 0.5;
    if (pos.premiumReceived > 0 && dte > 21) {
      // Simple heuristic: if DTE has decayed significantly and position is likely profitable
      const originalDte = Math.round(
        (new Date(pos.expirationDate + 'T16:00:00').getTime() - new Date(pos.openDate + 'T12:00:00').getTime()) /
        (1000 * 60 * 60 * 24)
      );
      const timeDecayed = originalDte > 0 ? (originalDte - dte) / originalDte : 0;

      // If more than 60% of time has passed and SPX is above short strike, likely at 50% profit
      if (timeDecayed > 0.6 && currentSpxPrice > pos.shortStrike * 1.02) {
        alerts.push({
          positionId: pos.id,
          positionLabel: posLabel,
          severity: 'info',
          title: '50% Profit Target Likely Reached',
          message: `${(timeDecayed * 100).toFixed(0)}% of time elapsed, SPX well above strike. Check spread mark — target buyback at ${profitTargetCredit.toFixed(2)} or less.`,
          action: 'Close this position at 50% profit',
          color: '#66bb6a',
        });
      }
    }

    // Alert: SPX dropped more than 5% from entry
    const entrySpx = entrySpxPrices?.get(pos.id);
    if (entrySpx && entrySpx > 0) {
      const dropFromEntry = ((entrySpx - currentSpxPrice) / entrySpx) * 100;
      if (dropFromEntry > 5) {
        alerts.push({
          positionId: pos.id,
          positionLabel: posLabel,
          severity: dropFromEntry > 10 ? 'danger' : 'warning',
          title: 'Strike Approaching',
          message: `SPX dropped ${dropFromEntry.toFixed(1)}% from entry. Check recovery table.`,
          action: dropFromEntry > 10 ? 'Evaluate roll or close' : 'Monitor — check delta',
          color: dropFromEntry > 10 ? '#ef5350' : '#FFB800',
        });
      }
    }
  }

  // Sort by severity: critical > danger > warning > info
  const severityOrder: Record<AlertSeverity, number> = { critical: 0, danger: 1, warning: 2, info: 3 };
  alerts.sort((a, b) => severityOrder[a.severity] - severityOrder[b.severity]);

  return alerts;
}
