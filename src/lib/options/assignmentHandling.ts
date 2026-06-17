/**
 * Assignment Handling Logic
 *
 * Handles the lifecycle events when options are assigned:
 *
 * Short Put Assignment:
 * - The option seller is obligated to buy shares at the strike price
 * - Cost basis for acquired shares = strike_price - premium_received_per_share
 * - A new tax lot is created representing the acquired shares
 *
 * Covered Call Assignment:
 * - The option seller is obligated to sell shares at the strike price
 * - Proceeds per share = strike_price + premium_received_per_share
 * - Existing underlying lots are disposed using FIFO
 */

import type { DispositionRecord, OptionPositionRecord, TaxLotRecord } from '@/types/database';
import { createLot } from '@/lib/taxLots/createLot';
import { disposeLotsFIFO } from '@/lib/taxLots/disposeLots';

export interface PutAssignmentResult {
  updatedPosition: OptionPositionRecord;
  newLot: TaxLotRecord;
}

/**
 * Handles assignment of a short put position using position.expiration_date.
 *
 * @deprecated Use handleShortPutAssignment with explicit assignmentDate instead.
 * @param position The short put option position being assigned
 * @returns The updated position and the newly created tax lot
 */
export function handlePutAssignment(position: OptionPositionRecord): PutAssignmentResult {
  return handleShortPutAssignment(position, position.expiration_date);
}

/**
 * Handles assignment of a short put position.
 *
 * When a short put is assigned:
 * - The position is marked as 'assigned' with closed_date = assignmentDate
 * - A new tax lot is created for the acquired shares with:
 *   - cost_per_share = strike_price - (total_premium / (contracts * 100))
 *   - shares_acquired = contracts * 100
 *   - acquisition_type = 'exercise'
 *   - acquisition_date = assignmentDate
 * - The position's assignment_lot_id links to the new lot
 *
 * @param position The short put option position being assigned
 * @param assignmentDate The date the assignment occurs
 * @returns The updated position and the newly created tax lot
 */
export function handleShortPutAssignment(
  position: OptionPositionRecord,
  assignmentDate: string
): PutAssignmentResult {
  const sharesAcquired = position.contracts * 100;
  const premiumPerShare = position.total_premium / sharesAcquired;
  const costPerShare = position.strike_price - premiumPerShare;

  const newLot = createLot({
    account_id: position.account_id,
    symbol: position.underlying_symbol,
    acquisition_date: assignmentDate,
    shares_acquired: sharesAcquired,
    cost_per_share: costPerShare,
    acquisition_type: 'exercise',
  });

  const updatedPosition: OptionPositionRecord = {
    ...position,
    status: 'assigned',
    closed_date: assignmentDate,
    assignment_lot_id: newLot.id,
  };

  return { updatedPosition, newLot };
}

export interface CoveredCallAssignmentResult {
  updatedPosition: OptionPositionRecord;
  dispositions: DispositionRecord[];
}

/**
 * Handles assignment of a covered call position.
 *
 * When a covered call is assigned:
 * - The position is marked as 'assigned' with closed_date = expiration_date
 * - The underlying shares are disposed using FIFO with:
 *   - proceeds_per_share = strike_price + (total_premium / (contracts * 100))
 *   - sale quantity = contracts * 100
 *   - sale date = expiration_date
 * - The resulting dispositions capture the gain/loss on the underlying shares
 *
 * @param position The covered call option position being assigned
 * @param underlyingLots The open/partial tax lots for the underlying shares
 * @returns The updated position and the disposition records from selling the shares
 */
export function handleCoveredCallAssignment(
  position: OptionPositionRecord,
  underlyingLots: TaxLotRecord[]
): CoveredCallAssignmentResult {
  const sharesDisposed = position.contracts * 100;
  const premiumPerShare = position.total_premium / sharesDisposed;
  const proceedsPerShare = position.strike_price + premiumPerShare;

  const dispositions = disposeLotsFIFO(
    {
      symbol: position.underlying_symbol,
      quantity: sharesDisposed,
      proceeds_per_share: proceedsPerShare,
      date: position.expiration_date,
    },
    underlyingLots
  );

  const updatedPosition: OptionPositionRecord = {
    ...position,
    status: 'assigned',
    closed_date: position.expiration_date,
  };

  return { updatedPosition, dispositions };
}
