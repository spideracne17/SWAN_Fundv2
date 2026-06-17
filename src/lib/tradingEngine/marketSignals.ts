/**
 * Market Signals Engine
 *
 * Evaluates VIX level, SPX position relative to highs/200DMA,
 * volatility expansion rate, and correction depth to produce
 * a trading signal.
 */

/* ─── Types ────────────────────────────────────────────────────────────── */

export type TradingSignalLevel = 'GO' | 'CAUTION' | 'NO_TRADE';

export interface MarketConditions {
  spxPrice: number;
  spx52WeekHigh: number;
  spx52WeekLow: number;
  spx200DMA: number | null;
  vixLevel: number;
  vix5DayAgo: number | null; // VIX level 5 trading days ago (for expansion calc)
  vix20DayAgo: number | null; // VIX level 20 trading days ago (for black swan)
  spx20DayAgo: number | null; // SPX price 20 trading days ago (for crash detection)
}

export interface VolatilityAssessment {
  label: string; // "Low", "Normal", "Elevated", "High", "Extreme"
  color: string; // CSS color
  sizingMultiplier: number; // 1.0 = normal, 0.5 = half, 0 = no trade
  description: string;
}

export interface CorrectionAssessment {
  pctFromHigh: number;
  label: string;
  color: string;
  sizingNote: string;
}

export interface TrendAssessment {
  label: string; // "Bullish", "Neutral", "Bearish"
  color: string;
  sizingMultiplier: number;
  pctFrom200DMA: number | null;
}

export interface VolatilityExpansion {
  pct5Day: number | null;
  pct20Day: number | null;
  isRapid: boolean; // >25% in 5 days
  isExtreme: boolean; // >50% in 5 days
  isBlackSwan20Day: boolean; // >100% in 20 days
}

export interface SpxDecline {
  pct20Day: number | null;
  isBlackSwanDecline: boolean; // >=10% in 20 days
}

export interface TradingSignal {
  level: TradingSignalLevel;
  reasons: string[];
  volatility: VolatilityAssessment;
  correction: CorrectionAssessment;
  trend: TrendAssessment;
  vixExpansion: VolatilityExpansion;
  spxDecline: SpxDecline;
  suggestedSizing: number; // 0-100% of normal
  isBlackSwan: boolean;
}

/* ─── Volatility Framework ─────────────────────────────────────────────── */

export function assessVolatility(vix: number): VolatilityAssessment {
  if (vix < 12) {
    return { label: 'Low', color: '#9e9e9e', sizingMultiplier: 0, description: 'No new positions — premium too small' };
  }
  if (vix <= 25) {
    return { label: 'Normal', color: '#66bb6a', sizingMultiplier: 1.0, description: 'Normal position sizing' };
  }
  if (vix <= 35) {
    return { label: 'Elevated', color: '#4fc3f7', sizingMultiplier: 1.0, description: 'Preferred opportunity zone' };
  }
  if (vix <= 45) {
    return { label: 'High', color: '#ffca28', sizingMultiplier: 0.5, description: 'Reduce size by 50%' };
  }
  return { label: 'Extreme', color: '#ef5350', sizingMultiplier: 0.25, description: 'Trade selectively, defensive posture' };
}

/* ─── Correction Framework ─────────────────────────────────────────────── */

export function assessCorrection(spxPrice: number, spx52WeekHigh: number): CorrectionAssessment {
  const pctFromHigh = ((spx52WeekHigh - spxPrice) / spx52WeekHigh) * 100;

  if (pctFromHigh <= 2) {
    return { pctFromHigh, label: 'Near All-Time High', color: '#ef5350', sizingNote: 'Smallest allocations' };
  }
  if (pctFromHigh <= 5) {
    return { pctFromHigh, label: '3-5% Correction', color: '#66bb6a', sizingNote: 'Normal allocations' };
  }
  if (pctFromHigh <= 10) {
    return { pctFromHigh, label: '5-10% Correction', color: '#4fc3f7', sizingNote: 'Preferred opportunity zone' };
  }
  if (pctFromHigh <= 15) {
    return { pctFromHigh, label: '10-15% Correction', color: '#ffca28', sizingNote: 'Reduce size, evaluate trend' };
  }
  return { pctFromHigh, label: '>15% Correction', color: '#ef5350', sizingNote: 'Defensive posture, capital preservation' };
}

/* ─── Trend Filter ─────────────────────────────────────────────────────── */

export function assessTrend(spxPrice: number, spx200DMA: number | null): TrendAssessment {
  if (spx200DMA === null) {
    return { label: 'Unknown', color: '#9e9e9e', sizingMultiplier: 1.0, pctFrom200DMA: null };
  }

  const pctFrom200DMA = ((spxPrice - spx200DMA) / spx200DMA) * 100;

  if (pctFrom200DMA > 5) {
    return { label: 'Bullish', color: '#66bb6a', sizingMultiplier: 1.0, pctFrom200DMA };
  }
  if (pctFrom200DMA >= -5) {
    return { label: 'Neutral', color: '#ffca28', sizingMultiplier: 1.0, pctFrom200DMA };
  }
  return { label: 'Bearish', color: '#ef5350', sizingMultiplier: 0.5, pctFrom200DMA };
}

