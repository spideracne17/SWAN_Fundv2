import { describe, it, expect } from 'vitest';
import { detectSpreads } from '../spreadDetection';
import type { OptionPositionRecord } from '@/types/database';

function makePosition(
  overrides: Partial<OptionPositionRecord> = {}
): OptionPositionRecord {
  return {
    id: crypto.randomUUID(),
    account_id: 'acc_1',
    underlying_symbol: 'SPY',
    option_symbol: 'SPY240119P00450000',
    option_type: 'put',
    direction: 'short',
    strike_price: 450,
    expiration_date: '2024-01-19',
    contracts: 1,
    premium_per_contract: 3.0,
    total_premium: 300,
    status: 'open',
    opened_date: '2024-01-02',
    created: '2024-01-02T00:00:00Z',
    updated: '2024-01-02T00:00:00Z',
    ...overrides,
  };
}

describe('detectSpreads', () => {
  describe('put_credit_spread detection', () => {
    it('links short put + long put (lower strike) with same underlying/expiration/opened_date', () => {
      const shortPut = makePosition({
        id: 'short_put_1',
        option_type: 'put',
        direction: 'short',
        strike_price: 450,
        total_premium: 300,
        premium_per_contract: 3.0,
        contracts: 1,
        underlying_symbol: 'SPY',
        expiration_date: '2024-01-19',
        opened_date: '2024-01-02',
      });

      const longPut = makePosition({
        id: 'long_put_1',
        option_type: 'put',
        direction: 'long',
        strike_price: 440,
        total_premium: 100,
        premium_per_contract: 1.0,
        contracts: 1,
        underlying_symbol: 'SPY',
        expiration_date: '2024-01-19',
        opened_date: '2024-01-02',
      });

      const spreads = detectSpreads([shortPut, longPut]);

      expect(spreads).toHaveLength(1);
      expect(spreads[0]!.spread_type).toBe('put_credit_spread');
      expect(spreads[0]!.short_leg_id).toBe('short_put_1');
      expect(spreads[0]!.long_leg_id).toBe('long_put_1');
      expect(spreads[0]!.underlying_symbol).toBe('SPY');
    });
  });

  describe('call_credit_spread detection', () => {
    it('links short call + long call (higher strike) with same underlying/expiration/opened_date', () => {
      const shortCall = makePosition({
        id: 'short_call_1',
        option_type: 'call',
        direction: 'short',
        strike_price: 460,
        total_premium: 400,
        premium_per_contract: 4.0,
        contracts: 1,
        underlying_symbol: 'SPY',
        expiration_date: '2024-02-16',
        opened_date: '2024-01-15',
      });

      const longCall = makePosition({
        id: 'long_call_1',
        option_type: 'call',
        direction: 'long',
        strike_price: 470,
        total_premium: 150,
        premium_per_contract: 1.5,
        contracts: 1,
        underlying_symbol: 'SPY',
        expiration_date: '2024-02-16',
        opened_date: '2024-01-15',
      });

      const spreads = detectSpreads([shortCall, longCall]);

      expect(spreads).toHaveLength(1);
      expect(spreads[0]!.spread_type).toBe('call_credit_spread');
      expect(spreads[0]!.short_leg_id).toBe('short_call_1');
      expect(spreads[0]!.long_leg_id).toBe('long_call_1');
      expect(spreads[0]!.underlying_symbol).toBe('SPY');
    });
  });

  describe('csp detection', () => {
    it('classifies a short put with no matching long put as csp', () => {
      const shortPut = makePosition({
        id: 'csp_put_1',
        option_type: 'put',
        direction: 'short',
        strike_price: 450,
        total_premium: 300,
        contracts: 1,
        underlying_symbol: 'SPY',
        expiration_date: '2024-01-19',
        opened_date: '2024-01-02',
      });

      const spreads = detectSpreads([shortPut]);

      expect(spreads).toHaveLength(1);
      expect(spreads[0]!.spread_type).toBe('csp');
      expect(spreads[0]!.short_leg_id).toBe('csp_put_1');
      expect(spreads[0]!.long_leg_id).toBeUndefined();
      expect(spreads[0]!.underlying_symbol).toBe('SPY');
    });
  });

  describe('non-matching legs', () => {
    it('does not link legs with different underlying symbols', () => {
      const shortPut = makePosition({
        id: 'short_spy',
        option_type: 'put',
        direction: 'short',
        strike_price: 450,
        total_premium: 300,
        contracts: 1,
        underlying_symbol: 'SPY',
        expiration_date: '2024-01-19',
        opened_date: '2024-01-02',
      });

      const longPut = makePosition({
        id: 'long_qqq',
        option_type: 'put',
        direction: 'long',
        strike_price: 440,
        total_premium: 100,
        contracts: 1,
        underlying_symbol: 'QQQ', // Different underlying
        expiration_date: '2024-01-19',
        opened_date: '2024-01-02',
      });

      const spreads = detectSpreads([shortPut, longPut]);

      // Short put becomes CSP since it has no matching long
      const csp = spreads.find((s) => s.spread_type === 'csp');
      expect(csp).toBeDefined();
      expect(csp!.short_leg_id).toBe('short_spy');

      // The long put with different underlying is not linked
      const linked = spreads.find((s) => s.long_leg_id === 'long_qqq');
      expect(linked).toBeUndefined();
    });

    it('does not link legs with different expiration dates', () => {
      const shortPut = makePosition({
        id: 'short_jan',
        option_type: 'put',
        direction: 'short',
        strike_price: 450,
        total_premium: 300,
        contracts: 1,
        underlying_symbol: 'SPY',
        expiration_date: '2024-01-19',
        opened_date: '2024-01-02',
      });

      const longPut = makePosition({
        id: 'long_feb',
        option_type: 'put',
        direction: 'long',
        strike_price: 440,
        total_premium: 100,
        contracts: 1,
        underlying_symbol: 'SPY',
        expiration_date: '2024-02-16', // Different expiration
        opened_date: '2024-01-02',
      });

      const spreads = detectSpreads([shortPut, longPut]);

      const csp = spreads.find((s) => s.spread_type === 'csp');
      expect(csp).toBeDefined();
      expect(csp!.short_leg_id).toBe('short_jan');

      const linked = spreads.find((s) => s.long_leg_id === 'long_feb');
      expect(linked).toBeUndefined();
    });

    it('does not link legs with different opened_date', () => {
      const shortPut = makePosition({
        id: 'short_early',
        option_type: 'put',
        direction: 'short',
        strike_price: 450,
        total_premium: 300,
        contracts: 1,
        underlying_symbol: 'SPY',
        expiration_date: '2024-01-19',
        opened_date: '2024-01-02',
      });

      const longPut = makePosition({
        id: 'long_late',
        option_type: 'put',
        direction: 'long',
        strike_price: 440,
        total_premium: 100,
        contracts: 1,
        underlying_symbol: 'SPY',
        expiration_date: '2024-01-19',
        opened_date: '2024-01-05', // Different opened_date
      });

      const spreads = detectSpreads([shortPut, longPut]);

      const csp = spreads.find((s) => s.spread_type === 'csp');
      expect(csp).toBeDefined();
      expect(csp!.short_leg_id).toBe('short_early');

      const linked = spreads.find((s) => s.long_leg_id === 'long_late');
      expect(linked).toBeUndefined();
    });
  });

  describe('net_credit and max_loss calculations', () => {
    it('calculates correct net_credit and max_loss for put_credit_spread', () => {
      // Short put: strike 450, premium $300
      // Long put: strike 440, premium $100
      // Expected: net_credit = 300 - 100 = 200
      // spread_width = 450 - 440 = 10
      // collateral = 10 * 100 * 1 = 1000
      // max_loss = 1000 - 200 = 800
      const shortPut = makePosition({
        id: 'short_calc',
        option_type: 'put',
        direction: 'short',
        strike_price: 450,
        total_premium: 300,
        contracts: 1,
        underlying_symbol: 'SPY',
        expiration_date: '2024-01-19',
        opened_date: '2024-01-02',
      });

      const longPut = makePosition({
        id: 'long_calc',
        option_type: 'put',
        direction: 'long',
        strike_price: 440,
        total_premium: 100,
        contracts: 1,
        underlying_symbol: 'SPY',
        expiration_date: '2024-01-19',
        opened_date: '2024-01-02',
      });

      const spreads = detectSpreads([shortPut, longPut]);

      expect(spreads).toHaveLength(1);
      const spread = spreads[0]!;
      expect(spread.net_credit).toBe(200);
      expect(spread.max_loss).toBe(800);
      expect(spread.collateral_required).toBe(1000);
      expect(spread.breakeven).toBe(448); // 450 - (200 / (100 * 1))
    });

    it('calculates correct net_credit and max_loss for call_credit_spread', () => {
      // Short call: strike 460, premium $400
      // Long call: strike 470, premium $150
      // Expected: net_credit = 400 - 150 = 250
      // spread_width = 470 - 460 = 10
      // collateral = 10 * 100 * 1 = 1000
      // max_loss = 1000 - 250 = 750
      const shortCall = makePosition({
        id: 'short_call_calc',
        option_type: 'call',
        direction: 'short',
        strike_price: 460,
        total_premium: 400,
        contracts: 1,
        underlying_symbol: 'SPY',
        expiration_date: '2024-02-16',
        opened_date: '2024-01-15',
      });

      const longCall = makePosition({
        id: 'long_call_calc',
        option_type: 'call',
        direction: 'long',
        strike_price: 470,
        total_premium: 150,
        contracts: 1,
        underlying_symbol: 'SPY',
        expiration_date: '2024-02-16',
        opened_date: '2024-01-15',
      });

      const spreads = detectSpreads([shortCall, longCall]);

      expect(spreads).toHaveLength(1);
      const spread = spreads[0]!;
      expect(spread.net_credit).toBe(250);
      expect(spread.max_loss).toBe(750);
      expect(spread.collateral_required).toBe(1000);
      expect(spread.breakeven).toBe(462.5); // 460 + (250 / (100 * 1))
    });

    it('calculates correct values for multi-contract spreads', () => {
      // Short put: strike 450, 2 contracts, premium $600 total
      // Long put: strike 445, 2 contracts, premium $200 total
      // Expected: net_credit = 600 - 200 = 400
      // spread_width = 450 - 445 = 5
      // collateral = 5 * 100 * 2 = 1000
      // max_loss = 1000 - 400 = 600
      const shortPut = makePosition({
        id: 'short_multi',
        option_type: 'put',
        direction: 'short',
        strike_price: 450,
        total_premium: 600,
        premium_per_contract: 3.0,
        contracts: 2,
        underlying_symbol: 'SPY',
        expiration_date: '2024-01-19',
        opened_date: '2024-01-02',
      });

      const longPut = makePosition({
        id: 'long_multi',
        option_type: 'put',
        direction: 'long',
        strike_price: 445,
        total_premium: 200,
        premium_per_contract: 1.0,
        contracts: 2,
        underlying_symbol: 'SPY',
        expiration_date: '2024-01-19',
        opened_date: '2024-01-02',
      });

      const spreads = detectSpreads([shortPut, longPut]);

      expect(spreads).toHaveLength(1);
      const spread = spreads[0]!;
      expect(spread.net_credit).toBe(400);
      expect(spread.max_loss).toBe(600);
      expect(spread.collateral_required).toBe(1000);
      expect(spread.breakeven).toBe(448); // 450 - (400 / (100 * 2))
    });

    it('calculates correct net_credit and max_loss for csp', () => {
      // Short put: strike 450, premium $300, 1 contract
      // Expected: net_credit = 300
      // collateral = 450 * 100 * 1 = 45000
      // max_loss = 45000 - 300 = 44700
      // breakeven = 450 - (300 / (100 * 1)) = 447
      const shortPut = makePosition({
        id: 'csp_calc',
        option_type: 'put',
        direction: 'short',
        strike_price: 450,
        total_premium: 300,
        contracts: 1,
        underlying_symbol: 'SPY',
        expiration_date: '2024-01-19',
        opened_date: '2024-01-02',
      });

      const spreads = detectSpreads([shortPut]);

      expect(spreads).toHaveLength(1);
      const spread = spreads[0]!;
      expect(spread.spread_type).toBe('csp');
      expect(spread.net_credit).toBe(300);
      expect(spread.max_loss).toBe(44700);
      expect(spread.collateral_required).toBe(45000);
      expect(spread.breakeven).toBe(447);
    });
  });
});
