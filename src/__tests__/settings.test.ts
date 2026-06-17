import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock PocketBase module
const mockGetFullList = vi.fn();
const mockUpdate = vi.fn();

vi.mock('@/lib/pocketbase', () => ({
  default: {
    collection: vi.fn((name: string) => {
      if (name === 'settings') {
        return {
          getFullList: mockGetFullList,
          update: mockUpdate,
        };
      }
      return {};
    }),
    authStore: {
      isValid: true,
      record: null,
      onChange: vi.fn(() => () => {}),
    },
  },
}));

import { fetchSettings, fetchSettingsByCategory, updateSetting } from '@/lib/settings';
import type { SettingsRecord } from '@/types/database';

const mockSettingsData: SettingsRecord[] = [
  {
    id: 'setting1',
    key: 'vix_green_max',
    value: '15',
    category: 'market_color',
    description: 'VIX upper bound for GREEN',
    created: '2024-01-01T00:00:00Z',
    updated: '2024-01-01T00:00:00Z',
  },
  {
    id: 'setting2',
    key: 'max_slots',
    value: '10',
    category: 'trade_capacity',
    description: 'Maximum trade slots',
    created: '2024-01-01T00:00:00Z',
    updated: '2024-01-01T00:00:00Z',
  },
];

describe('Settings CRUD (src/lib/settings.ts)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('fetchSettings', () => {
    it('returns all settings from PocketBase sorted by category,key', async () => {
      mockGetFullList.mockResolvedValue(mockSettingsData);

      const result = await fetchSettings();

      expect(mockGetFullList).toHaveBeenCalledWith({ sort: 'category,key' });
      expect(result).toEqual(mockSettingsData);
      expect(result).toHaveLength(2);
    });

    it('returns empty array when no settings exist', async () => {
      mockGetFullList.mockResolvedValue([]);

      const result = await fetchSettings();

      expect(result).toEqual([]);
    });
  });

  describe('fetchSettingsByCategory', () => {
    it('filters settings by category', async () => {
      const marketColorSettings = [mockSettingsData[0]!];
      mockGetFullList.mockResolvedValue(marketColorSettings);

      const result = await fetchSettingsByCategory('market_color');

      expect(mockGetFullList).toHaveBeenCalledWith({
        filter: 'category = "market_color"',
        sort: 'key',
      });
      expect(result).toEqual(marketColorSettings);
    });
  });

  describe('updateSetting', () => {
    it('calls PocketBase update with the correct id and value', async () => {
      const updatedRecord: SettingsRecord = {
        ...mockSettingsData[0]!,
        value: '20',
        updated: '2024-01-02T00:00:00Z',
      };
      mockUpdate.mockResolvedValue(updatedRecord);

      const result = await updateSetting('setting1', '20');

      expect(mockUpdate).toHaveBeenCalledWith('setting1', { value: '20' });
      expect(result).toEqual(updatedRecord);
      expect(result.value).toBe('20');
    });
  });
});