/* ─── Volatility Expansion ─────────────────────────────────────────────── */

export function assessVixExpansion(vixNow: number, vix5DayAgo: number | null, vix20DayAgo: number | null): VolatilityExpansion {
  const pct5Day = vix5DayAgo !== null ? ((vixNow - vix5DayAgo) / vix5DayAgo) * 100 : null;
  const pct20Day = vix20DayAgo !== null ? ((vixNow - vix20DayAgo) / vix20DayAgo) * 100 : null;

  return {
    pct5Day,
    pct20Day,
    isRapid: pct5Day !== null && pct5Day > 25,
    isExtreme: pct5Day !== null && pct5Day > 50,
    isBlackSwan20Day: pct20Day !== null && pct20Day > 100,
  };
}

/* ─── SPX Decline Detection ────────────────────────────────────────────── */

export function assessSpxDecline(spxNow: number, spx20DayAgo: number | null): SpxDecline {
  const pct20Day = spx20DayAgo !== null ? ((spx20DayAgo - spxNow) / spx20DayAgo) * 100 : null;

  return {
    pct20Day,
    isBlackSwanDecline: pct20Day !== null && pct20Day >= 10,
  };
}

/* ─── Main Evaluation ──────────────────────────────────────────────────── */

export function evaluateMarketConditions(conditions: MarketConditions): TradingSignal {
  const volatility = assessVolatility(conditions.vixLevel);
  const correction = assessCorrection(conditions.spxPrice, conditions.spx52WeekHigh);
  const trend = assessTrend(conditions.spxPrice, conditions.spx200DMA);
  const vixExpansion = assessVixExpansion(conditions.vixLevel, conditions.vix5DayAgo, conditions.vix20DayAgo);
  const spxDecline = assessSpxDecline(conditions.spxPrice, conditions.spx20DayAgo);

  const reasons: string[] = [];
  let sizing = 100; // start at 100%

  // Black Swan detection
  const isBlackSwan =
    conditions.vixLevel > 45 ||
    vixExpansion.isBlackSwan20Day ||
    spxDecline.isBlackSwanDecline;

  if (isBlackSwan) {
    reasons.push('BLACK SWAN PROTOCOL ACTIVE');
    sizing = 0;
  }

  // VIX filter
  if (volatility.sizingMultiplier === 0) {
    reasons.push(`VIX too low (${conditions.vixLevel.toFixed(1)}) — no premium`);
    sizing = 0;
  } else {
    sizing = Math.min(sizing, volatility.sizingMultiplier * 100);
    if (volatility.sizingMultiplier < 1) {
      reasons.push(`VIX ${volatility.label} — reduce to ${(volatility.sizingMultiplier * 100).toFixed(0)}%`);
    }
  }

  // Trend filter
  if (trend.sizingMultiplier < 1) {
    sizing = Math.min(sizing, trend.sizingMultiplier * 100);
    reasons.push(`SPX below 200 DMA (${trend.label}) — reduce to 50%`);
  }

  // Correction filter
  if (correction.pctFromHigh <= 2) {
    sizing = Math.min(sizing, 25);
    reasons.push('Near ATH — smallest allocations');
  } else if (correction.pctFromHigh > 15) {
    sizing = Math.min(sizing, 25);
    reasons.push('>15% correction — defensive posture');
  }

  // VIX expansion filters
  if (vixExpansion.isExtreme && sizing > 0) {
    sizing = 0;
    reasons.push('VIX expanded >50% in 5 days — PAUSE');
  } else if (vixExpansion.isRapid && sizing > 0) {
    sizing = Math.min(sizing, 50);
    reasons.push('VIX expanded >25% in 5 days — reduce 50%');
  }

  // Determine signal level
  let level: TradingSignalLevel;
  if (sizing === 0) {
    level = 'NO_TRADE';
  } else if (sizing < 100) {
    level = 'CAUTION';
  } else {
    level = 'GO';
    if (correction.pctFromHigh >= 5 && correction.pctFromHigh <= 10) {
      reasons.push('Preferred opportunity zone (5-10% correction)');
    }
    if (volatility.label === 'Elevated') {
      reasons.push('Elevated VIX — good premium available');
    }
  }

  if (reasons.length === 0) {
    reasons.push('All conditions normal — proceed with standard sizing');
  }

  return {
    level,
    reasons,
    volatility,
    correction,
    trend,
    vixExpansion,
    spxDecline,
    suggestedSizing: sizing,
    isBlackSwan,
  };
}
