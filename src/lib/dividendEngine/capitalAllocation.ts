/**
 * Capital Allocation Engine (Dividend OS V4)
 *
 * Answers: "Where should my next dollar go?"
 *
 * Priority:
 *   1. Quality Score >= 80
 *   2. Fill weakest income months
 *   3. Buy undervalued holdings (relative yield > 110%)
 *   4. Maintain diversification (no position > 5%, no sector > 20%)
 */

import type { DividendStockData } from './qualityScoring';
import type { QualityScore } from './qualityScoring';
import type { IncomeSmoothingResult } from './incomeSmoothing';

export interface AllocationCandidate {
  symbol: string;
  name: string;
  allocationPct: number;
  reason: string;
  score: number;
  priorityLevel: 1 | 2 | 3 | 4;
  calendarGroup: 'A' | 'B' | 'C';
}

export interface AllocationResult {
  candidates: AllocationCandidate[];
  investmentAmount: number;
  bestBuy: string;
  mostUndervalued: string;
  weakestGroup: 'A' | 'B' | 'C';
}

export interface AllocationInputs {
  availableCash: number;
  holdings: DividendStockData[];
  qualityScores: QualityScore[];
  smoothingResult: IncomeSmoothingResult;
  /** Total portfolio value for position sizing */
  totalPortfolioValue: number;
}

/**
 * Generates capital allocation recommendations.
 */
export function calculateAllocation(inputs: AllocationInputs): AllocationResult {
  const { availableCash, holdings, qualityScores, smoothingResult, totalPortfolioValue } = inputs;

  const candidates: AllocationCandidate[] = [];

  // Find the weakest calendar group
  const sortedGroups = [...smoothingResult.groupTotals].sort((a, b) => a.total - b.total);
  const weakestGroup = sortedGroups[0]?.group ?? 'B';

  // Score each holding for allocation priority
  for (const stock of holdings) {
    const quality = qualityScores.find((q) => q.symbol === stock.symbol);
    if (!quality) continue;

    let priorityScore = 0;
    let reason = '';
    let priorityLevel: 1 | 2 | 3 | 4 = 4;

    // Priority 1: Quality >= 80
    if (quality.totalScore >= 80) {
      priorityScore += 40;
      priorityLevel = 1;
      reason = `Quality ${quality.totalScore.toFixed(0)} (${quality.rating})`;
    }

    // Priority 2: Fills weakest income month (matching calendar group)
    if (stock.calendarGroup === weakestGroup) {
      priorityScore += 30;
      if (priorityLevel > 2) priorityLevel = 2;
      reason += (reason ? ' + ' : '') + `Fills weak Group ${weakestGroup}`;
    }

    // Priority 3: Undervalued (relative yield > 110%)
    if (quality.relativeYield > 110) {
      priorityScore += 20;
      if (priorityLevel > 3) priorityLevel = 3;
      reason += (reason ? ' + ' : '') + `Undervalued (${quality.relativeYield.toFixed(0)}% relative yield)`;
    }

    // Priority 4: Diversification check
    const currentWeight = totalPortfolioValue > 0
      ? (stock.sharesHeld * (stock.costBasis / Math.max(stock.sharesHeld, 1))) / totalPortfolioValue * 100
      : 0;
    if (currentWeight < 5) {
      priorityScore += 10;
      reason += (reason ? ' + ' : '') + `Position ${currentWeight.toFixed(1)}% (< 5% max)`;
    }

    if (priorityScore > 0 && quality.totalScore >= 70) {
      candidates.push({
        symbol: stock.symbol,
        name: stock.name,
        allocationPct: 0, // Will be calculated below
        reason: reason || 'Meets minimum criteria',
        score: priorityScore,
        priorityLevel,
        calendarGroup: stock.calendarGroup,
      });
    }
  }

  // Sort by score and assign allocation percentages
  candidates.sort((a, b) => b.score - a.score);
  const totalScore = candidates.reduce((s, c) => s + c.score, 0);

  if (totalScore > 0) {
    // Top candidates get proportional allocation
    const topCandidates = candidates.slice(0, 5);
    const topTotal = topCandidates.reduce((s, c) => s + c.score, 0);
    for (const c of topCandidates) {
      c.allocationPct = Math.round((c.score / topTotal) * 100);
    }
  }

  const bestBuy = candidates[0]?.symbol ?? '—';
  const mostUndervalued = candidates
    .filter((c) => c.reason.includes('Undervalued'))
    .sort((a, b) => b.score - a.score)[0]?.symbol ?? '—';

  return {
    candidates: candidates.slice(0, 5),
    investmentAmount: availableCash,
    bestBuy,
    mostUndervalued,
    weakestGroup,
  };
}
