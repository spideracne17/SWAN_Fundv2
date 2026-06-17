import { describe, it, expect } from 'vitest';
import { handleExpiration } from './expirationHandling';
import type { OptionPositionRecord } from '@/types/database';

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

describe('handleExpiration', () => {
  describe('put options', () => {
    it('expires OTM put (SPX above strike) with full premium as profit', () => {
      const position = makePosition({
        option_type: 'put',
        strike_price: 4800,
        total_premium: 350,
        expiration_date: '2024-02-16',
      });

      const result = handleExpiration(position, 4850); // SPX > strike → OTM

      expect(result.status).toBe('expired');
      expect(result.pnl).toBe(350);
      expect(result.closed_date).toBe('2024-02-16');
    });

    it('returns ITM put unchanged (SPX below strike)', () => {
      const position = makePosition({
        option_type: 'put',
        strike_price: 4800,
        total_premium: 350,
      });

      const result = handleExpiration(position, 4750); // SPX < strike → ITM

      expect(result).toEqual(position);
      expect(result.status).toBe('open');
      expect(result.pnl).toBeUndefined();
      expect(result.closed_date).toBeUndefined();
    });

    it('returns ATM put unchanged (SPX equals strike, treated as ITM)', () => {
      const position = makePosition({
        option_type: 'put',
        strike_price: 4800,
        total_premium: 350,
      });

      const result = handleExpiration(position, 4800); // SPX === strike → not OTM

      expect(result).toEqual(position);
      expect(result.status).toBe('open');
    });
  });

  describe('call options', () => {
    it('expires OTM call (SPX below strike) with full premium as profit', () => {
      const position = makePosition({
        option_type: 'call',
        strike_price: 5000,
        total_premium: 200,
        expiration_date: '2024-03-15',
      });

      const result = handleExpiration(position, 4950); // SPX < strike → OTM

      expect(result.status).toBe('expired');
      expect(result.pnl).toBe(200);
      expect(result.closed_date).toBe('2024-03-15');
    });

    it('returns ITM call unchanged (SPX above strike)', () => {
      const position = makePosition({
        option_type: 'call',
        strike_price: 5000,
        total_premium: 200,
      });

      const result = handleExpiration(position, 5100); // SPX > strike → ITM

      expect(result).toEqual(position);
      expect(result.status).toBe('open');
      expect(result.pnl).toBeUndefined();
    });

    it('returns ATM call unchanged (SPX equals strike, treated as ITM)', () => {
      const position = makePosition({
        option_type: 'call',
        strike_price: 5000,
        total_premium: 200,
      });

      const result = handleExpiration(position, 5000); // SPX === strike → not OTM

      expect(result).toEqual(position);
      expect(result.status).toBe('open');
    });
  });

  describe('preserves other fields', () => {
    it('does not mutate the original position object', () => {
      const position = makePosition({
        option_type: 'put',
        strike_price: 4800,
        total_premium: 350,
      });
      const originalStatus = position.status;

      handleExpiration(position, 4850);

      expect(position.status).toBe(originalStatus);
    });

    it('carries forward all existing fields on OTM expiration', () => {
      const position = makePosition({
        option_type: 'put',
        strike_price: 4800,
        total_premium: 350,
        spread_id: 'spread_123',
        roll_chain_id: 'roll_abc',
      });

      const result = handleExpiration(position, 4900);

      expect(result.spread_id).toBe('spread_123');
      expect(result.roll_chain_id).toBe('roll_abc');
      expect(result.account_id).toBe('acct_1');
      expect(result.underlying_symbol).toBe('SPX');
    });
  });
});
