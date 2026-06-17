import { describe, it, expect } from 'vitest';
import { calculateWinRate, calculateCapitalEfficiency } from '../trader';
import type { OptionPositionRecord } from '@/types/database';

/**
 * Helper to create a minimal OptionPositionRecord for testing.
 * Only fields relevant to win rate calculation are required.
 */
function makePosition(
  overrides: Partial<OptionPositionRecord>
): OptionPositionRecord {
  return {
    id: 'pos-' + Math.random().toString(36).slice(2, 8),
    created: '2024-01-01T00:00:00Z',
    updated: '2024-01-01T00:00:00Z',
    account_id: 'acct-1',
    underlying_symbol: 'SPY',
    option_symbol: 'SPY240119P00450000',
    option_type: 'put',
    direction: 'short',
    strike_price: 450,
    expiration_date: '2024-01-19',
    contracts: 1,
    premium_per_contract: 2.5,
    total_premium: 250,
    status: 'open',
    opened_date: '2024-01-02',
    ...overrides,
  };
}

describe('calculateWinRate', () => {
  it('returns 0% win rate when there are no closed positions', () => {
    const positions = [
      makePosition({ status: 'open' }),
      makePosition({ status: 'open' }),
    ];

    const result = calculateWinRate(positions);

    expect(result.profitable_closes).toBe(0);
    expect(result.total_closes).toBe(0);
    expect(result.win_rate_pct).toBe(0);
  });

  it('returns 100% win rate when all positions are profitable', () => {
    const positions = [
      makePosition({ status: 'closed', pnl: 150 }),
      makePosition({ status: 'closed', pnl: 200 }),
      makePosition({ status: 'closed', pnl: 50 }),
    ];

    const result = calculateWinRate(positions);

    expect(result.profitable_closes).toBe(3);
    expect(result.total_closes).toBe(3);
    expect(result.win_rate_pct).toBe(100);
  });

  it('calculates correct percentage for a mix of profitable and unprofitable', () => {
    const positions = [
      makePosition({ status: 'closed', pnl: 150 }),  // profitable
      makePosition({ status: 'closed', pnl: -100 }), // unprofitable
      makePosition({ status: 'closed', pnl: 200 }),  // profitable
      makePosition({ status: 'closed', pnl: -50 }),  // unprofitable
    ];

    const result = calculateWinRate(positions);

    expect(result.profitable_closes).toBe(2);
    expect(result.total_closes).toBe(4);
    expect(result.win_rate_pct).toBe(50);
  });

  it('counts expired positions as profitable (expired OTM = full premium realized)', () => {
    const positions = [
      makePosition({ status: 'expired' }),            // profitable (expired OTM)
      makePosition({ status: 'expired' }),            // profitable (expired OTM)
      makePosition({ status: 'closed', pnl: -100 }), // unprofitable
    ];

    const result = calculateWinRate(positions);

    expect(result.profitable_closes).toBe(2);
    expect(result.total_closes).toBe(3);
    expect(result.win_rate_pct).toBeCloseTo(66.67, 1);
  });
});

describe('calculateCapitalEfficiency', () => {
  it('returns 0 when averageCollateral is 0', () => {
    const result = calculateCapitalEfficiency(1000, 0, 90);

    expect(result).toBe(0);
  });

  it('correctly annualizes premium and divides by average collateral', () => {
    // totalPremium = 1000, averageCollateral = 10000, periodDays = 365
    // annualized = 1000 * (365 / 365) = 1000
    // efficiency = 1000 / 10000 = 0.1
    const result = calculateCapitalEfficiency(1000, 10000, 365);
    expect(result).toBeCloseTo(0.1, 6);

    // totalPremium = 500, averageCollateral = 10000, periodDays = 90
    // annualized = 500 * (365 / 90) = 2027.78
    // efficiency = 2027.78 / 10000 = 0.202778
    const result2 = calculateCapitalEfficiency(500, 10000, 90);
    expect(result2).toBeCloseTo(500 * (365 / 90) / 10000, 6);
  });
});
