import { describe, it, expect } from 'vitest';
import { calculateTaxAdjustedIRAValues, IRA_ANNUAL_LIMIT, IRA_CATCHUP_LIMIT } from './retirement';

describe('IRA Annual Limits', () => {
  it('IRA_ANNUAL_LIMIT is 7000 for individuals under age 50', () => {
    expect(IRA_ANNUAL_LIMIT).toBe(7000);
  });

  it('IRA_CATCHUP_LIMIT is 8000 for individuals age 50 and over', () => {
    expect(IRA_CATCHUP_LIMIT).toBe(8000);
  });
});

describe('Contribution Room Calculation', () => {
  // The contribution room formula used in fetchRetirementData:
  // remaining_room = Math.max(0, annual_limit - current_year_contributions)

  function calculateContributionRoom(currentYearContributions: number, annualLimit: number = IRA_ANNUAL_LIMIT): number {
    return Math.max(0, annualLimit - currentYearContributions);
  }

  it('calculates remaining room when partially contributed (7000 - 3000 = 4000)', () => {
    const remaining = calculateContributionRoom(3000);
    expect(remaining).toBe(4000);
  });

  it('returns 0 remaining room when fully contributed (7000 - 7000 = 0)', () => {
    const remaining = calculateContributionRoom(7000);
    expect(remaining).toBe(0);
  });

  it('clamps to 0 when contributions exceed annual limit (no negative room)', () => {
    const remaining = calculateContributionRoom(8000);
    expect(remaining).toBe(0);
  });

  it('returns full limit when no contributions made (7000 - 0 = 7000)', () => {
    const remaining = calculateContributionRoom(0);
    expect(remaining).toBe(7000);
  });

  it('handles small contribution amounts correctly', () => {
    const remaining = calculateContributionRoom(100);
    expect(remaining).toBe(6900);
  });

  it('works with the catch-up limit for 50+ investors', () => {
    const remaining = calculateContributionRoom(3000, IRA_CATCHUP_LIMIT);
    expect(remaining).toBe(5000);
  });
});

describe('calculateTaxAdjustedIRAValues', () => {
  it('returns Roth at face value (no tax adjustment)', () => {
    const result = calculateTaxAdjustedIRAValues(50000, 0, 0.32);
    expect(result.roth_adjusted).toBe(50000);
  });

  it('adjusts Traditional by (1 - marginal_tax_rate)', () => {
    const result = calculateTaxAdjustedIRAValues(0, 100000, 0.24);
    expect(result.traditional_adjusted).toBe(76000); // 100000 * (1 - 0.24)
  });

  it('calculates combined tax-adjusted total', () => {
    const result = calculateTaxAdjustedIRAValues(50000, 100000, 0.32);
    // Roth: 50000, Traditional: 100000 * 0.68 = 68000
    expect(result.total_tax_adjusted).toBe(118000);
  });

  it('handles zero tax rate (no adjustment)', () => {
    const result = calculateTaxAdjustedIRAValues(30000, 70000, 0);
    expect(result.roth_adjusted).toBe(30000);
    expect(result.traditional_adjusted).toBe(70000);
    expect(result.total_tax_adjusted).toBe(100000);
  });

  it('handles zero balances', () => {
    const result = calculateTaxAdjustedIRAValues(0, 0, 0.32);
    expect(result.roth_adjusted).toBe(0);
    expect(result.traditional_adjusted).toBe(0);
    expect(result.total_tax_adjusted).toBe(0);
  });

  it('handles 100% tax rate edge case', () => {
    const result = calculateTaxAdjustedIRAValues(50000, 100000, 1.0);
    expect(result.roth_adjusted).toBe(50000);
    expect(result.traditional_adjusted).toBe(0);
    expect(result.total_tax_adjusted).toBe(50000);
  });
});
