import { describe, it, expect } from 'vitest';
import { isTradeCapacityDisabled } from './tradeCapacityGate';

describe('isTradeCapacityDisabled', () => {
  it('returns true when data is stale', () => {
    expect(isTradeCapacityDisabled(true)).toBe(true);
  });

  it('returns false when data is fresh', () => {
    expect(isTradeCapacityDisabled(false)).toBe(false);
  });
});
