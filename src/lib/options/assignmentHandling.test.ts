import { describe, it, expect } from 'vitest';
import {
  handleShortPutAssignment,
  handleCoveredCallAssignment,
} from './assignmentHandling';
import type { OptionPositionRecord, TaxLotRecord } from '@/types/database';

function makePosition(
  overrides: Partial<OptionPositionRecord> = {}
): OptionPositionRecord {
  return {
    id: 'pos_1',
    created: '2024-01-01T00:00:00Z',
    updated: '2024-01-01T00:00:00Z',
    account_id: 'acct_1',
    underlying_symbol: 'SPX',
    option_symbol: 'SPX240216P04800000',
    option_type: 'put',
    direction: 'short',
    strike_price: 4800,
    expiration_date: '2024-02-16',
    contracts: 1,
    premium_per_contract: 3.5,
    total_premium: 350,
    status: 'open',
    opened_date: '2024-01-15',
    ...overrides,
  };
}

function makeLot(overrides: Partial<TaxLotRecord> = {}): TaxLotRecord {
  return {
    id: 'lot_1',
    created: '2023-06-01T00:00:00Z',
    updated: '2023-06-01T00:00:00Z',
    account_id: 'acct_1',
    symbol: 'SPX',
    acquisition_date: '2023-06-01',
    shares_acquired: 100,
    remaining_shares: 100,
    cost_per_share: 4500,
    total_cost_basis: 450000,
    acquisition_type: 'buy',
    status: 'open',
    split_adjusted: false,
    ...overrides,
  };
}

describe('handleShortPutAssignment', () => {
  it('creates a tax lot with cost_basis = strike - premium_per_share', () => {
    const position = makePosition({
      option_type: 'put',
      direction: 'short',
      strike_price: 4800,
      contracts: 1,
      total_premium: 350, // premium_per_share = 350 / 100 = 3.50
      expiration_date: '2024-02-16',
    });

    const result = handleShortPutAssignment(position, '2024-02-16');

    // cost_per_share = strike - (total_premium / shares) = 4800 - 3.50 = 4796.50
    expect(result.newLot.cost_per_share).toBe(4796.5);
  });

  it('creates a lot with shares = contracts * 100', () => {
    const position = makePosition({
      contracts: 2,
      total_premium: 700, // 2 contracts, total premium $700
    });

    const result = handleShortPutAssignment(position, '2024-02-16');

    expect(result.newLot.shares_acquired).toBe(200); // 2 * 100
    expect(result.newLot.remaining_shares).toBe(200);
  });

  it('marks position status as assigned', () => {
    const position = makePosition();

    const result = handleShortPutAssignment(position, '2024-02-16');

    expect(result.updatedPosition.status).toBe('assigned');
  });

  it('sets closed_date to the assignment date', () => {
    const position = makePosition();

    const result = handleShortPutAssignment(position, '2024-02-16');

    expect(result.updatedPosition.closed_date).toBe('2024-02-16');
  });

  it('links the position to the new lot via assignment_lot_id', () => {
    const position = makePosition();

    const result = handleShortPutAssignment(position, '2024-02-16');

    expect(result.updatedPosition.assignment_lot_id).toBe(result.newLot.id);
  });

  it('sets acquisition_type to exercise on the new lot', () => {
    const position = makePosition();

    const result = handleShortPutAssignment(position, '2024-02-16');

    expect(result.newLot.acquisition_type).toBe('exercise');
  });

  it('handles multiple contracts correctly', () => {
    const position = makePosition({
      contracts: 5,
      strike_price: 5000,
      total_premium: 2500, // premium_per_share = 2500 / 500 = 5.00
    });

    const result = handleShortPutAssignment(position, '2024-03-15');

    expect(result.newLot.shares_acquired).toBe(500);
    expect(result.newLot.cost_per_share).toBe(4995); // 5000 - 5
  });
});

describe('handleCoveredCallAssignment', () => {
  it('disposes lots with proceeds = strike + premium_per_share', () => {
    const position = makePosition({
      option_type: 'call',
      direction: 'short',
      strike_price: 5000,
      contracts: 1,
      total_premium: 200, // premium_per_share = 200 / 100 = 2.00
      expiration_date: '2024-03-15',
    });

    const lot = makeLot({
      symbol: 'SPX',
      remaining_shares: 100,
      cost_per_share: 4500,
    });

    const result = handleCoveredCallAssignment(position, [lot]);

    // proceeds_per_share = 5000 + 2 = 5002
    expect(result.dispositions[0]!.proceeds_per_share).toBe(5002);
  });

  it('calculates correct gain/loss on the underlying shares', () => {
    const position = makePosition({
      option_type: 'call',
      direction: 'short',
      strike_price: 5000,
      contracts: 1,
      total_premium: 200, // premium_per_share = 2.00
      expiration_date: '2024-03-15',
    });

    const lot = makeLot({
      symbol: 'SPX',
      remaining_shares: 100,
      cost_per_share: 4500,
    });

    const result = handleCoveredCallAssignment(position, [lot]);

    // gain_loss = (5002 - 4500) * 100 = 50200
    expect(result.dispositions[0]!.gain_loss).toBe(50200);
  });

  it('marks position status as assigned', () => {
    const position = makePosition({
      option_type: 'call',
      direction: 'short',
      strike_price: 5000,
      contracts: 1,
      total_premium: 200,
      expiration_date: '2024-03-15',
    });

    const lot = makeLot({ remaining_shares: 100 });

    const result = handleCoveredCallAssignment(position, [lot]);

    expect(result.updatedPosition.status).toBe('assigned');
  });

  it('sets closed_date to expiration_date', () => {
    const position = makePosition({
      option_type: 'call',
      direction: 'short',
      strike_price: 5000,
      contracts: 1,
      total_premium: 200,
      expiration_date: '2024-03-15',
    });

    const lot = makeLot({ remaining_shares: 100 });

    const result = handleCoveredCallAssignment(position, [lot]);

    expect(result.updatedPosition.closed_date).toBe('2024-03-15');
  });

  it('disposes across multiple lots using FIFO', () => {
    const position = makePosition({
      option_type: 'call',
      direction: 'short',
      strike_price: 5000,
      contracts: 2, // needs 200 shares
      total_premium: 400, // premium_per_share = 400/200 = 2.00
      expiration_date: '2024-03-15',
    });

    const lot1 = makeLot({
      id: 'lot_1',
      acquisition_date: '2023-01-01', // older - consumed first
      remaining_shares: 100,
      cost_per_share: 4400,
    });

    const lot2 = makeLot({
      id: 'lot_2',
      acquisition_date: '2023-06-01', // newer
      remaining_shares: 100,
      cost_per_share: 4600,
    });

    const result = handleCoveredCallAssignment(position, [lot2, lot1]); // pass unordered

    // Should be sorted FIFO: lot1 consumed first, then lot2
    expect(result.dispositions).toHaveLength(2);

    // First disposition from lot1 (oldest)
    expect(result.dispositions[0]!.lot_id).toBe('lot_1');
    expect(result.dispositions[0]!.shares_disposed).toBe(100);
    expect(result.dispositions[0]!.proceeds_per_share).toBe(5002);
    expect(result.dispositions[0]!.gain_loss).toBe((5002 - 4400) * 100); // 60200

    // Second disposition from lot2
    expect(result.dispositions[1]!.lot_id).toBe('lot_2');
    expect(result.dispositions[1]!.shares_disposed).toBe(100);
    expect(result.dispositions[1]!.proceeds_per_share).toBe(5002);
    expect(result.dispositions[1]!.gain_loss).toBe((5002 - 4600) * 100); // 40200
  });
});
