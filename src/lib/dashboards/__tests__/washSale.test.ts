import { describe, it, expect } from 'vitest';
import { detectWashSales } from '../washSale';
import type { DispositionRecord, TaxLotRecord } from '@/types/database';

/**
 * Helper to create a minimal TaxLotRecord for testing.
 */
function makeLot(overrides: Partial<TaxLotRecord> & { id: string; symbol: string; acquisition_date: string }): TaxLotRecord {
  return {
    created: '2024-01-01T00:00:00Z',
    updated: '2024-01-01T00:00:00Z',
    account_id: 'acct-1',
    shares_acquired: 100,
    remaining_shares: 100,
    cost_per_share: 50,
    total_cost_basis: 5000,
    acquisition_type: 'buy',
    status: 'open',
    split_adjusted: false,
    ...overrides,
  };
}

/**
 * Helper to create a minimal DispositionRecord for testing.
 */
function makeDisposition(overrides: Partial<DispositionRecord> & { id: string; lot_id: string; disposition_date: string; gain_loss: number }): DispositionRecord {
  return {
    created: '2024-01-01T00:00:00Z',
    updated: '2024-01-01T00:00:00Z',
    shares_disposed: 100,
    proceeds_per_share: 45,
    cost_basis_per_share: 50,
    holding_period: 'short_term',
    ...overrides,
  };
}

describe('detectWashSales', () => {
  it('detects wash sale when purchase occurs 15 days after the sale', () => {
    const soldLot = makeLot({ id: 'lot-1', symbol: 'AAPL', acquisition_date: '2024-01-01' });
    const repurchaseLot = makeLot({ id: 'lot-2', symbol: 'AAPL', acquisition_date: '2024-02-15' }); // 15 days after sale

    const disposition = makeDisposition({
      id: 'disp-1',
      lot_id: 'lot-1',
      disposition_date: '2024-01-31', // Sale date
      gain_loss: -500,
    });

    const result = detectWashSales([disposition], [soldLot, repurchaseLot]);

    expect(result).toHaveLength(1);
    expect(result[0]!.symbol).toBe('AAPL');
    expect(result[0]!.disallowed_loss).toBe(500);
    expect(result[0]!.purchase_date).toBe('2024-02-15');
  });

  it('detects wash sale when purchase occurs 31 days before the sale', () => {
    const soldLot = makeLot({ id: 'lot-1', symbol: 'MSFT', acquisition_date: '2024-01-01' });
    const repurchaseLot = makeLot({ id: 'lot-2', symbol: 'MSFT', acquisition_date: '2024-02-01' }); // 31 days before sale on March 3

    const disposition = makeDisposition({
      id: 'disp-1',
      lot_id: 'lot-1',
      disposition_date: '2024-03-03', // Sale date; lot-2 acquired 31 days before
      gain_loss: -1000,
    });

    const result = detectWashSales([disposition], [soldLot, repurchaseLot]);

    expect(result).toHaveLength(1);
    expect(result[0]!.symbol).toBe('MSFT');
    expect(result[0]!.disallowed_loss).toBe(1000);
  });

  it('does NOT detect wash sale when purchase is 32 days after the sale', () => {
    const soldLot = makeLot({ id: 'lot-1', symbol: 'GOOG', acquisition_date: '2024-01-01' });
    const repurchaseLot = makeLot({ id: 'lot-2', symbol: 'GOOG', acquisition_date: '2024-03-04' }); // 32 days after sale

    const disposition = makeDisposition({
      id: 'disp-1',
      lot_id: 'lot-1',
      disposition_date: '2024-01-31', // Sale date
      gain_loss: -300,
    });

    const result = detectWashSales([disposition], [soldLot, repurchaseLot]);

    expect(result).toHaveLength(0);
  });

  it('ignores dispositions with gains (only losses trigger wash sales)', () => {
    const soldLot = makeLot({ id: 'lot-1', symbol: 'TSLA', acquisition_date: '2024-01-01' });
    const repurchaseLot = makeLot({ id: 'lot-2', symbol: 'TSLA', acquisition_date: '2024-02-05' }); // 5 days after sale

    const disposition = makeDisposition({
      id: 'disp-1',
      lot_id: 'lot-1',
      disposition_date: '2024-01-31',
      gain_loss: 500, // Gain, not a loss
    });

    const result = detectWashSales([disposition], [soldLot, repurchaseLot]);

    expect(result).toHaveLength(0);
  });

  it('requires same symbol for wash sale detection', () => {
    const soldLot = makeLot({ id: 'lot-1', symbol: 'AAPL', acquisition_date: '2024-01-01' });
    const differentSymbolLot = makeLot({ id: 'lot-2', symbol: 'MSFT', acquisition_date: '2024-02-05' }); // Different symbol

    const disposition = makeDisposition({
      id: 'disp-1',
      lot_id: 'lot-1',
      disposition_date: '2024-01-31',
      gain_loss: -500,
    });

    const result = detectWashSales([disposition], [soldLot, differentSymbolLot]);

    expect(result).toHaveLength(0);
  });
});
