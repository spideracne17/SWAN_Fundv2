import { describe, it, expect } from 'vitest';
import { pairDripRecords } from '../dripPairing';
import type { DripPair, PairedResult } from '../dripPairing';
import type { NormalizedRecord } from '../normalization';

// ─── Helpers ─────────────────────────────────────────────────────────────────

function makeRecord(
  overrides: Partial<NormalizedRecord> & Pick<NormalizedRecord, 'transaction_type'>,
): NormalizedRecord {
  return {
    hash: 'hash-' + Math.random().toString(36).slice(2, 8),
    account_id: 'acc-1',
    transaction_date: '2024-03-15',
    symbol: 'AAPL',
    description: 'Test record',
    quantity: undefined,
    price_per_unit: undefined,
    total_amount: 100,
    fees: undefined,
    source_format: 'schwab_taxable',
    raw_action: overrides.transaction_type,
    ...overrides,
  };
}

// ─── Tests ───────────────────────────────────────────────────────────────────

describe('pairDripRecords', () => {
  it('pairs a dividend with a same-day reinvestment on the same symbol', () => {
    const dividend = makeRecord({
      transaction_type: 'dividend',
      symbol: 'AAPL',
      transaction_date: '2024-03-15',
      total_amount: 25.5,
    });
    const reinvestment = makeRecord({
      transaction_type: 'reinvestment',
      symbol: 'AAPL',
      transaction_date: '2024-03-15',
      quantity: 0.15,
      price_per_unit: 170.0,
      total_amount: 25.5,
    });

    const result: PairedResult = pairDripRecords([dividend, reinvestment]);

    expect(result.paired).toHaveLength(1);
    expect(result.unpaired).toHaveLength(0);

    const pair: DripPair = result.paired[0]!;
    expect(pair.dividend).toBe(dividend);
    expect(pair.reinvestment).toBe(reinvestment);
    expect(pair.shares_acquired).toBe(0.15);
    expect(pair.cost_per_share).toBe(170.0);
  });

  it('leaves a dividend without reinvestment as unpaired (cash dividend)', () => {
    const dividend = makeRecord({
      transaction_type: 'dividend',
      symbol: 'VTI',
      transaction_date: '2024-06-01',
      total_amount: 42.0,
    });

    const result = pairDripRecords([dividend]);

    expect(result.paired).toHaveLength(0);
    expect(result.unpaired).toHaveLength(1);
    expect(result.unpaired[0]).toBe(dividend);
  });

  it('flags a reinvestment without matching dividend as orphan (unpaired)', () => {
    const reinvestment = makeRecord({
      transaction_type: 'reinvestment',
      symbol: 'MSFT',
      transaction_date: '2024-04-10',
      quantity: 0.5,
      price_per_unit: 400.0,
      total_amount: 200.0,
    });

    const result = pairDripRecords([reinvestment]);

    expect(result.paired).toHaveLength(0);
    expect(result.unpaired).toHaveLength(1);
    expect(result.unpaired[0]).toBe(reinvestment);
  });

  it('only pairs within the same symbol (multiple symbols)', () => {
    const divAAPL = makeRecord({
      transaction_type: 'dividend',
      symbol: 'AAPL',
      transaction_date: '2024-03-15',
      total_amount: 20.0,
    });
    const divMSFT = makeRecord({
      transaction_type: 'dividend',
      symbol: 'MSFT',
      transaction_date: '2024-03-15',
      total_amount: 30.0,
    });
    const reinvestAAPL = makeRecord({
      transaction_type: 'reinvestment',
      symbol: 'AAPL',
      transaction_date: '2024-03-15',
      quantity: 0.12,
      price_per_unit: 166.67,
      total_amount: 20.0,
    });

    const result = pairDripRecords([divAAPL, divMSFT, reinvestAAPL]);

    // AAPL should be paired, MSFT should remain unpaired
    expect(result.paired).toHaveLength(1);
    expect(result.paired[0]!.dividend.symbol).toBe('AAPL');
    expect(result.paired[0]!.reinvestment.symbol).toBe('AAPL');

    expect(result.unpaired).toHaveLength(1);
    expect(result.unpaired[0]!.symbol).toBe('MSFT');
  });

  it('only pairs within the same date (multiple dates)', () => {
    const divMar = makeRecord({
      transaction_type: 'dividend',
      symbol: 'VTI',
      transaction_date: '2024-03-15',
      total_amount: 50.0,
    });
    const reinvestJun = makeRecord({
      transaction_type: 'reinvestment',
      symbol: 'VTI',
      transaction_date: '2024-06-15',
      quantity: 0.2,
      price_per_unit: 250.0,
      total_amount: 50.0,
    });

    const result = pairDripRecords([divMar, reinvestJun]);

    // Different dates → no pairing; both end up unpaired
    expect(result.paired).toHaveLength(0);
    expect(result.unpaired).toHaveLength(2);
  });

  it('handles a mix of paired and unpaired records in one batch', () => {
    const divAAPL = makeRecord({
      transaction_type: 'dividend',
      symbol: 'AAPL',
      transaction_date: '2024-03-15',
      total_amount: 25.0,
    });
    const reinvestAAPL = makeRecord({
      transaction_type: 'reinvestment',
      symbol: 'AAPL',
      transaction_date: '2024-03-15',
      quantity: 0.15,
      price_per_unit: 166.67,
      total_amount: 25.0,
    });
    const cashDivVTI = makeRecord({
      transaction_type: 'dividend',
      symbol: 'VTI',
      transaction_date: '2024-03-15',
      total_amount: 40.0,
    });
    const orphanReinvest = makeRecord({
      transaction_type: 'reinvestment',
      symbol: 'MSFT',
      transaction_date: '2024-03-15',
      quantity: 0.1,
      price_per_unit: 400.0,
      total_amount: 40.0,
    });
    const buyRecord = makeRecord({
      transaction_type: 'buy',
      symbol: 'GOOG',
      transaction_date: '2024-03-15',
      quantity: 10,
      price_per_unit: 150.0,
      total_amount: 1500.0,
    });

    const result = pairDripRecords([
      divAAPL,
      reinvestAAPL,
      cashDivVTI,
      orphanReinvest,
      buyRecord,
    ]);

    // 1 pair: AAPL div + reinvest
    expect(result.paired).toHaveLength(1);
    expect(result.paired[0]!.dividend.symbol).toBe('AAPL');

    // Unpaired: VTI cash dividend, MSFT orphan reinvestment, GOOG buy
    expect(result.unpaired).toHaveLength(3);
    const unpairedSymbols = result.unpaired.map((r) => r.symbol);
    expect(unpairedSymbols).toContain('MSFT');
    expect(unpairedSymbols).toContain('VTI');
    expect(unpairedSymbols).toContain('GOOG');
  });
});
