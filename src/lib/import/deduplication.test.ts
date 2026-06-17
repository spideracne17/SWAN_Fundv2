import { describe, it, expect } from 'vitest';
import { computeRecordHash } from './deduplication';

describe('computeRecordHash', () => {
  it('produces a deterministic hash for the same record', () => {
    const record = {
      account_id: 'acc123',
      transaction_date: '2024-01-15',
      transaction_type: 'buy',
      symbol: 'AAPL',
      quantity: 10,
      total_amount: 1500.0,
    };

    const hash1 = computeRecordHash(record);
    const hash2 = computeRecordHash(record);

    expect(hash1).toBe(hash2);
  });

  it('returns a 64-character hex string (SHA-256)', () => {
    const record = {
      account_id: 'acc123',
      transaction_date: '2024-01-15',
      transaction_type: 'buy',
      symbol: 'AAPL',
      quantity: 10,
      total_amount: 1500.0,
    };

    const hash = computeRecordHash(record);

    expect(hash).toHaveLength(64);
    expect(hash).toMatch(/^[0-9a-f]{64}$/);
  });

  it('produces different hashes for different records', () => {
    const record1 = {
      account_id: 'acc123',
      transaction_date: '2024-01-15',
      transaction_type: 'buy',
      symbol: 'AAPL',
      quantity: 10,
      total_amount: 1500.0,
    };

    const record2 = {
      account_id: 'acc123',
      transaction_date: '2024-01-15',
      transaction_type: 'sell',
      symbol: 'AAPL',
      quantity: 10,
      total_amount: 1500.0,
    };

    expect(computeRecordHash(record1)).not.toBe(computeRecordHash(record2));
  });

  it('handles optional symbol as empty string', () => {
    const recordWithSymbol = {
      account_id: 'acc123',
      transaction_date: '2024-01-15',
      transaction_type: 'interest',
      symbol: undefined,
      quantity: undefined,
      total_amount: 5.25,
    };

    const hash = computeRecordHash(recordWithSymbol);

    expect(hash).toHaveLength(64);
    expect(hash).toMatch(/^[0-9a-f]{64}$/);
  });

  it('distinguishes records with and without optional fields', () => {
    const withSymbol = {
      account_id: 'acc123',
      transaction_date: '2024-01-15',
      transaction_type: 'buy',
      symbol: 'AAPL',
      quantity: 10,
      total_amount: 1500.0,
    };

    const withoutSymbol = {
      account_id: 'acc123',
      transaction_date: '2024-01-15',
      transaction_type: 'buy',
      symbol: undefined,
      quantity: 10,
      total_amount: 1500.0,
    };

    expect(computeRecordHash(withSymbol)).not.toBe(computeRecordHash(withoutSymbol));
  });
});
