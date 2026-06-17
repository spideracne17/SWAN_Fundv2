/**
 * Roll Chain Management
 *
 * Detects same-day close + open pairs on the same underlying and links them
 * into roll chains. When a position is closed and a new position is opened on
 * the same underlying on the same day, both positions share a roll_chain_id
 * and the closed position's status is set to 'rolled'.
 *
 * Multi-roll chains are supported: if a position that already has a
 * roll_chain_id is rolled again, the new position inherits the same chain ID.
 */

import type { OptionPositionRecord } from '@/types/database';

/**
 * Detects roll chains within a set of option positions.
 *
 * Groups positions by underlying_symbol, then looks for same-day close + open
 * pairs (closed_date of one position === opened_date of another). When a roll
 * is detected:
 *   - A shared roll_chain_id (UUID) is assigned to both positions
 *   - The closed position's status is set to 'rolled'
 *   - Multi-roll chains share the same chain_id across all linked positions
 *
 * @param positions Array of OptionPositionRecord to analyze
 * @returns Modified positions array with roll_chain_id and status updates
 */
export function detectRollChains(
  positions: OptionPositionRecord[]
): OptionPositionRecord[] {
  // Group positions by underlying symbol
  const groups = new Map<string, OptionPositionRecord[]>();

  for (const pos of positions) {
    const key = pos.underlying_symbol;
    const group = groups.get(key);
    if (group) {
      group.push(pos);
    } else {
      groups.set(key, [pos]);
    }
  }

  // Process each underlying group for roll detection
  for (const group of groups.values()) {
    // Separate closed positions (with a closed_date) and opened positions
    const closedPositions = group.filter(
      (p) =>
        p.closed_date != null &&
        (p.status === 'closed' || p.status === 'rolled')
    );
    const openedPositions = group.filter((p) => p.opened_date != null);

    // For each closed position, look for an open on the same day
    for (const closed of closedPositions) {
      const matchingOpens = openedPositions.filter(
        (open) =>
          open.id !== closed.id && open.opened_date === closed.closed_date
      );

      for (const opened of matchingOpens) {
        // Determine the chain ID to use:
        // - If the closed position already belongs to a chain, extend it
        // - If the opened position already belongs to a chain, use that
        // - Otherwise, generate a new chain ID
        const chainId =
          closed.roll_chain_id ??
          opened.roll_chain_id ??
          crypto.randomUUID();

        // Assign the chain ID to both positions
        closed.roll_chain_id = chainId;
        closed.status = 'rolled';
        opened.roll_chain_id = chainId;

        // Propagate chain ID to any other positions already in either chain
        // This handles multi-roll scenarios where we need consistency
        propagateChainId(group, chainId, closed, opened);
      }
    }
  }

  return positions;
}

/**
 * Propagates a chain ID to all positions that share a chain with the given
 * positions. This ensures multi-roll chains maintain a single consistent ID.
 */
function propagateChainId(
  group: OptionPositionRecord[],
  chainId: string,
  ...linkedPositions: OptionPositionRecord[]
): void {
  // Collect any existing chain IDs from the linked positions (before this update)
  const oldChainIds = new Set<string>();
  for (const pos of linkedPositions) {
    if (pos.roll_chain_id && pos.roll_chain_id !== chainId) {
      oldChainIds.add(pos.roll_chain_id);
    }
  }

  // If there were pre-existing chain IDs, update all positions in the group
  // that had those old IDs to use the new unified chain ID
  if (oldChainIds.size > 0) {
    for (const pos of group) {
      if (pos.roll_chain_id && oldChainIds.has(pos.roll_chain_id)) {
        pos.roll_chain_id = chainId;
      }
    }
  }
}
