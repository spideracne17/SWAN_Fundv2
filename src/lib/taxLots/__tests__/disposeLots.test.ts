import { describe, it, expect } from 'vitest';
import { disposeLotsFIFO, InsufficientLotsError } from '../disposeLots';
import type { TaxLotRecord } from '@/types/database';
import type { SaleRecord } from '../disposeLots';

let lotCounter = 0;

function makeLot(overrides: Partial<TaxLotRecord> = {}): TaxLotRecord {
  const now = new Date().toISOString();
  lotCounter++;
  return {
    id: `lot-${lotCounter}`,
    account_id: 'acct-1',
    symbol: 'AAPL',
    acquisition_date: '2023-01-15',
    shares_acquired: 10,
    remaining_shares: 10,
    cost_per_share: 150,
    total_cost_basis: 1500,
    acquisition_type: 'buy',
    status: 'open',
    fees: 0,
    split_adjusted: false,
    created: now,
    updated: now,
    ...overrides,
  };
}

describe('disposeLotsFIFO - InsufficientLotsError', () => {
  it('throws InsufficientLotsError when sale quantity exceeds available shares', () => {
    const lots = [makeLot({ remaining_shares: 5 })];
    const sale: SaleRecord = {
      symbol: 'AAPL',
      quantity: 10,
      proceeds_per_share: 200,
      date: '2024-06-01',
    };

    expect(() => disposeLotsFIFO(sale, lots)).toThrow(InsufficientLotsError);
  });

  it('does not modify any lots when InsufficientLotsError is thrown', () => {
    const lot1 = makeLot({ remaining_shares: 5, status: 'open', acquisition_date: '2023-01-01' });
    const lot2 = makeLot({ remaining_shares: 3, status: 'open', acquisition_date: '2023-02-01' });
    const lots = [lot1, lot2];

    // Total available = 8, trying to sell 15
    const sale: SaleRecord = {
      symbol: 'AAPL',
      quantity: 15,
      proceeds_per_share: 200,
      date: '2024-06-01',
    };

    expect(() => disposeLotsFIFO(sale, lots)).toThrow(InsufficientLotsError);

    // Verify no lots were modified
    expect(lot1.remaining_shares).toBe(5);
    expect(lot1.status).toBe('open');
    expect(lot2.remaining_shares).toBe(3);
    expect(lot2.status).toBe('open');
  });

  it('includes meaningful error message with quantities', () => {
    const lots = [makeLot({ remaining_shares: 3 })];
    const sale: SaleRecord = {
      symbol: 'AAPL',
      quantity: 10,
      proceeds_per_share: 200,
      date: '2024-06-01',
    };

    expect(() => disposeLotsFIFO(sale, lots)).toThrow(/Cannot sell 10 shares of AAPL/);
    expect(() => disposeLotsFIFO(sale, lots)).toThrow(/only 3 available/);
  });

  it('throws InsufficientLotsError when openLots is empty', () => {
    const sale: SaleRecord = {
      symbol: 'AAPL',
      quantity: 1,
      proceeds_per_share: 200,
      date: '2024-06-01',
    };

    expect(() => disposeLotsFIFO(sale, [])).toThrow(InsufficientLotsError);
  });
});

