import { describe, it, expect } from 'vitest';
import { createLot, createDripLot, createTransferInLot } from '../createLot';

describe('createLot', () => {
  const basePurchase = {
    account_id: 'acc-001',
    symbol: 'AAPL',
    acquisition_date: '2024-01-15',
    shares_acquired: 10,
    cost_per_share: 150,
  };

  it('sets status to "open" and remaining_shares equals shares_acquired', () => {
    const lot = createLot(basePurchase);
    expect(lot.status).toBe('open');
    expect(lot.remaining_shares).toBe(basePurchase.shares_acquired);
  });

  it('calculates total_cost_basis = shares_acquired × cost_per_share + fees', () => {
    const purchase = { ...basePurchase, fees: 9.99 };
    const lot = createLot(purchase);
    expect(lot.total_cost_basis).toBe(10 * 150 + 9.99);
  });

  it('defaults acquisition_type to "buy"', () => {
    const lot = createLot(basePurchase);
    expect(lot.acquisition_type).toBe('buy');
  });

  it('defaults fees to 0', () => {
    const lot = createLot(basePurchase);
    expect(lot.fees).toBe(0);
    expect(lot.total_cost_basis).toBe(10 * 150);
  });
});

describe('createDripLot', () => {
  const baseReinvestment = {
    account_id: 'acc-001',
    symbol: 'VTI',
    acquisition_date: '2024-03-01',
    shares_acquired: 2.5,
    cost_per_share: 220,
    drip_source_dividend_id: 'div-abc-123',
  };

  it('sets acquisition_type to "drip"', () => {
    const lot = createDripLot(baseReinvestment);
    expect(lot.acquisition_type).toBe('drip');
  });

  it('sets drip_source_dividend_id from reinvestment', () => {
    const lot = createDripLot(baseReinvestment);
    expect(lot.drip_source_dividend_id).toBe('div-abc-123');
  });
});

describe('createTransferInLot', () => {
  const baseTransfer = {
    account_id: 'acc-002',
    symbol: 'MSFT',
    acquisition_date: '2023-06-10',
    shares_acquired: 5,
    cost_per_share: 300,
  };

  it('sets acquisition_type to "transfer_in"', () => {
    const lot = createTransferInLot(baseTransfer);
    expect(lot.acquisition_type).toBe('transfer_in');
  });

  it('uses user-provided total_cost_basis when given', () => {
    const transfer = { ...baseTransfer, total_cost_basis: 1400 };
    const lot = createTransferInLot(transfer);
    expect(lot.total_cost_basis).toBe(1400);
  });

  it('calculates cost basis as shares_acquired × cost_per_share when total_cost_basis is not provided', () => {
    const lot = createTransferInLot(baseTransfer);
    expect(lot.total_cost_basis).toBe(5 * 300);
  });
});

describe('all create functions', () => {
  it('generates a non-empty id', () => {
    const lot1 = createLot({
      account_id: 'acc-001',
      symbol: 'AAPL',
      acquisition_date: '2024-01-15',
      shares_acquired: 10,
      cost_per_share: 150,
    });
    const lot2 = createDripLot({
      account_id: 'acc-001',
      symbol: 'VTI',
      acquisition_date: '2024-03-01',
      shares_acquired: 2.5,
      cost_per_share: 220,
      drip_source_dividend_id: 'div-001',
    });
    const lot3 = createTransferInLot({
      account_id: 'acc-002',
      symbol: 'MSFT',
      acquisition_date: '2023-06-10',
      shares_acquired: 5,
      cost_per_share: 300,
    });

    expect(lot1.id).toBeTruthy();
    expect(typeof lot1.id).toBe('string');
    expect(lot2.id).toBeTruthy();
    expect(typeof lot2.id).toBe('string');
    expect(lot3.id).toBeTruthy();
    expect(typeof lot3.id).toBe('string');
  });

  it('sets split_adjusted to false', () => {
    const lot1 = createLot({
      account_id: 'acc-001',
      symbol: 'AAPL',
      acquisition_date: '2024-01-15',
      shares_acquired: 10,
      cost_per_share: 150,
    });
    const lot2 = createDripLot({
      account_id: 'acc-001',
      symbol: 'VTI',
      acquisition_date: '2024-03-01',
      shares_acquired: 2.5,
      cost_per_share: 220,
      drip_source_dividend_id: 'div-001',
    });
    const lot3 = createTransferInLot({
      account_id: 'acc-002',
      symbol: 'MSFT',
      acquisition_date: '2023-06-10',
      shares_acquired: 5,
      cost_per_share: 300,
    });

    expect(lot1.split_adjusted).toBe(false);
    expect(lot2.split_adjusted).toBe(false);
    expect(lot3.split_adjusted).toBe(false);
  });
});
