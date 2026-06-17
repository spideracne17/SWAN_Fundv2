/**
 * Spread Detection Logic
 *
 * Detects and links option position legs into spread records:
 * - put_credit_spread: short put + long put (lower strike), same underlying/expiration/opened_date
 * - call_credit_spread: short call + long call (higher strike), same underlying/expiration/opened_date
 * - csp: short put with no matching long put
 * - covered_call: identified separately (requires stock position context)
 */

import type {
  OptionPositionRecord,
  OptionSpreadRecord,
  SpreadStatus,
} from '@/types/database';

/**
 * Groups positions by a composite key for spread matching.
 * Key: underlying_symbol + expiration_date + option_type + opened_date
 */
function buildGroupKey(position: OptionPositionRecord): string {
  return `${position.underlying_symbol}|${position.expiration_date}|${position.option_type}|${position.opened_date}`;
}

/**
 * Determines spread status from the statuses of its legs.
 */
function deriveSpreadStatus(
  shortLeg: OptionPositionRecord,
  longLeg?: OptionPositionRecord
): SpreadStatus {
  if (shortLeg.status === 'assigned') return 'assigned';
  if (shortLeg.status === 'expired') {
    if (!longLeg || longLeg.status === 'expired') return 'expired';
  }
  if (shortLeg.status === 'closed') {
    if (!longLeg || longLeg.status === 'closed') return 'closed';
  }
  return 'open';
}

/**
 * Generates a deterministic spread ID from the short and optional long leg IDs.
 */
function generateSpreadId(shortLegId: string, longLegId?: string): string {
  return longLegId
    ? `spread_${shortLegId}_${longLegId}`
    : `spread_${shortLegId}`;
}

/**
 * Detects and constructs spread records from a list of option positions.
 *
 * Links short + long legs on same underlying, same expiration, same type, same opened_date.
 * - put_credit_spread: short put + long put with lower strike
 * - call_credit_spread: short call + long call with higher strike
 * - csp: short put with no matching long put
 * - covered_call: NOT detected here (requires stock position context)
 *
 * @param positions Array of OptionPositionRecord to analyze
 * @returns Array of OptionSpreadRecord with calculated financials
 */
export function detectSpreads(
  positions: OptionPositionRecord[]
): OptionSpreadRecord[] {
  const spreads: OptionSpreadRecord[] = [];
  const matchedPositionIds = new Set<string>();

  // Group positions by underlying + expiration + type + opened_date
  const groups = new Map<string, OptionPositionRecord[]>();

  for (const pos of positions) {
    const key = buildGroupKey(pos);
    const group = groups.get(key);
    if (group) {
      group.push(pos);
    } else {
      groups.set(key, [pos]);
    }
  }

  // Process each group to find spread pairs
  for (const group of groups.values()) {
    const shortLegs = group.filter((p) => p.direction === 'short');
    const longLegs = group.filter((p) => p.direction === 'long');

    // Sort short legs by strike descending (highest first for matching)
    shortLegs.sort((a, b) => b.strike_price - a.strike_price);
    // Sort long legs by strike ascending (lowest first for put spreads)
    // For call spreads, long leg has higher strike, so sort ascending works too
    longLegs.sort((a, b) => a.strike_price - b.strike_price);

    for (const shortLeg of shortLegs) {
      if (matchedPositionIds.has(shortLeg.id)) continue;

      let matched = false;

      if (shortLeg.option_type === 'put') {
        // Look for a long put with LOWER strike (protective leg of put credit spread)
        const longLeg = longLegs.find(
          (l) =>
            !matchedPositionIds.has(l.id) &&
            l.strike_price < shortLeg.strike_price &&
            l.contracts === shortLeg.contracts
        );

        if (longLeg) {
          // put_credit_spread: short put (higher strike) + long put (lower strike)
          const spread = buildCreditSpread(
            'put_credit_spread',
            shortLeg,
            longLeg
          );
          spreads.push(spread);
          matchedPositionIds.add(shortLeg.id);
          matchedPositionIds.add(longLeg.id);
          matched = true;
        }
      } else if (shortLeg.option_type === 'call') {
        // Look for a long call with HIGHER strike (protective leg of call credit spread)
        const longLeg = longLegs.find(
          (l) =>
            !matchedPositionIds.has(l.id) &&
            l.strike_price > shortLeg.strike_price &&
            l.contracts === shortLeg.contracts
        );

        if (longLeg) {
          // call_credit_spread: short call (lower strike) + long call (higher strike)
          const spread = buildCreditSpread(
            'call_credit_spread',
            shortLeg,
            longLeg
          );
          spreads.push(spread);
          matchedPositionIds.add(shortLeg.id);
          matchedPositionIds.add(longLeg.id);
          matched = true;
        }
      }

      // If short put has no matching long put → CSP
      if (!matched && shortLeg.option_type === 'put') {
        const cspSpread = buildCSP(shortLeg);
        spreads.push(cspSpread);
        matchedPositionIds.add(shortLeg.id);
      }
    }
  }

  return spreads;
}

