import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { SlotAvailability } from '../slotManagement';

// Mock the slotManagement module (getAvailableSlots hits the DB)
vi.mock('../slotManagement', () => ({
  getAvailableSlots: vi.fn(),
}));

import { getAvailableSlots } from '../slotManagement';
import { reserveSlot, type SpreadProposal } from '../reserveSlot';

const mockGetAvailableSlots = vi.mocked(getAvailableSlots);

/**
 * Creates a controlled SlotAvailability for testing.
 * Default: 10 total slots, 2 used, 8 available, $5000/slot collateral, $10000 committed.
 */
function makeSlotAvailability(overrides: Partial<SlotAvailability> = {}): SlotAvailability {
  const defaults: SlotAvailability = {
    total_slots: 10,
    used_slots: 2,
    available_slots: 8,
    max_allowed_by_market_color: 10,
    collateral_per_slot: 5000,
    total_collateral_committed: 10000,
  };
  return { ...defaults, ...overrides };
}

/** A standard spread proposal: 50-point wide, 1 contract → $5000 collateral required */
const defaultProposal: SpreadProposal = {
  underlying_symbol: 'SPX',
  spread_width: 50,
  contracts: 1,
  net_credit: 150,
};

beforeEach(() => {
  vi.clearAllMocks();
});

describe('reserveSlot', () => {
  describe('market color denial', () => {
    it('denies reservation when market color is BLACK', async () => {
      // BLACK → max_new_positions = 0, so it's denied immediately on the color check
      mockGetAvailableSlots.mockResolvedValue(makeSlotAvailability());

      const result = await reserveSlot('acct_1', defaultProposal, 'BLACK');

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.reason).toContain('BLACK');
        expect(result.reason).toContain('does not allow new positions');
      }
    });

    it('denies reservation when market color is RED and used_slots >= 1', async () => {
      // RED → max_new_positions = 1; with used_slots=1, used >= cap → denied
      mockGetAvailableSlots.mockResolvedValue(
        makeSlotAvailability({ used_slots: 1, available_slots: 9 })
      );

      const result = await reserveSlot('acct_1', defaultProposal, 'RED');

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.reason).toContain('RED');
        expect(result.reason).toContain('limits total positions to 1');
      }
    });

    it('denies reservation when market color is YELLOW and used_slots >= half of total', async () => {
      // YELLOW with 10 total → max_new_positions = floor(10/2) = 5
      // used_slots = 5 → used >= cap → denied
      mockGetAvailableSlots.mockResolvedValue(
        makeSlotAvailability({ used_slots: 5, available_slots: 5 })
      );

      const result = await reserveSlot('acct_1', defaultProposal, 'YELLOW');

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.reason).toContain('YELLOW');
        expect(result.reason).toContain('limits total positions to 5');
      }
    });
  });

  describe('collateral denial', () => {
    it('denies reservation when available buying power is insufficient for proposed collateral', async () => {
      // total buying power = total_slots * collateral_per_slot = 10 * 5000 = 50000
      // committed = 48000 → available = 50000 - 48000 = 2000
      // required for proposal = 50 * 1 * 100 = 5000 → 5000 > 2000 → denied
      mockGetAvailableSlots.mockResolvedValue(
        makeSlotAvailability({ total_collateral_committed: 48000 })
      );

      const result = await reserveSlot('acct_1', defaultProposal, 'GREEN');

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.reason).toContain('Insufficient buying power');
      }
    });
  });

  describe('successful reservation', () => {
    it('succeeds when all conditions pass (GREEN, slots available, sufficient collateral)', async () => {
      // GREEN → max_new_positions = 10, used_slots = 2 < 10 ✓
      // available_slots = 8 > 0 ✓
      // buying power = 10*5000 - 10000 = 40000, required = 5000 ≤ 40000 ✓
      mockGetAvailableSlots.mockResolvedValue(makeSlotAvailability());

      const result = await reserveSlot('acct_1', defaultProposal, 'GREEN');

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.reservation_id).toBeDefined();
        expect(result.reservation_id).toMatch(/^res_/);
      }
    });
  });
});
