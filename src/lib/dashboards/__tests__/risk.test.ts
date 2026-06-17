import { describe, it, expect } from 'vitest';
import { calculateMaxDrawdown } from '../risk';

describe('calculateMaxDrawdown', () => {
  it('calculates correct drawdown from peak 120 to trough 90', () => {
    const values = [100, 120, 90];
    const result = calculateMaxDrawdown(values);

    // Peak is 120, trough is 90 → (90-120)/120 * 100 = -25%
    expect(result.maxDrawdown).toBeCloseTo(-25, 2);
    expect(result.peakIndex).toBe(1);
    expect(result.troughIndex).toBe(2);
  });

  it('returns 0% drawdown for monotonically increasing values', () => {
    const values = [100, 110, 120, 130, 140, 150];
    const result = calculateMaxDrawdown(values);

    expect(result.maxDrawdown).toBe(0);
  });

  it('returns 0 for empty array', () => {
    const result = calculateMaxDrawdown([]);

    expect(result.maxDrawdown).toBe(0);
    expect(result.peakIndex).toBe(0);
    expect(result.troughIndex).toBe(0);
  });

  it('returns 0 for single-element array', () => {
    const result = calculateMaxDrawdown([100]);

    expect(result.maxDrawdown).toBe(0);
  });

  it('finds the largest drawdown when multiple drawdowns exist', () => {
    // Peak 120 → trough 80 = -33.33%, then peak 150 → trough 100 = -33.33%
    const values = [100, 120, 80, 110, 150, 100];
    const result = calculateMaxDrawdown(values);

    // The second drawdown: peak 150 → trough 100 = -33.33%
    // The first drawdown: peak 120 → trough 80 = -33.33%
    // Both are -33.33%, the first one found is recorded
    expect(result.maxDrawdown).toBeCloseTo(-33.33, 2);
  });
});
