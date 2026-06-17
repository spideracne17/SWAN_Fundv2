/**
 * Trade Capacity Engine
 *
 * Manages slot-based collateral allocation for SPX put credit spreads,
 * enforcing position limits based on market conditions.
 */

export { getAvailableSlots } from './slotManagement';
export type { SlotAvailability } from './slotManagement';

export { getCapacityByColor } from './capacityByColor';
export type { CapacityLimits } from './capacityByColor';

export { reserveSlot, releaseSlot } from './reserveSlot';
export type { SpreadProposal, ReservationResult } from './reserveSlot';

export { calculateCollateral, validateCollateral } from './calculateCollateral';
