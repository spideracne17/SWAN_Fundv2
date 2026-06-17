import { describe, it, expect } from 'vitest';
import * as fc from 'fast-check';
import { disposeLotsFIFO } from '../disposeLots';
import type { TaxLotRecord } from '@/types/database';

/**
 * Property-based tests for FIFO lot disposition.
 *
 * **Validates: Requirements 2.6**
 */
describe('disposeLotsFIFO - property-based tests', () => {
  /**
   * Arbitrary: generates a valid sale with quantity between 1 and 1000.
   */
  const saleArb = fc
    .record({
      quantity: fc.integer({ min: 1, max: 1000 }),
      proceedsPerShare: fc.double({ min: 0.01, max: 500, noNaN: true, noDefaultInfinity: true }),
    })
    .map(({ quantity, proceedsPerShare }) => ({
      symbol: 'AAPL',
      quantity,
      proceeds_per_share: Math.round(proceedsPerShare * 100) / 100,
      date: '2024-06-15',
    }));

  /**
   * Generates a set of open lots whose total remaining_shares >= saleQuantity.
   * Each lot has between 1 and 500 remaining shares and a valid acquisition date before the sale.
   */
  function sufficientLotsArb(saleQuantity: number): fc.Arbitrary<TaxLotRecord[]> {
    return fc
      .array(
        fc.record({
          shares: fc.integer({ min: 1, max: 500 }),
          costPerShare: fc.double({ min: 0.01, max: 500, noNaN: true, noDefaultInfinity: true }),
          dayOffset: fc.integer({ min: 1, max: 1000 }),
        }),
        { minLength: 1, maxLength: 10 },
      )
      .map((lots) => {
        // Ensure total shares >= saleQuantity by boosting the last lot if needed
        const totalShares = lots.reduce((sum, l) => sum + l.shares, 0);
        if (totalShares < saleQuantity) {
          lots[lots.length - 1]!.shares += saleQuantity - totalShares;
        }

        return lots.map((l, i) => {
          const roundedCost = Math.round(l.costPerShare * 100) / 100;
          // Create acquisition dates spread before the sale date (2024-06-15)
          const acqDate = new Date('2024-06-15');
          acqDate.setDate(acqDate.getDate() - l.dayOffset);
          const dateStr = acqDate.toISOString().split('T')[0]!;

          return {
            id: `lot-${i}`,
            created: '2024-01-01T00:00:00Z',
            updated: '2024-01-01T00:00:00Z',
            account_id: 'acc-1',
            symbol: 'AAPL',
            acquisition_date: dateStr,
            shares_acquired: l.shares,
            remaining_shares: l.shares,
            cost_per_share: roundedCost,
            total_cost_basis: l.shares * roundedCost,
            acquisition_type: 'buy' as const,
            status: 'open' as const,
            split_adjusted: false,
          } satisfies TaxLotRecord;
        });
      });
  }

  it('sum of all dispositions shares_disposed equals the sale quantity', () => {
    fc.assert(
      fc.property(
        saleArb.chain((sale) =>
          sufficientLotsArb(sale.quantity).map((lots) => ({ sale, lots })),
        ),
        ({ sale, lots }) => {
          const dispositions = disposeLotsFIFO(sale, lots);

          const totalDisposed = dispositions.reduce(
            (sum, d) => sum + d.shares_disposed,
            0,
          );

          expect(totalDisposed).toBe(sale.quantity);
        },
      ),
      { numRuns: 500 },
    );
  });

  it('after disposition, all lot remaining_shares values are >= 0', () => {
    fc.assert(
      fc.property(
        saleArb.chain((sale) =>
          sufficientLotsArb(sale.quantity).map((lots) => ({ sale, lots })),
        ),
        ({ sale, lots }) => {
          disposeLotsFIFO(sale, lots);

          for (const lot of lots) {
            expect(lot.remaining_shares).toBeGreaterThanOrEqual(0);
          }
        },
      ),
      { numRuns: 500 },
    );
  });
});