describe('disposeLotsFIFO - FIFO ordering across multiple lots', () => {
  it('consumes the oldest lot (Jan) first when selling partial shares across Jan, Feb, Mar lots', () => {
    const lotJan = makeLot({ id: 'lot-jan', acquisition_date: '2023-01-01', remaining_shares: 10 });
    const lotFeb = makeLot({ id: 'lot-feb', acquisition_date: '2023-02-01', remaining_shares: 10 });
    const lotMar = makeLot({ id: 'lot-mar', acquisition_date: '2023-03-01', remaining_shares: 10 });

    const sale: SaleRecord = {
      symbol: 'AAPL',
      quantity: 5,
      proceeds_per_share: 200,
      date: '2024-06-01',
    };

    const dispositions = disposeLotsFIFO(sale, [lotJan, lotFeb, lotMar]);

    // Only the oldest lot (Jan) should be consumed
    expect(dispositions).toHaveLength(1);
    expect(dispositions[0]!.lot_id).toBe('lot-jan');
    expect(dispositions[0]!.shares_disposed).toBe(5);

    // Jan lot partially consumed
    expect(lotJan.remaining_shares).toBe(5);
    // Feb and Mar lots untouched
    expect(lotFeb.remaining_shares).toBe(10);
    expect(lotMar.remaining_shares).toBe(10);
  });

  it('sorts lots by acquisition date and consumes oldest first even when input array is out of order', () => {
    const lotMar = makeLot({ id: 'lot-mar', acquisition_date: '2023-03-01', remaining_shares: 10 });
    const lotJan = makeLot({ id: 'lot-jan', acquisition_date: '2023-01-01', remaining_shares: 10 });
    const lotFeb = makeLot({ id: 'lot-feb', acquisition_date: '2023-02-01', remaining_shares: 10 });

    // Provide lots out of order: Mar, Jan, Feb
    const sale: SaleRecord = {
      symbol: 'AAPL',
      quantity: 7,
      proceeds_per_share: 200,
      date: '2024-06-01',
    };

    const dispositions = disposeLotsFIFO(sale, [lotMar, lotJan, lotFeb]);

    // Should still consume Jan first (oldest)
    expect(dispositions).toHaveLength(1);
    expect(dispositions[0]!.lot_id).toBe('lot-jan');
    expect(dispositions[0]!.shares_disposed).toBe(7);

    expect(lotJan.remaining_shares).toBe(3);
    expect(lotFeb.remaining_shares).toBe(10);
    expect(lotMar.remaining_shares).toBe(10);
  });

  it('produces dispositions referencing correct lot_ids in FIFO order when sale spans multiple lots', () => {
    const lotJan = makeLot({ id: 'lot-jan', acquisition_date: '2023-01-15', remaining_shares: 5 });
    const lotFeb = makeLot({ id: 'lot-feb', acquisition_date: '2023-02-15', remaining_shares: 8 });
    const lotMar = makeLot({ id: 'lot-mar', acquisition_date: '2023-03-15', remaining_shares: 10 });

    const sale: SaleRecord = {
      symbol: 'AAPL',
      quantity: 18,
      proceeds_per_share: 200,
      date: '2024-06-01',
    };

    const dispositions = disposeLotsFIFO(sale, [lotJan, lotFeb, lotMar]);

    // Should span all three lots in FIFO order
    expect(dispositions).toHaveLength(3);
    expect(dispositions[0]!.lot_id).toBe('lot-jan');
    expect(dispositions[0]!.shares_disposed).toBe(5);
    expect(dispositions[1]!.lot_id).toBe('lot-feb');
    expect(dispositions[1]!.shares_disposed).toBe(8);
    expect(dispositions[2]!.lot_id).toBe('lot-mar');
    expect(dispositions[2]!.shares_disposed).toBe(5);

    // Verify lot states
    expect(lotJan.remaining_shares).toBe(0);
    expect(lotFeb.remaining_shares).toBe(0);
    expect(lotMar.remaining_shares).toBe(5);
  });

  it('sets oldest lot status to partial when partially consumed, newer lots stay open', () => {
    const lotJan = makeLot({ id: 'lot-jan', acquisition_date: '2023-01-01', remaining_shares: 10, status: 'open' });
    const lotFeb = makeLot({ id: 'lot-feb', acquisition_date: '2023-02-01', remaining_shares: 10, status: 'open' });
    const lotMar = makeLot({ id: 'lot-mar', acquisition_date: '2023-03-01', remaining_shares: 10, status: 'open' });

    const sale: SaleRecord = {
      symbol: 'AAPL',
      quantity: 4,
      proceeds_per_share: 200,
      date: '2024-06-01',
    };

    disposeLotsFIFO(sale, [lotJan, lotFeb, lotMar]);

    // Oldest lot partially consumed — status becomes 'partial'
    expect(lotJan.status).toBe('partial');
    expect(lotJan.remaining_shares).toBe(6);

    // Newer lots remain untouched with 'open' status
    expect(lotFeb.status).toBe('open');
    expect(lotFeb.remaining_shares).toBe(10);
    expect(lotMar.status).toBe('open');
    expect(lotMar.remaining_shares).toBe(10);
  });
});

