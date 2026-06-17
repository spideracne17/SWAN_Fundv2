import { describe, it, expect } from 'vitest';
import * as fc from 'fast-check';
import { adjustLotsForSplit } from '../stockSplits';
import type { TaxLotRecord } from '@/types/database';

/**
 * Property-based tests for stock split lot adjustment.
 *
 * **Validates: Requirements 1.2**
 */
describe('adjustLotsForSplit - property-based tests', () => {
  it('for any valid split ratio and lot, total_cost_basis is unchanged after adjustment', () => {
    const splitRatioArb = fc
      .record({
        from: fc.integer({ min: 1, max: 10 }),
        to: fc.integer({ min: 1, max: 10 }),
      })
      .filter(({ from, to }) => from !== to);

    const lotArb = fc
      .record({
        shares: fc.integer({ min: 1, max: 10000 }),
        costPerShare: fc.double({ min: 0.01, max: 1000, noNaN: true, noDefaultInfinity: true }),
      })
      .map(({ shares, costPerShare }) => {
        const roundedCost = Math.round(costPerShare * 100) / 100;
        const totalCostBasis = shares * roundedCost;
        return {
          id: 'lot-1',
          created: '2024-01-01T00:00:00Z',
          updated: '2024-01-01T00:00:00Z',
          account_id: 'acc-1',
          symbol: 'AAPL',
          acquisition_date: '2023-06-15',
          shares_acquired: shares,
          remaining_shares: shares,
          cost_per_share: roundedCost,
          total_cost_basis: totalCostBasis,
          acquisition_type: 'buy' as const,
          status: 'open' as const,
          split_adjusted: false,
        } satisfies TaxLotRecord;
      });

    fc.assert(
      fc.property(splitRatioArb, lotArb, ({ from, to }, lot) => {
        const originalTotalCostBasis = lot.total_cost_basis;

        const { adjustedLots } = adjustLotsForSplit(
          'AAPL',
          from,
          to,
          '2024-01-01',
          [lot],
        );

        const adjustedLot = adjustedLots[0]!;

        // total_cost_basis should remain unchanged after split adjustment
        expect(adjustedLot.total_cost_basis).toBeCloseTo(originalTotalCostBasis, 8);
      }),
      { numRuns: 500 },
    );
  });
});