/**
 * Builds a credit spread record (put_credit_spread or call_credit_spread).
 *
 * For put credit spreads:
 *   - net_credit = short premium - long premium
 *   - spread_width = short_strike - long_strike
 *   - max_loss = (spread_width × 100 × contracts) - net_credit
 *   - collateral_required = spread_width × 100 × contracts
 *   - breakeven = short_strike - (net_credit / (100 × contracts))
 *
 * For call credit spreads:
 *   - net_credit = short premium - long premium
 *   - spread_width = long_strike - short_strike
 *   - max_loss = (spread_width × 100 × contracts) - net_credit
 *   - collateral_required = spread_width × 100 × contracts
 *   - breakeven = short_strike + (net_credit / (100 × contracts))
 */
function buildCreditSpread(
  spreadType: 'put_credit_spread' | 'call_credit_spread',
  shortLeg: OptionPositionRecord,
  longLeg: OptionPositionRecord
): OptionSpreadRecord {
  const netCredit = shortLeg.total_premium - longLeg.total_premium;

  const spreadWidth =
    spreadType === 'put_credit_spread'
      ? shortLeg.strike_price - longLeg.strike_price
      : longLeg.strike_price - shortLeg.strike_price;

  const collateralRequired = spreadWidth * 100 * shortLeg.contracts;
  const maxLoss = collateralRequired - netCredit;

  const breakeven =
    spreadType === 'put_credit_spread'
      ? shortLeg.strike_price - netCredit / (100 * shortLeg.contracts)
      : shortLeg.strike_price + netCredit / (100 * shortLeg.contracts);

  const status = deriveSpreadStatus(shortLeg, longLeg);

  return {
    id: generateSpreadId(shortLeg.id, longLeg.id),
    spread_type: spreadType,
    short_leg_id: shortLeg.id,
    long_leg_id: longLeg.id,
    underlying_symbol: shortLeg.underlying_symbol,
    net_credit: netCredit,
    max_loss: maxLoss,
    collateral_required: collateralRequired,
    breakeven: breakeven,
    status: status,
    created: new Date().toISOString(),
    updated: new Date().toISOString(),
  };
}

/**
 * Builds a CSP (cash-secured put) spread record.
 *
 * For CSPs:
 *   - net_credit = total premium received
 *   - max_loss = (strike × 100 × contracts) - net_credit
 *   - collateral_required = strike × 100 × contracts
 *   - breakeven = strike - (net_credit / (100 × contracts))
 */
function buildCSP(shortPut: OptionPositionRecord): OptionSpreadRecord {
  const netCredit = shortPut.total_premium;
  const collateralRequired = shortPut.strike_price * 100 * shortPut.contracts;
  const maxLoss = collateralRequired - netCredit;
  const breakeven =
    shortPut.strike_price - netCredit / (100 * shortPut.contracts);

  const status = deriveSpreadStatus(shortPut);

  return {
    id: generateSpreadId(shortPut.id),
    spread_type: 'csp',
    short_leg_id: shortPut.id,
    long_leg_id: undefined,
    underlying_symbol: shortPut.underlying_symbol,
    net_credit: netCredit,
    max_loss: maxLoss,
    collateral_required: collateralRequired,
    breakeven: breakeven,
    status: status,
    created: new Date().toISOString(),
    updated: new Date().toISOString(),
  };
}
