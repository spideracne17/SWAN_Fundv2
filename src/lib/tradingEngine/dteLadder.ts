/**
 * DTE Ladder Engine (Trading Rules Spec Section 5)
 *
 * Four rungs with priority order, availability based on market condition,
 * and slot allocation rules.
 *
 * Priority 1: 90 DTE — always first
 * Priority 2: 120 DTE — second if slots remain
 * Priority 3: 60-70 DTE — only if VIX > 20, NEVER in Yellow
 * Priority 4: 140-150 DTE — sparingly, delayed recovery scenarios
 */

import type { MarketConditionLevel } from './marketCondition';

export interface DteLadderRung {
  priority: number;
  label: string;
  dteRange: string;
  dteMin: number;
  dteMax: number;
  available: boolean;
  disabledReason: string | null;
  thetaBehavior: 'fast' | 'medium' | 'slow';
  thetaDescription: string;
  notes: string;
  /** Whether a slot is currently occupied at this rung */
  occupied: boolean;
}

export interface DteLadderState {
  rungs: DteLadderRung[];
  availableRungs: number;
  totalRungs: number;
  slotsAvailable: number;
  fillOrder: string;
}

/**
 * Determines which DTE rungs are available given current conditions.
 */
export function evaluateDteLadder(
  marketCondition: MarketConditionLevel,
  vixLevel: number,
  slotsAvailable: number,
  /** DTE values of currently open positions */
  openPositionDTEs: number[],
): DteLadderState {
  const isYellow = marketCondition === 'YELLOW';
  const isRedOrBlack = marketCondition === 'RED' || marketCondition === 'BLACK';

  // Check which rungs have occupied positions
  const has90 = openPositionDTEs.some((d) => d >= 75 && d <= 105);
  const has120 = openPositionDTEs.some((d) => d >= 106 && d <= 135);
  const has60 = openPositionDTEs.some((d) => d >= 50 && d <= 74);
  const has140 = openPositionDTEs.some((d) => d >= 136 && d <= 160);

  const rungs: DteLadderRung[] = [
    {
      priority: 1,
      label: '90 DTE',
      dteRange: '75–105',
      dteMin: 75,
      dteMax: 105,
      available: !isRedOrBlack && slotsAvailable >= 1,
      disabledReason: isRedOrBlack ? 'No new trades in Red/Black' : slotsAvailable < 1 ? 'No slots available' : null,
      thetaBehavior: 'medium',
      thetaDescription: 'Burns meaningfully within 3-4 weeks',
      notes: 'Enter first on every dip entry, no exceptions. Best balance of premium and time buffer.',
      occupied: has90,
    },
    {
      priority: 2,
      label: '120 DTE',
      dteRange: '106–135',
      dteMin: 106,
      dteMax: 135,
      available: !isRedOrBlack && slotsAvailable >= 2,
      disabledReason: isRedOrBlack ? 'No new trades in Red/Black' : slotsAvailable < 2 ? 'Need 2+ slots' : null,
      thetaBehavior: 'slow',
      thetaDescription: 'Slower early theta, maximum time buffer',
      notes: 'Enter second. Best when recovery will be moderate-paced.',
      occupied: has120,
    },
    {
      priority: 3,
      label: '60–70 DTE',
      dteRange: '50–74',
      dteMin: 50,
      dteMax: 74,
      available: !isRedOrBlack && !isYellow && vixLevel >= 20 && slotsAvailable >= 3,
      disabledReason: isRedOrBlack
        ? 'No new trades in Red/Black'
        : isYellow
          ? 'Not available in Yellow condition — insufficient time buffer'
          : vixLevel < 20
            ? 'VIX must be above 20 for this rung'
            : slotsAvailable < 3
              ? 'Need 3+ slots'
              : null,
      thetaBehavior: 'fast',
      thetaDescription: 'Fastest theta burn — quick premium collection',
      notes: 'Enter third, only if VIX genuinely above 20. Do NOT use in Yellow.',
      occupied: has60,
    },
    {
      priority: 4,
      label: '140–150 DTE',
      dteRange: '136–160',
      dteMin: 136,
      dteMax: 160,
      available: !isRedOrBlack && slotsAvailable >= 4,
      disabledReason: isRedOrBlack ? 'No new trades in Red/Black' : slotsAvailable < 4 ? 'Need 4+ slots' : null,
      thetaBehavior: 'slow',
      thetaDescription: 'Slowest burn — ties up buying power longest',
      notes: 'Use sparingly. Reserve for delayed recovery scenarios (Fed uncertainty, slow bear).',
      occupied: has140,
    },
  ];

  const availableRungs = rungs.filter((r) => r.available).length;

  // Fill order based on available slots (Section 5.2)
  let fillOrder: string;
  if (isYellow) {
    if (slotsAvailable >= 2) fillOrder = '90 DTE → 120 DTE (Yellow: no 60-70)';
    else fillOrder = '90 DTE only (Yellow: no 60-70)';
  } else if (slotsAvailable >= 4) {
    fillOrder = '90 DTE → 120 DTE → 60-70 DTE → 140-150 DTE';
  } else if (slotsAvailable >= 3) {
    fillOrder = '90 DTE → 120 DTE → 60-70 DTE';
  } else if (slotsAvailable >= 2) {
    fillOrder = '90 DTE → 120 DTE';
  } else {
    fillOrder = '90 DTE only';
  }

  return {
    rungs,
    availableRungs,
    totalRungs: 4,
    slotsAvailable,
    fillOrder,
  };
}
