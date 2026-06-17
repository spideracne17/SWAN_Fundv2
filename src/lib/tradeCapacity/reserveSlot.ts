/**
 * Slot Reservation for Trade Capacity Engine
 *
 * Validates and reserves a slot for a new spread position,
 * enforcing market color limits and collateral constraints.
 */

import type { MarketColor } from '@/types/database';
import { getAvailableSlots } from './slotManagement';
import { getCapacityByColor } from './capacityByColor';
import { calculateCollateral } from './calculateCollateral';

/**
 * A proposed spread to be validated and reserved.
 */
export interface SpreadProposal {
  underlying_symbol: string;
  spread_width: number;
  contracts: number;
  net_credit: number;
}

/**
 * Result of a slot reservation attempt.
 */
export type ReservationResult =
  | { success: true; reservation_id: string }
  | { success: false; reason: string };

/**
 * Generates a unique reservation ID.
 */
function generateReservationId(): string {
  return `res_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;
}

/**
 * Attempts to reserve a slot for the given spread proposal.
 *
 * Validation order:
 *   1. Check if there are available slots (total - used > 0)
 *   2. Check market color capacity limit (max_new_positions based on color)
 *   3. Validate collateral: spread_width × contracts × 100 must not exceed
 *      available buying power (total buying power minus already committed collateral)
 *
 * The market color limit takes precedence over raw slot availability.
 * If both pass, collateral is validated against available buying power.
 *
 * @param accountId - The account to reserve a slot for
 * @param spread - The proposed spread details
 * @param marketColor - The current market color regime
 * @returns ReservationResult with success and reservation_id, or failure reason
 */
export async function reserveSlot(
  accountId: string,
  spread: SpreadProposal,
  marketColor: MarketColor
): Promise<ReservationResult> {
  const slots = await getAvailableSlots(accountId);

  // 1. Check raw slot availability
  if (slots.available_slots <= 0) {
    return {
      success: false,
      reason: 'No available slots. All slots are currently in use.',
    };
  }

  // 2. Check market color capacity limit
  const capacity = getCapacityByColor(marketColor, slots.total_slots);
  if (capacity.max_new_positions <= 0) {
    return {
      success: false,
      reason: `Market color ${marketColor} does not allow new positions.`,
    };
  }

  // Market color restricts further: used_slots must be below the market color cap
  if (slots.used_slots >= capacity.max_new_positions) {
    return {
      success: false,
      reason: `Market color ${marketColor} limits total positions to ${capacity.max_new_positions}. Currently ${slots.used_slots} slots are in use.`,
    };
  }

  // 3. Validate collateral
  const requiredCollateral = calculateCollateral(spread.spread_width, spread.contracts);
  const availableBuyingPower =
    slots.total_slots * slots.collateral_per_slot - slots.total_collateral_committed;

  if (requiredCollateral > availableBuyingPower) {
    return {
      success: false,
      reason: `Insufficient buying power. Required collateral: $${requiredCollateral.toLocaleString()}, available: $${availableBuyingPower.toLocaleString()}.`,
    };
  }

  return {
    success: true,
    reservation_id: generateReservationId(),
  };
}

/**
 * Releases a slot for a closed or expired spread.
 *
 * In this system, slot availability is computed dynamically by counting open spreads.
 * When a spread's status changes to closed or expired, the slot is automatically freed.
 * This function serves as a semantic API contract that could trigger cache invalidation
 * or notifications in the future.
 *
 * @param reservationId - The reservation ID of the spread being released
 */
export async function releaseSlot(reservationId: string): Promise<void> {
  console.log(`[TradeCapacity] Slot released for reservation: ${reservationId}`);
}
