/**
 * Retirement Dashboard
 *
 * Tracks Roth IRA and Traditional IRA contribution amounts,
 * remaining contribution room for the current year, and total account values.
 */

import pb from '@/lib/pocketbase';
import { fetchSettingsByCategory } from '@/lib/settings';
import type { AccountRecord, IRAContributionRecord, TaxLotRecord, SettingsRecord } from '@/types/database';

// ─── Interfaces ──────────────────────────────────────────────────────────────

/** Status for a single IRA account. */
export interface IRAStatus {
  account_id: string;
  current_year_contributions: number;
  annual_limit: number;
  remaining_room: number;
  total_value: number;
}

/** Tax-adjusted IRA portfolio values. */
export interface TaxAdjustedIRAValues {
  /** Roth IRA at face value (withdrawals are tax-free) */
  roth_adjusted: number;
  /** Traditional IRA at face × (1 - marginal_tax_rate) */
  traditional_adjusted: number;
  /** Combined tax-adjusted value */
  total_tax_adjusted: number;
}

/** Aggregated retirement dashboard data. */
export interface RetirementDashboardData {
  roth_ira: IRAStatus;
  traditional_ira: IRAStatus;
  tax_adjusted_value: number;
}

// ─── Constants ───────────────────────────────────────────────────────────────

/** 2024 IRA annual contribution limit for individuals under age 50. */
export const IRA_ANNUAL_LIMIT = 7000;

/** 2024 IRA annual contribution limit for individuals age 50 and over (catch-up). */
export const IRA_CATCHUP_LIMIT = 8000;

// ─── Helpers ─────────────────────────────────────────────────────────────────

/**
 * Sums current-year contributions for a given account.
 */
async function sumCurrentYearContributions(accountId: string, year: number): Promise<number> {
  try {
    const contributions = await pb
      .collection('ira_contributions')
      .getFullList<IRAContributionRecord>({
        filter: `account_id = "${accountId}" && tax_year = ${year}`,
      });

    return contributions.reduce((sum, record) => sum + record.amount, 0);
  } catch {
    return 0;
  }
}

/**
 * Calculates the total value of open/partial tax lots for a given account.
 */
async function calculateAccountValue(accountId: string): Promise<number> {
  try {
    const lots = await pb.collection('tax_lots').getFullList<TaxLotRecord>({
      filter: `account_id = "${accountId}" && (status = "open" || status = "partial")`,
    });

    return lots.reduce(
      (sum, lot) => sum + lot.remaining_shares * lot.cost_per_share,
      0
    );
  } catch {
    return 0;
  }
}

/**
 * Loads the marginal tax rate from the tax settings.
 * Returns 0 if the setting is not found or cannot be parsed.
 */
async function loadMarginalTaxRate(): Promise<number> {
  try {
    const taxSettings = await fetchSettingsByCategory('tax');
    const marginalSetting = taxSettings.find(
      (s: SettingsRecord) => s.key === 'marginal_tax_rate'
    );
    if (marginalSetting) {
      const rate = Number(JSON.parse(marginalSetting.value));
      return isFinite(rate) ? rate : 0;
    }
    return 0;
  } catch {
    return 0;
  }
}

/**
 * Finds the account record matching the given account_type.
 */
async function findAccountByType(
  accountType: 'roth_ira' | 'traditional_ira'
): Promise<AccountRecord | null> {
  try {
    const accounts = await pb.collection('accounts').getFullList<AccountRecord>({
      filter: `account_type = "${accountType}" && is_active = true`,
    });
    return accounts.length > 0 ? accounts[0]! : null;
  } catch {
    return null;
  }
}

// ─── Tax-Adjusted Values ─────────────────────────────────────────────────────

/**
 * Calculates tax-adjusted portfolio values for IRA accounts.
 *
 * - Roth IRA: face value (withdrawals are tax-free)
 * - Traditional IRA: face value × (1 - marginal_tax_rate) reflecting deferred tax liability
 *
 * @param rothValue - Current total value of Roth IRA
 * @param traditionalValue - Current total value of Traditional IRA
 * @param marginalTaxRate - Marginal income tax rate (e.g., 0.32 for 32%)
 * @returns Tax-adjusted values for each account type and combined total
 */
export function calculateTaxAdjustedIRAValues(
  rothValue: number,
  traditionalValue: number,
  marginalTaxRate: number
): TaxAdjustedIRAValues {
  // Roth: face value, no tax on qualified withdrawals
  const roth_adjusted = rothValue;

  // Traditional: discount by marginal income tax rate
  const traditional_adjusted = traditionalValue * (1 - marginalTaxRate);

  // Combined tax-adjusted portfolio value
  const total_tax_adjusted = roth_adjusted + traditional_adjusted;

  return {
    roth_adjusted,
    traditional_adjusted,
    total_tax_adjusted,
  };
}

// ─── Main Function ───────────────────────────────────────────────────────────

/**
 * Fetches retirement dashboard data including contribution tracking,
 * remaining room for both Roth IRA and Traditional IRA, and
 * tax-adjusted portfolio values.
 *
 * Uses the standard annual limit (under-50). The combined IRA contribution
 * limit applies across both Roth and Traditional accounts per IRS rules.
 */
export async function fetchRetirementData(): Promise<RetirementDashboardData> {
  const currentYear = new Date().getFullYear();
  const annualLimit = IRA_ANNUAL_LIMIT;

  // Find both IRA accounts
  const [rothAccount, traditionalAccount] = await Promise.all([
    findAccountByType('roth_ira'),
    findAccountByType('traditional_ira'),
  ]);

  const rothAccountId = rothAccount?.id ?? '';
  const traditionalAccountId = traditionalAccount?.id ?? '';

  // Fetch contributions, values, and tax settings in parallel
  const [rothContributions, traditionalContributions, rothValue, traditionalValue, taxSettings] =
    await Promise.all([
      sumCurrentYearContributions(rothAccountId, currentYear),
      sumCurrentYearContributions(traditionalAccountId, currentYear),
      rothAccountId ? calculateAccountValue(rothAccountId) : Promise.resolve(0),
      traditionalAccountId ? calculateAccountValue(traditionalAccountId) : Promise.resolve(0),
      loadMarginalTaxRate(),
    ]);

  const rothRemainingRoom = Math.max(0, annualLimit - rothContributions);
  const traditionalRemainingRoom = Math.max(0, annualLimit - traditionalContributions);

  // Calculate tax-adjusted portfolio value
  const taxAdjusted = calculateTaxAdjustedIRAValues(rothValue, traditionalValue, taxSettings);

  return {
    roth_ira: {
      account_id: rothAccountId,
      current_year_contributions: rothContributions,
      annual_limit: annualLimit,
      remaining_room: rothRemainingRoom,
      total_value: rothValue,
    },
    traditional_ira: {
      account_id: traditionalAccountId,
      current_year_contributions: traditionalContributions,
      annual_limit: annualLimit,
      remaining_room: traditionalRemainingRoom,
      total_value: traditionalValue,
    },
    tax_adjusted_value: taxAdjusted.total_tax_adjusted,
  };
}
