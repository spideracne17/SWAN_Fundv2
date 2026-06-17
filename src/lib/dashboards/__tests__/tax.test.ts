import { describe, it, expect } from 'vitest';
import { detectTLHOpportunities } from '../tax';
import type { PositionSummary } from '../accounting';

/**
 * Helper to create a minimal PositionSummary for testing.
 */
function makePosition(overrides: Partial<PositionSummary> & { symbol: string }): PositionSummary {
  return {
    shares: 100,
    cost_basis: 5000,
    market_value: 4000,
    unrealized_gain_loss: -1000,
    ...overrides,
  };
}

describe('detectTLHOpportunities', () => {
  it('includes position with unrealized loss exceeding $1000', () => {
    const positions: PositionSummary[] = [
      makePosition({ symbol: 'AAPL', unrealized_gain_loss: -1500, cost_basis: 10000, market_value: 8500 }),
    ];

    const result = detectTLHOpportunities(positions, []);

    expect(result).toHaveLength(1);
    expect(result[0]!.symbol).toBe('AAPL');
    expect(result[0]!.unrealized_loss).toBe(1500);
    expect(result[0]!.cost_basis).toBe(10000);
    expect(result[0]!.market_value).toBe(8500);
    expect(result[0]!.wash_sale_restricted).toBe(false);
  });

  it('excludes position with loss less than or equal to $1000', () => {
    const positions: PositionSummary[] = [
      makePosition({ symbol: 'MSFT', unrealized_gain_loss: -999 }),
      makePosition({ symbol: 'GOOG', unrealized_gain_loss: -1000 }), // Exactly -1000 is NOT > 1000
    ];

    const result = detectTLHOpportunities(positions, []);

    expect(result).toHaveLength(0);
  });

  it('excludes position whose symbol is in washSaleSymbols list', () => {
    const positions: PositionSummary[] = [
      makePosition({ symbol: 'TSLA', unrealized_gain_loss: -2000 }),
    ];

    const result = detectTLHOpportunities(positions, ['TSLA']);

    expect(result).toHaveLength(0);
  });

  it('handles case-insensitive wash sale symbol matching', () => {
    const positions: PositionSummary[] = [
      makePosition({ symbol: 'aapl', unrealized_gain_loss: -5000 }),
    ];

    const result = detectTLHOpportunities(positions, ['AAPL']);

    expect(result).toHaveLength(0);
  });

  it('excludes position without market data (unrealized_gain_loss undefined)', () => {
    const positions: PositionSummary[] = [
      makePosition({ symbol: 'NVDA', unrealized_gain_loss: undefined }),
    ];

    const result = detectTLHOpportunities(positions, []);

    expect(result).toHaveLength(0);
  });

  it('excludes position without market data (unrealized_gain_loss null)', () => {
    const positions: PositionSummary[] = [
      makePosition({ symbol: 'META', unrealized_gain_loss: null as unknown as undefined }),
    ];

    const result = detectTLHOpportunities(positions, []);

    expect(result).toHaveLength(0);
  });
});
