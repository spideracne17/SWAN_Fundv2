import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { OptionSpreadRecord, SettingsRecord } from '@/types/database';

// Mock PocketBase
vi.mock('@/lib/pocketbase', () => ({
  default: {
    collection: vi.fn(),
  },
}));

// Mock settings
vi.mock('@/lib/settings', () => ({
  fetchSettingsByCategory: vi.fn(),
}));

import pb from '@/lib/pocketbase';
import { fetchSettingsByCategory } from '@/lib/settings';
import { getAvailableSlots } from '../slotManagement';

const mockFetchSettings = vi.mocked(fetchSettingsByCategory);
const mockCollection = vi.mocked(pb.collection);

function makeSettingsRecords(overrides: {
  totalSlots?: number;
  spreadWidth?: number;
  contractsPerSlot?: number;
} = {}): SettingsRecord[] {
  const { totalSlots = 10, spreadWidth = 50, contractsPerSlot = 1 } = overrides;
  return [
    {
      id: 's1',
      created: '2024-01-01T00:00:00Z',
      updated: '2024-01-01T00:00:00Z',
      key: 'total_slots',
      value: JSON.stringify(totalSlots),
      category: 'trade_capacity',
    },
    {
      id: 's2',
      created: '2024-01-01T00:00:00Z',
      updated: '2024-01-01T00:00:00Z',
      key: 'spread_width',
      value: JSON.stringify(spreadWidth),
      category: 'trade_capacity',
    },
    {
      id: 's3',
      created: '2024-01-01T00:00:00Z',
      updated: '2024-01-01T00:00:00Z',
      key: 'max_contracts_per_slot',
      value: JSON.stringify(contractsPerSlot),
      category: 'trade_capacity',
    },
  ];
}

function makeSpread(overrides: Partial<OptionSpreadRecord> = {}): OptionSpreadRecord {
  return {
    id: 'spread_1',
    created: '2024-01-01T00:00:00Z',
    updated: '2024-01-01T00:00:00Z',
    spread_type: 'put_credit_spread',
    short_leg_id: 'leg_1',
    underlying_symbol: 'SPX',
    net_credit: 150,
    max_loss: 4850,
    collateral_required: 5000,
    breakeven: 4850,
    status: 'open',
    ...overrides,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe('getAvailableSlots', () => {
  function setupMocks(openSpreads: OptionSpreadRecord[], settings?: SettingsRecord[]) {
    mockFetchSettings.mockResolvedValue(settings ?? makeSettingsRecords());
    mockCollection.mockReturnValue({
      getFullList: vi.fn().mockResolvedValue(openSpreads),
    } as any);
  }

  it('returns all slots available when no open spreads exist', async () => {
    setupMocks([]);

    const result = await getAvailableSlots('acct_1');

    expect(result.total_slots).toBe(10);
    expect(result.used_slots).toBe(0);
    expect(result.available_slots).toBe(10);
    expect(result.total_collateral_committed).toBe(0);
  });

  it('returns 7 available slots when 3 open spreads exist', async () => {
    const spreads = Array.from({ length: 3 }, (_, i) =>
      makeSpread({ id: `spread_${i}`, collateral_required: 5000 })
    );
    setupMocks(spreads);

    const result = await getAvailableSlots('acct_1');

    expect(result.total_slots).toBe(10);
    expect(result.used_slots).toBe(3);
    expect(result.available_slots).toBe(7);
    expect(result.total_collateral_committed).toBe(15000);
  });

  it('returns 0 available slots when fully utilized (10 open spreads)', async () => {
    const spreads = Array.from({ length: 10 }, (_, i) =>
      makeSpread({ id: `spread_${i}`, collateral_required: 5000 })
    );
    setupMocks(spreads);

    const result = await getAvailableSlots('acct_1');

    expect(result.total_slots).toBe(10);
    expect(result.used_slots).toBe(10);
    expect(result.available_slots).toBe(0);
    expect(result.total_collateral_committed).toBe(50000);
  });

  it('calculates collateral_per_slot as spread_width × contracts × 100', async () => {
    // Default: spread_width=50, contracts=1 → 50 × 1 × 100 = 5000
    setupMocks([]);

    const result = await getAvailableSlots('acct_1');

    expect(result.collateral_per_slot).toBe(5000);
  });

  it('calculates collateral_per_slot correctly with custom settings', async () => {
    // spread_width=75, contracts=2 → 75 × 2 × 100 = 15000
    const settings = makeSettingsRecords({ spreadWidth: 75, contractsPerSlot: 2 });
    setupMocks([], settings);

    const result = await getAvailableSlots('acct_1');

    expect(result.collateral_per_slot).toBe(15000);
  });

  it('clamps available_slots to 0 when used exceeds total', async () => {
    // Edge case: if somehow more spreads exist than total_slots
    const settings = makeSettingsRecords({ totalSlots: 5 });
    const spreads = Array.from({ length: 8 }, (_, i) =>
      makeSpread({ id: `spread_${i}`, collateral_required: 5000 })
    );
    setupMocks(spreads, settings);

    const result = await getAvailableSlots('acct_1');

    expect(result.total_slots).toBe(5);
    expect(result.used_slots).toBe(8);
    expect(result.available_slots).toBe(0);
  });
});
