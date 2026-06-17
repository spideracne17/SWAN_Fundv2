/**
 * Capacity By Color
 *
 * Determines the maximum number of new positions allowed
 * based on the current market color regime.
 */

import type { MarketColor } from '@/types/database';

/**
 * Capacity limits derived from the current market color.
 */
export interface CapacityLimits {
  color: MarketColor;
  max_new_positions: number;
}

/**
 * Returns the capacity limits for a given market color and total slot count.
 *
 * - GREEN: max_new_positions = totalSlots (full capacity)
 * - YELLOW: max_new_positions = floor(totalSlots / 2) (half capacity)
 * - RED: max_new_positions = 1
 * - BLACK: max_new_positions = 0 (no new positions)
 *
 * @param marketColor - The current market color regime
 * @param totalSlots - The total number of available slots
 * @returns CapacityLimits with the color and computed max_new_positions
 */
export function getCapacityByColor(
  marketColor: MarketColor,
  totalSlots: number
): CapacityLimits {
  switch (marketColor) {
    case 'GREEN':
      return { color: 'GREEN', max_new_positions: totalSlots };
    case 'YELLOW':
      return { color: 'YELLOW', max_new_positions: Math.floor(totalSlots / 2) };
    case 'RED':
      return { color: 'RED', max_new_positions: 1 };
    case 'BLACK':
      return { color: 'BLACK', max_new_positions: 0 };
  }
}
