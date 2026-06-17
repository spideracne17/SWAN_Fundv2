/**
 * Net Worth Calculation
 *
 * Computes tax-adjusted net worth across account types:
 * - Roth accounts: face value (no tax on withdrawal)
 * - Traditional accounts: face value × (1 - marginal_rate) to reflect deferred tax liability
 * - Taxable accounts: face value minus estimated capital gains tax on unrealized gains
 */

// ─── Interfaces ──────────────────────────────────────────────────────────────

/** Tax-adjusted net worth breakdown by account type. */
export interface NetWorthBreakdown {
  roth_value: number;
  traditional_adjusted: number;
  taxable_adjusted: number;
  total_net_worth: number;
}

/** Options for calculating tax-adjusted net worth. */
export interface NetWorthOptions {
  /** Total current value of Roth accounts (face value, no tax) */
  rothValue: number;
  /** Total current value of Traditional IRA accounts */
  traditionalValue: number;
  /** Total current value of taxable accounts */
  taxableValue: number;
  /** Unrealized capital gains in taxable accounts */
  taxableUnrealizedGains: number;
  /** Marginal income tax rate (e.g., 0.24 for 24%) */
  marginalRate: number;
  /** Long-term capital gains tax rate (e.g., 0.15 for 15%) */
  longTermRate: number;
}

// ─── Main Function ───────────────────────────────────────────────────────────

/**
 * Calculates tax-adjusted net worth across all account types.
 *
 * - Roth: face value (withdrawals are tax-free)
 * - Traditional: face × (1 - marginalRate) reflecting deferred income tax
 * - Taxable: face value minus estimated capital gains tax on unrealized gains
 *
 * @param opts - Values and tax rates for the calculation
 * @returns NetWorthBreakdown with per-account-type adjusted values and total
 */
export function calculateNetWorth(opts: NetWorthOptions): NetWorthBreakdown {
  const {
    rothValue,
    traditionalValue,
    taxableValue,
    taxableUnrealizedGains,
    marginalRate,
    longTermRate,
  } = opts;

  // Roth accounts: no tax adjustment needed
  const roth_value = rothValue;

  // Traditional accounts: discount by marginal income tax rate
  const traditional_adjusted = traditionalValue * (1 - marginalRate);

  // Taxable accounts: subtract estimated capital gains tax on unrealized gains
  const taxable_adjusted = taxableValue - taxableUnrealizedGains * longTermRate;

  // Total tax-adjusted net worth
  const total_net_worth = roth_value + traditional_adjusted + taxable_adjusted;

  return {
    roth_value,
    traditional_adjusted,
    taxable_adjusted,
    total_net_worth,
  };
}
