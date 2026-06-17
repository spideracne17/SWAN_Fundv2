/**
 * Circuit Breaker & Black Swan Protocol
 *
 * Drawdown Circuit Breakers:
 *   10% drawdown → reduce sizing 50%
 *   15% drawdown → pause 2 weeks
 *   20% drawdown → capital preservation mode
 *
 * Black Swan Triggers (ANY):
 *   SPX declines ≥10% within 20 trading days
 *   VIX exceeds 45
 *   VIX increases >100% within 20 trading days
 *   Portfolio drawdown exceeds 15%
 *   Multiple positions threatened simultaneously
 */

export interface CircuitBreakerStatus {
  // Drawdown breakers
  drawdownPct: number;
  drawdown10Active: boolean; // reduce 50%
  drawdown15Active: boolean; // pause 2 weeks
  drawdown20Active: boolean; // full stop

  // Black swan
  isBlackSwan: boolean;
  blackSwanTriggers: string[];

  // Recovery status
  inRecoveryPhase: boolean;
  recoveryConditions: { label: string; met: boolean }[];

  // Overall
  anyActive: boolean;
  maxSizingMultiplier: number; // 0 = no trades, 0.5 = half, 1 = normal
  statusLabel: string;
  statusColor: string;
}

export interface CircuitBreakerInputs {
  accountValue: number;
  peakAccountValue: number; // highest account value recorded
  vixLevel: number;
  vix20DayAgo: number | null;
  spxPrice: number;
  spx20DayAgo: number | null;
  openPositionsCount: number;
  threatenedPositionsCount: number; // positions where SPX is within 2% of short strike
  spx200DMA: number | null;
  portfolioHeatPct: number;
}

export function evaluateCircuitBreakers(inputs: CircuitBreakerInputs): CircuitBreakerStatus {
  const { accountValue, peakAccountValue, vixLevel, vix20DayAgo, spxPrice, spx20DayAgo, threatenedPositionsCount, spx200DMA, portfolioHeatPct } = inputs;

  // Drawdown calculation
  const drawdownPct = peakAccountValue > 0 ? ((peakAccountValue - accountValue) / peakAccountValue) * 100 : 0;
  const drawdown10Active = drawdownPct >= 10;
  const drawdown15Active = drawdownPct >= 15;
  const drawdown20Active = drawdownPct >= 20;

  // Black swan triggers
  const blackSwanTriggers: string[] = [];

  // SPX declines >=10% within 20 trading days
  if (spx20DayAgo !== null) {
    const spxDecline = ((spx20DayAgo - spxPrice) / spx20DayAgo) * 100;
    if (spxDecline >= 10) {
      blackSwanTriggers.push(`SPX declined ${spxDecline.toFixed(1)}% in 20 days`);
    }
  }

  // VIX exceeds 45
  if (vixLevel > 45) {
    blackSwanTriggers.push(`VIX at ${vixLevel.toFixed(1)} (>45)`);
  }

  // VIX increased >100% within 20 days
  if (vix20DayAgo !== null && vix20DayAgo > 0) {
    const vixExpansion = ((vixLevel - vix20DayAgo) / vix20DayAgo) * 100;
    if (vixExpansion > 100) {
      blackSwanTriggers.push(`VIX expanded ${vixExpansion.toFixed(0)}% in 20 days`);
    }
  }

  // Portfolio drawdown exceeds 15%
  if (drawdown15Active) {
    blackSwanTriggers.push(`Portfolio drawdown ${drawdownPct.toFixed(1)}%`);
  }

  // Multiple positions threatened
  if (threatenedPositionsCount >= 2) {
    blackSwanTriggers.push(`${threatenedPositionsCount} positions threatened`);
  }

  const isBlackSwan = blackSwanTriggers.length > 0;

  // Recovery conditions (to resume after black swan)
  const recoveryConditions = [
    { label: 'VIX below 30', met: vixLevel < 30 },
    { label: 'SPX above 20-day MA', met: spx20DayAgo !== null ? spxPrice > spx20DayAgo : true },
    { label: 'Portfolio heat below 20%', met: portfolioHeatPct < 20 },
    { label: 'No active circuit breakers', met: !drawdown10Active },
    { label: 'SPX above 200 DMA', met: spx200DMA !== null ? spxPrice > spx200DMA : true },
  ];

  const inRecoveryPhase = isBlackSwan && recoveryConditions.filter((c) => c.met).length >= 3;

  // Determine overall status
  let maxSizingMultiplier = 1.0;
  let statusLabel = 'Normal';
  let statusColor = '#66bb6a';

  if (isBlackSwan || drawdown20Active) {
    maxSizingMultiplier = 0;
    statusLabel = isBlackSwan ? 'BLACK SWAN — NO TRADES' : 'DRAWDOWN 20% — FULL STOP';
    statusColor = '#ef5350';
  } else if (drawdown15Active) {
    maxSizingMultiplier = 0;
    statusLabel = 'DRAWDOWN 15% — PAUSED';
    statusColor = '#ef5350';
  } else if (drawdown10Active) {
    maxSizingMultiplier = 0.5;
    statusLabel = 'DRAWDOWN 10% — HALF SIZE';
    statusColor = '#ffca28';
  }

  if (inRecoveryPhase) {
    maxSizingMultiplier = 0.5;
    statusLabel = 'RECOVERY — 50% SIZE';
    statusColor = '#ffca28';
  }

  const anyActive = isBlackSwan || drawdown10Active || drawdown15Active || drawdown20Active;

  return {
    drawdownPct,
    drawdown10Active,
    drawdown15Active,
    drawdown20Active,
    isBlackSwan,
    blackSwanTriggers,
    inRecoveryPhase,
    recoveryConditions,
    anyActive,
    maxSizingMultiplier,
    statusLabel,
    statusColor,
  };
}
