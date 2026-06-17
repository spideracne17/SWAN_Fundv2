import { differenceInDays } from 'date-fns';
import type { HoldingPeriod } from '@/types/database';

/**
 * Determines the holding period classification for a tax lot disposition.
 *
 * A lot held for more than 365 days is classified as "long_term";
 * otherwise it is "short_term" (365 days or fewer).
 *
 * @param acquisitionDate - ISO 8601 date string when the lot was acquired
 * @param dispositionDate - ISO 8601 date string when the lot was disposed
 * @returns The holding period classification
 */
export function getHoldingPeriod(
  acquisitionDate: string,
  dispositionDate: string
): HoldingPeriod {
  const days = differenceInDays(
    new Date(dispositionDate),
    new Date(acquisitionDate)
  );
  return days > 365 ? 'long_term' : 'short_term';
}
