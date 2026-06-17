import { describe, it, expect } from 'vitest';
import { detectRollChains } from '../rollChain';
import type { OptionPositionRecord } from '@/types/database';

function makePosition(
  overrides: Partial<OptionPositionRecord> = {}
): OptionPositionRecord {
  return {
    id: crypto.randomUUID(),
    account_id: 'acc_1',
    underlying_symbol: 'SPX',
    option_symbol: 'SPX240119P04800000',
    option_type: 'put',
    direction: 'short',
    strike_price: 4800,
    expiration_date: '2024-01-19',
    contracts: 1,
    premium_per_contract: 5.0,
    total_premium: 500,
    status: 'open',
    opened_date: '2024-01-02',
    created: '2024-01-02T00:00:00Z',
    updated: '2024-01-02T00:00:00Z',
    ...overrides,
  };
}

describe('detectRollChains', () => {
  it('returns positions unchanged when no rolls are detected', () => {
    const positions = [
      makePosition({ id: 'p1', status: 'open', opened_date: '2024-01-02' }),
      makePosition({ id: 'p2', status: 'open', opened_date: '2024-01-10' }),
    ];

    const result = detectRollChains(positions);

    expect(result[0]!.roll_chain_id).toBeUndefined();
    expect(result[1]!.roll_chain_id).toBeUndefined();
  });

  it('detects a same-day close + open as a roll', () => {
    const positions = [
      makePosition({
        id: 'closed_1',
        status: 'closed',
        opened_date: '2024-01-02',
        closed_date: '2024-01-15',
      }),
      makePosition({
        id: 'opened_1',
        status: 'open',
        opened_date: '2024-01-15',
        expiration_date: '2024-02-16',
        strike_price: 4750,
      }),
    ];

    const result = detectRollChains(positions);

    const closed = result.find((p) => p.id === 'closed_1')!;
    const opened = result.find((p) => p.id === 'opened_1')!;

    expect(closed.status).toBe('rolled');
    expect(closed.roll_chain_id).toBeDefined();
    expect(opened.roll_chain_id).toBe(closed.roll_chain_id);
  });

  it('does not link positions on different underlyings', () => {
    const positions = [
      makePosition({
        id: 'closed_1',
        underlying_symbol: 'SPX',
        status: 'closed',
        opened_date: '2024-01-02',
        closed_date: '2024-01-15',
      }),
      makePosition({
        id: 'opened_1',
        underlying_symbol: 'AAPL',
        status: 'open',
        opened_date: '2024-01-15',
      }),
    ];

    const result = detectRollChains(positions);

    expect(result.find((p) => p.id === 'closed_1')!.roll_chain_id).toBeUndefined();
    expect(result.find((p) => p.id === 'opened_1')!.roll_chain_id).toBeUndefined();
  });

  it('handles multi-roll chains with a shared chain ID', () => {
    // Position A rolled to B, then B rolled to C
    const positions = [
      makePosition({
        id: 'pos_a',
        status: 'closed',
        opened_date: '2024-01-02',
        closed_date: '2024-01-15',
      }),
      makePosition({
        id: 'pos_b',
        status: 'closed',
        opened_date: '2024-01-15',
        closed_date: '2024-02-10',
      }),
      makePosition({
        id: 'pos_c',
        status: 'open',
        opened_date: '2024-02-10',
        expiration_date: '2024-03-15',
      }),
    ];

    const result = detectRollChains(positions);

    const a = result.find((p) => p.id === 'pos_a')!;
    const b = result.find((p) => p.id === 'pos_b')!;
    const c = result.find((p) => p.id === 'pos_c')!;

    // All three should share the same roll_chain_id
    expect(a.roll_chain_id).toBeDefined();
    expect(b.roll_chain_id).toBe(a.roll_chain_id);
    expect(c.roll_chain_id).toBe(a.roll_chain_id);

    // Closed positions in the chain should have status 'rolled'
    expect(a.status).toBe('rolled');
    expect(b.status).toBe('rolled');
  });

  it('does not match positions where closed_date differs from opened_date', () => {
    const positions = [
      makePosition({
        id: 'closed_1',
        status: 'closed',
        opened_date: '2024-01-02',
        closed_date: '2024-01-15',
      }),
      makePosition({
        id: 'opened_1',
        status: 'open',
        opened_date: '2024-01-16', // Day after close — not a roll
      }),
    ];

    const result = detectRollChains(positions);

    expect(result.find((p) => p.id === 'closed_1')!.roll_chain_id).toBeUndefined();
    expect(result.find((p) => p.id === 'opened_1')!.roll_chain_id).toBeUndefined();
  });

  it('handles 4-position roll chain (A→B→C→D) with a single shared chain_id', () => {
    const positions = [
      makePosition({
        id: 'pos_a',
        status: 'closed',
        opened_date: '2024-01-02',
        closed_date: '2024-01-15',
      }),
      makePosition({
        id: 'pos_b',
        status: 'closed',
        opened_date: '2024-01-15',
        closed_date: '2024-02-10',
      }),
      makePosition({
        id: 'pos_c',
        status: 'closed',
        opened_date: '2024-02-10',
        closed_date: '2024-03-05',
      }),
      makePosition({
        id: 'pos_d',
        status: 'open',
        opened_date: '2024-03-05',
        expiration_date: '2024-04-19',
      }),
    ];

    const result = detectRollChains(positions);

    const a = result.find((p) => p.id === 'pos_a')!;
    const b = result.find((p) => p.id === 'pos_b')!;
    const c = result.find((p) => p.id === 'pos_c')!;
    const d = result.find((p) => p.id === 'pos_d')!;

    // All four positions share the same chain_id
    expect(a.roll_chain_id).toBeDefined();
    expect(b.roll_chain_id).toBe(a.roll_chain_id);
    expect(c.roll_chain_id).toBe(a.roll_chain_id);
    expect(d.roll_chain_id).toBe(a.roll_chain_id);

    // All closed positions should be marked as 'rolled'
    expect(a.status).toBe('rolled');
    expect(b.status).toBe('rolled');
    expect(c.status).toBe('rolled');
    // The last position remains open
    expect(d.status).toBe('open');
  });

  it('handles concurrent rolls on different underlyings independently', () => {
    const positions = [
      // SPX chain: SPX_A → SPX_B
      makePosition({
        id: 'spx_a',
        underlying_symbol: 'SPX',
        status: 'closed',
        opened_date: '2024-01-02',
        closed_date: '2024-01-15',
      }),
      makePosition({
        id: 'spx_b',
        underlying_symbol: 'SPX',
        status: 'open',
        opened_date: '2024-01-15',
        expiration_date: '2024-02-16',
      }),
      // AAPL chain: AAPL_A → AAPL_B (rolled on the same day as SPX)
      makePosition({
        id: 'aapl_a',
        underlying_symbol: 'AAPL',
        status: 'closed',
        opened_date: '2024-01-03',
        closed_date: '2024-01-15',
      }),
      makePosition({
        id: 'aapl_b',
        underlying_symbol: 'AAPL',
        status: 'open',
        opened_date: '2024-01-15',
        expiration_date: '2024-02-16',
      }),
    ];

    const result = detectRollChains(positions);

    const spxA = result.find((p) => p.id === 'spx_a')!;
    const spxB = result.find((p) => p.id === 'spx_b')!;
    const aaplA = result.find((p) => p.id === 'aapl_a')!;
    const aaplB = result.find((p) => p.id === 'aapl_b')!;

    // SPX positions share one chain ID
    expect(spxA.roll_chain_id).toBeDefined();
    expect(spxB.roll_chain_id).toBe(spxA.roll_chain_id);

    // AAPL positions share a different chain ID
    expect(aaplA.roll_chain_id).toBeDefined();
    expect(aaplB.roll_chain_id).toBe(aaplA.roll_chain_id);

    // The two chains are independent
    expect(spxA.roll_chain_id).not.toBe(aaplA.roll_chain_id);

    // Closed positions are marked as rolled
    expect(spxA.status).toBe('rolled');
    expect(aaplA.status).toBe('rolled');
  });

  it('preserves existing roll_chain_id when extending a chain', () => {
    const existingChainId = 'existing-chain-uuid';

    const positions = [
      makePosition({
        id: 'pos_a',
        status: 'rolled',
        opened_date: '2024-01-02',
        closed_date: '2024-01-15',
        roll_chain_id: existingChainId,
      }),
      makePosition({
        id: 'pos_b',
        status: 'closed',
        opened_date: '2024-01-15',
        closed_date: '2024-02-10',
        roll_chain_id: existingChainId,
      }),
      makePosition({
        id: 'pos_c',
        status: 'open',
        opened_date: '2024-02-10',
        expiration_date: '2024-03-15',
      }),
    ];

    const result = detectRollChains(positions);

    const c = result.find((p) => p.id === 'pos_c')!;

    // The new position should inherit the existing chain ID
    expect(c.roll_chain_id).toBe(existingChainId);
    // The closed position should be marked as rolled
    expect(result.find((p) => p.id === 'pos_b')!.status).toBe('rolled');
  });
});
