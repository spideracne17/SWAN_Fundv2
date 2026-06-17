/**
 * Expiration Handling Logic
 *
 * Determines the outcome when an option position reaches its expiration date:
 * - OTM (out-of-the-money): status → 'expired', full premium realized as profit
 * - ITM (in-the-money): position returned unchanged (assignment handled separately)
 *
 * OTM determination:
 * - Put: SPX price > strike price (put expires worthless)
 * - Call: SPX price < strike price (call expires worthless)
 */

import type { OptionPositionRecord } from '@/types/database';

/**
 * Determines if an option is out-of-the-money at expiration.
 *
 * - For puts: OTM when current price is ABOVE the strike (holder wouldn't exercise)
 * - For calls: OTM when current price is BELOW the strike (holder wouldn't exercise)
 */
function isOutOfTheMoney(
  optionType: 'put' | 'call',
  strikePrice: number,
  currentSpxPrice: number
): boolean {
  if (optionType === 'put') {
    return currentSpxPrice > strikePrice;
  }
  // call
  return currentSpxPrice < strikePrice;
}

/**
 * Handles the expiration of an option position based on the current SPX price.
 *
 * If the option expired OTM:
 * - Sets status to 'expired'
 * - Sets pnl to total_premium (full premium kept as profit)
 * - Sets closed_date to expiration_date
 *
 * If the option expired ITM:
 * - Returns the position unchanged (assignment handling is separate)
 *
 * @param position The option position record to evaluate at expiration
 * @param currentSpxPrice The SPX price at expiration
 * @returns The updated position record (or unchanged if ITM)
 */
export function handleExpiration(
  position: OptionPositionRecord,
  currentSpxPrice: number
): OptionPositionRecord {
  if (
    !isOutOfTheMoney(position.option_type, position.strike_price, currentSpxPrice)
  ) {
    // ITM — return position unchanged; assignment handled in task 10.5/10.6
    return position;
  }

  // OTM — option expires worthless, full premium is profit
  return {
    ...position,
    status: 'expired',
    pnl: position.total_premium,
    closed_date: position.expiration_date,
  };
}
