import { describe, it, expect } from 'vitest';
import { adjustLotsForSplit } from '../stockSplits';
import type { TaxLotRecord } from '@/types/database';

function makeLot(overrides: Partial<TaxLotRecord> = {}): TaxLotRecord {
  return {
    id: 'lot-1',
    created: '2024-01-01T00:00:00Z',
    updated: '2024-01-01T00:00:00Z',
    account_id: 'acct-1',
    symbol: 'AAPL',
    acquisition_date: '2024-01-15',
    shares_acquired: 100,
    remaining_shares: 100,
    cost_per_share: 40,
    total_cost_basis: 4000,
    acquisition_type: 'buy',
    status: 'open',
    split_adjusted: false,
    ...overrides,
  };
}

describe('adjustLotsForSplit – 4:1 forward split (ratioFrom=1, ratioTo=4)', () => {
  const symbol = 'AAPL';
  const ratioFrom = 1;
  const ratioTo = 4;
  const splitDate = '2024-06-01';

  it('multiplies shares_acquired by 4', () => {
    const lot = makeLot({ shares_acquired: 100 });
    const { adjustedLots } = adjustLotsForSplit(symbol, ratioFrom, ratioTo, splitDate, [lot]);

    expect(adjustedLots[0]!.shares_acquired).toBe(400);
  });

  it('multiplies remaining_shares by 4', () => {
    const lot = makeLot({ remaining_shares: 75 });
    const { adjustedLots } = adjustLotsForSplit(symbol, ratioFrom, ratioTo, splitDate, [lot]);

    expect(adjustedLots[0]!.remaining_shares).toBe(300);
  });

  it('divides cost_per_share by 4', () => {
    const lot = makeLot({ cost_per_share: 40 });
    const { adjustedLots } = adjustLotsForSplit(symbol, ratioFrom, ratioTo, splitDate, [lot]);

    expect(adjustedLots[0]!.cost_per_share).toBe(10);
  });

  it('total_cost_basis remains unchanged', () => {
    const lot = makeLot({ shares_acquired: 100, cost_per_share: 40, total_cost_basis: 4000 });
    const { adjustedLots } = adjustLotsForSplit(symbol, ratioFrom, ratioTo, splitDate, [lot]);

    expect(adjustedLots[0]!.total_cost_basis).toBe(4000);
  });

  it('sets split_adjusted to true', () => {
    const lot = makeLot({ split_adjusted: false });
    const { adjustedLots } = adjustLotsForSplit(symbol, ratioFrom, ratioTo, splitDate, [lot]);

    expect(adjustedLots[0]!.split_adjusted).toBe(true);
  });

  it('stores pre-split values in original_shares and original_cost_per_share', () => {
    const lot = makeLot({ shares_acquired: 100, cost_per_share: 40 });
    const { adjustedLots } = adjustLotsForSplit(symbol, ratioFrom, ratioTo, splitDate, [lot]);

    expect(adjustedLots[0]!.original_shares).toBe(100);
    expect(adjustedLots[0]!.original_cost_per_share).toBe(40);
  });

  it('only adjusts eligible lots (open/partial, before split date, matching symbol)', () => {
    const eligible = makeLot({ id: 'lot-eligible', status: 'open', acquisition_date: '2024-03-01' });
    const closedLot = makeLot({ id: 'lot-closed', status: 'closed', acquisition_date: '2024-03-01' });
    const afterSplit = makeLot({ id: 'lot-after', status: 'open', acquisition_date: '2024-07-01' });
    const wrongSymbol = makeLot({ id: 'lot-wrong', symbol: 'MSFT', status: 'open', acquisition_date: '2024-03-01' });
    const partialEligible = makeLot({ id: 'lot-partial', status: 'partial', acquisition_date: '2024-02-01' });

    const { adjustedLots, adjustedCount } = adjustLotsForSplit(
      symbol,
      ratioFrom,
      ratioTo,
      splitDate,
      [eligible, closedLot, afterSplit, wrongSymbol, partialEligible]
    );

    expect(adjustedCount).toBe(2);

    // Eligible lot adjusted
    expect(adjustedLots[0]!.split_adjusted).toBe(true);
    expect(adjustedLots[0]!.shares_acquired).toBe(400);

    // Closed lot not adjusted
    expect(adjustedLots[1]!.split_adjusted).toBe(false);
    expect(adjustedLots[1]!.shares_acquired).toBe(100);

    // After split date not adjusted
    expect(adjustedLots[2]!.split_adjusted).toBe(false);
    expect(adjustedLots[2]!.shares_acquired).toBe(100);

    // Wrong symbol not adjusted
    expect(adjustedLots[3]!.split_adjusted).toBe(false);
    expect(adjustedLots[3]!.shares_acquired).toBe(100);

    // Partial status eligible lot adjusted
    expect(adjustedLots[4]!.split_adjusted).toBe(true);
    expect(adjustedLots[4]!.shares_acquired).toBe(400);
  });
});

describe('adjustLotsForSplit – 1:4 reverse split (ratioFrom=4, ratioTo=1)', () => {
  const symbol = 'AAPL';
  const ratioFrom = 4;
  const ratioTo = 1;
  const splitDate = '2024-06-01';

  it('divides shares_acquired by 4', () => {
    const lot = makeLot({ shares_acquired: 100 });
    const { adjustedLots } = adjustLotsForSplit(symbol, ratioFrom, ratioTo, splitDate, [lot]);

    expect(adjustedLots[0]!.shares_acquired).toBe(25);
  });

  it('divides remaining_shares by 4', () => {
    const lot = makeLot({ remaining_shares: 80 });
    const { adjustedLots } = adjustLotsForSplit(symbol, ratioFrom, ratioTo, splitDate, [lot]);

    expect(adjustedLots[0]!.remaining_shares).toBe(20);
  });

  it('multiplies cost_per_share by 4', () => {
    const lot = makeLot({ cost_per_share: 10 });
    const { adjustedLots } = adjustLotsForSplit(symbol, ratioFrom, ratioTo, splitDate, [lot]);

    expect(adjustedLots[0]!.cost_per_share).toBe(40);
  });

  it('total_cost_basis remains unchanged', () => {
    const lot = makeLot({ shares_acquired: 100, cost_per_share: 10, total_cost_basis: 1000 });
    const { adjustedLots } = adjustLotsForSplit(symbol, ratioFrom, ratioTo, splitDate, [lot]);

    expect(adjustedLots[0]!.total_cost_basis).toBe(1000);
  });

  it('sets split_adjusted to true', () => {
    const lot = makeLot({ split_adjusted: false });
    const { adjustedLots } = adjustLotsForSplit(symbol, ratioFrom, ratioTo, splitDate, [lot]);

    expect(adjustedLots[0]!.split_adjusted).toBe(true);
  });

  it('preserves original values in original_shares and original_cost_per_share', () => {
    const lot = makeLot({ shares_acquired: 100, cost_per_share: 10 });
    const { adjustedLots } = adjustLotsForSplit(symbol, ratioFrom, ratioTo, splitDate, [lot]);

    expect(adjustedLots[0]!.original_shares).toBe(100);
    expect(adjustedLots[0]!.original_cost_per_share).toBe(10);
  });
});