describe('disposeLotsFIFO - Partial lot consumption and status transitions', () => {
  it('transitions a lot from open to partial after a partial sale, reducing remaining_shares', () => {
    const lot = makeLot({
      id: 'lot-lifecycle',
      acquisition_date: '2023-03-01',
      shares_acquired: 100,
      remaining_shares: 100,
      cost_per_share: 50,
      status: 'open',
    });

    const sale: SaleRecord = {
      symbol: 'AAPL',
      quantity: 30,
      proceeds_per_share: 75,
      date: '2024-06-01',
    };

    const dispositions = disposeLotsFIFO(sale, [lot]);

    expect(lot.status).toBe('partial');
    expect(lot.remaining_shares).toBe(70);
    expect(dispositions).toHaveLength(1);
    expect(dispositions[0]!.shares_disposed).toBe(30);
  });

  it('transitions a partial lot to closed after selling the remaining shares', () => {
    // Simulate a lot that was already partially sold (status: partial, 70 remaining)
    const lot = makeLot({
      id: 'lot-partial-to-closed',
      acquisition_date: '2023-03-01',
      shares_acquired: 100,
      remaining_shares: 70,
      cost_per_share: 50,
      status: 'partial',
    });

    const sale: SaleRecord = {
      symbol: 'AAPL',
      quantity: 70,
      proceeds_per_share: 80,
      date: '2024-07-15',
    };

    const dispositions = disposeLotsFIFO(sale, [lot]);

    expect(lot.status).toBe('closed');
    expect(lot.remaining_shares).toBe(0);
    expect(dispositions).toHaveLength(1);
    expect(dispositions[0]!.shares_disposed).toBe(70);
  });

  it('transitions a lot directly from open to closed when fully consumed in one sale', () => {
    const lot = makeLot({
      id: 'lot-full-consume',
      acquisition_date: '2023-05-10',
      shares_acquired: 50,
      remaining_shares: 50,
      cost_per_share: 120,
      status: 'open',
    });

    const sale: SaleRecord = {
      symbol: 'AAPL',
      quantity: 50,
      proceeds_per_share: 150,
      date: '2024-06-01',
    };

    const dispositions = disposeLotsFIFO(sale, [lot]);

    expect(lot.status).toBe('closed');
    expect(lot.remaining_shares).toBe(0);
    expect(dispositions).toHaveLength(1);
    expect(dispositions[0]!.shares_disposed).toBe(50);
  });

  it('disposition shares_disposed matches consumed amount at each step of the lifecycle', () => {
    const lot = makeLot({
      id: 'lot-multi-step',
      acquisition_date: '2023-01-10',
      shares_acquired: 100,
      remaining_shares: 100,
      cost_per_share: 40,
      status: 'open',
    });

    // Step 1: Partial sale of 25 shares
    const sale1: SaleRecord = {
      symbol: 'AAPL',
      quantity: 25,
      proceeds_per_share: 60,
      date: '2024-02-01',
    };

    const disps1 = disposeLotsFIFO(sale1, [lot]);

    expect(disps1).toHaveLength(1);
    expect(disps1[0]!.shares_disposed).toBe(25);
    expect(lot.remaining_shares).toBe(75);
    expect(lot.status).toBe('partial');

    // Step 2: Another partial sale of 50 shares
    const sale2: SaleRecord = {
      symbol: 'AAPL',
      quantity: 50,
      proceeds_per_share: 65,
      date: '2024-04-01',
    };

    const disps2 = disposeLotsFIFO(sale2, [lot]);

    expect(disps2).toHaveLength(1);
    expect(disps2[0]!.shares_disposed).toBe(50);
    expect(lot.remaining_shares).toBe(25);
    expect(lot.status).toBe('partial');

    // Step 3: Final sale consuming remaining 25 shares
    const sale3: SaleRecord = {
      symbol: 'AAPL',
      quantity: 25,
      proceeds_per_share: 70,
      date: '2024-06-01',
    };

    const disps3 = disposeLotsFIFO(sale3, [lot]);

    expect(disps3).toHaveLength(1);
    expect(disps3[0]!.shares_disposed).toBe(25);
    expect(lot.remaining_shares).toBe(0);
    expect(lot.status).toBe('closed');

    // Verify total disposed across all steps equals original shares
    const totalDisposed =
      disps1[0]!.shares_disposed + disps2[0]!.shares_disposed + disps3[0]!.shares_disposed;
    expect(totalDisposed).toBe(100);
  });
});
