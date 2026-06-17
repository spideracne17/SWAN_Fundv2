/**
 * VIX Trend Pattern Classification (Trading Rules Spec Section 3)
 *
 * Four patterns based on VIX vs its 20-day average:
 *   Pattern 1: VIX spiking above 20-day avg (Enter now)
 *   Pattern 2: VIX spiked and now fading (Enter now)
 *   Pattern 3: VIX elevated 3+ weeks without fading (Wait)
 *   Pattern 4: VIX low / below 20-day avg (Skip)
 */

export type VixPatternNumber = 1 | 2 | 3 | 4;

export interface VixPattern {
  pattern: VixPatternNumber;
  label: string;
  signal: string;
  reasoning: string;
  canEnter: boolean;
  color: string;
}

export interface VixPatternInputs {
  currentVix: number;
  vix20DayAvg: number | null;
  /** VIX values for last 5 trading days (most recent last) */
  recentVixValues: number[];
  /** Number of consecutive weeks VIX has been above 20-day avg */
  weeksElevated: number;
}

/**
 * Determines VIX direction from recent values.
 * Rising = last value > 3-day-ago value
 * Falling = last value < 3-day-ago value
 * Flat = neither
 */
function getVixDirection(recentValues: number[]): 'rising' | 'falling' | 'flat' {
  if (recentValues.length < 4) return 'flat';
  const current = recentValues[recentValues.length - 1]!;
  const threeDaysAgo = recentValues[recentValues.length - 4]!;
  const diff = ((current - threeDaysAgo) / threeDaysAgo) * 100;

  if (diff > 2) return 'rising';
  if (diff < -2) return 'falling';
  return 'flat';
}

/**
 * Classifies the current VIX trend into one of 4 patterns.
 */
export function classifyVixPattern(inputs: VixPatternInputs): VixPattern {
  const { currentVix, vix20DayAvg, recentVixValues, weeksElevated } = inputs;

  // If we don't have the 20-day average, default to Pattern 4 (skip)
  if (vix20DayAvg === null) {
    return {
      pattern: 4,
      label: 'VIX Low / Below Average',
      signal: 'Skip this setup',
      reasoning: 'Insufficient data to determine VIX trend pattern.',
      canEnter: false,
      color: '#9e9e9e',
    };
  }

  const isAboveAvg = currentVix > vix20DayAvg;
  const direction = getVixDirection(recentVixValues);

  // Pattern 4: VIX at or below 20-day average
  if (!isAboveAvg) {
    return {
      pattern: 4,
      label: 'VIX Low / Below Average',
      signal: 'Skip this setup',
      reasoning: 'Selling cheap options with no head start. Premiums are thin. Wait for a pullback.',
      canEnter: false,
      color: '#9e9e9e',
    };
  }

  // Pattern 3: VIX elevated 3+ consecutive weeks without fading
  if (weeksElevated >= 3 && direction !== 'falling') {
    return {
      pattern: 3,
      label: 'VIX Elevated 3+ Weeks',
      signal: 'Wait — do not enter',
      reasoning: 'Trending bear market pattern. Wait for VIX to show a clear fading signal.',
      canEnter: false,
      color: '#ef5350',
    };
  }

  // Pattern 2: VIX spiked and now fading (above avg but declining)
  if (direction === 'falling') {
    return {
      pattern: 2,
      label: 'VIX Spiked & Fading',
      signal: 'Enter now',
      reasoning: 'Peak fear has passed, direction turning. Premiums still elevated. Best risk/reward entry.',
      canEnter: true,
      color: '#4fc3f7',
    };
  }

  // Pattern 1: VIX spiking above its 20-day average (above avg and rising)
  return {
    pattern: 1,
    label: 'VIX Spiking Above Average',
    signal: 'Enter now',
    reasoning: 'Premiums elevated. Market already fallen. 10% strike cushion starts from stressed base.',
    canEnter: true,
    color: '#66bb6a',
  };
}

/**
 * Estimates weeks elevated from historical VIX data.
 * Counts consecutive weeks (5-day blocks) where VIX was above its running average.
 */
export function estimateWeeksElevated(
  vixCloses: number[],
  avgPeriod: number = 20,
): number {
  if (vixCloses.length < avgPeriod + 5) return 0;

  let weeksAbove = 0;

  // Check each week (5 trading days) going backwards
  for (let weekEnd = vixCloses.length - 1; weekEnd >= avgPeriod; weekEnd -= 5) {
    // Calculate 20-day avg ending at the start of this week
    const avgStart = weekEnd - 5;
    if (avgStart < avgPeriod) break;

    const avgSlice = vixCloses.slice(avgStart - avgPeriod, avgStart);
    const avg = avgSlice.reduce((s, v) => s + v, 0) / avgSlice.length;

    // Check if the week's values were above average
    const weekValues = vixCloses.slice(weekEnd - 4, weekEnd + 1);
    const weekAbove = weekValues.every((v) => v > avg);

    if (weekAbove) {
      weeksAbove++;
    } else {
      break; // Not consecutive anymore
    }
  }

  return weeksAbove;
}
