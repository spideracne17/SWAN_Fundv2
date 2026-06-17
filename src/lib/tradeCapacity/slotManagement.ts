/**
 * Slot Management for Trade Capacity Engine
 *
 * Manages slot-based collateral allocation for SPX put credit spreads.
 * Each open spread uses one slot. Total slots are configured via settings.
 */

import pb from '@/lib/pocketbase';
import { fetchSettingsByCategory } from '@/lib/settings';
import type { OptionSpreadRecord, SettingsRecord } from '@/types/database';

/**
 * Represents current slot availability for an account.
 */
export interface SlotAvailability {
  total_slots: number;
  used_slots: number;
  available_slots: number;
  max_allowed_by_market_color: number;
  collateral_per_slot: number;
  total_collateral_committed: number;
}

/** Default total slots if settings lookup fails. */
const DEFAULT_TOTAL_SLOTS = 10;

/** Default spread width (points) if settings lookup fails. */
const DEFAULT_SPREAD_WIDTH = 50;

/** Default contracts per slot if settings lookup fails. */
const DEFAULT_CONTRACTS_PER_SLOT = 1;

/**
 * Parses a JSON-encoded setting value to a number, returning a fallback on failure.
 */
function parseNumericSetting(value: string, fallback: number): number {
  try {
    const parsed = JSON.parse(value);
    const num = Number(parsed);
    return Number.isFinite(num) ? num : fallback;
  } catch {
    return fallback;
  }
}

/**
 * Retrieves trade capacity settings from the database.
 * Falls back to defaults if unavailable.
 */
async function loadTradeCapacitySettings(): Promise<{
  totalSlots: number;
  spreadWidth: number;
  contractsPerSlot: number;
}> {
  try {
    const settings = await fetchSettingsByCategory('trade_capacity');
    const settingsMap = new Map<string, SettingsRecord>();
    for (const s of settings) {
      settingsMap.set(s.key, s);
    }

    const totalSlots = settingsMap.has('total_slots')
      ? parseNumericSetting(settingsMap.get('total_slots')!.value, DEFAULT_TOTAL_SLOTS)
      : DEFAULT_TOTAL_SLOTS;

    const spreadWidth = settingsMap.has('spread_width')
      ? parseNumericSetting(settingsMap.get('spread_width')!.value, DEFAULT_SPREAD_WIDTH)
      : DEFAULT_SPREAD_WIDTH;

    const contractsPerSlot = settingsMap.has('max_contracts_per_slot')
      ? parseNumericSetting(settingsMap.get('max_contracts_per_slot')!.value, DEFAULT_CONTRACTS_PER_SLOT)
      : DEFAULT_CONTRACTS_PER_SLOT;

    return { totalSlots, spreadWidth, contractsPerSlot };
  } catch {
    return {
      totalSlots: DEFAULT_TOTAL_SLOTS,
      spreadWidth: DEFAULT_SPREAD_WIDTH,
      contractsPerSlot: DEFAULT_CONTRACTS_PER_SLOT,
    };
  }
}

/**
 * Counts open spreads for a given account by querying option_spreads
 * whose short_leg belongs to the specified account.
 */
async function countOpenSpreads(accountId: string): Promise<OptionSpreadRecord[]> {
  try {
    return await pb.collection('option_spreads').getFullList<OptionSpreadRecord>({
      filter: `status = "open" && short_leg_id.account_id = "${accountId}"`,
    });
  } catch {
    return [];
  }
}

/**
 * Gets the current slot availability for an account.
 *
 * - Reads total_slots from settings (key 'total_slots', category 'trade_capacity')
 * - Queries option_spreads collection for open spreads in the given account
 * - Calculates: used = count of open spreads, available = total - used
 *
 * @param accountId - The PocketBase account ID to check slots for
 * @returns SlotAvailability with current slot status and collateral info
 */
export async function getAvailableSlots(accountId: string): Promise<SlotAvailability> {
  const [settings, openSpreads] = await Promise.all([
    loadTradeCapacitySettings(),
    countOpenSpreads(accountId),
  ]);

  const { totalSlots, spreadWidth, contractsPerSlot } = settings;
  const usedSlots = openSpreads.length;
  const availableSlots = Math.max(0, totalSlots - usedSlots);

  // Collateral per slot = spread_width × contracts × 100
  const collateralPerSlot = spreadWidth * contractsPerSlot * 100;

  // Total collateral committed = sum of all open spread collateral requirements
  const totalCollateralCommitted = openSpreads.reduce(
    (sum, spread) => sum + spread.collateral_required,
    0
  );

  // max_allowed_by_market_color defaults to totalSlots here;
  // the actual market color restriction is applied by getCapacityByColor (task 11.2)
  const maxAllowedByMarketColor = totalSlots;

  return {
    total_slots: totalSlots,
    used_slots: usedSlots,
    available_slots: availableSlots,
    max_allowed_by_market_color: maxAllowedByMarketColor,
    collateral_per_slot: collateralPerSlot,
    total_collateral_committed: totalCollateralCommitted,
  };
}
