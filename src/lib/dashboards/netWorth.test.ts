import { describe, it, expect } from 'vitest';
import { calculateNetWorth } from './netWorth';

describe('calculateNetWorth', () => {
  it('returns Roth at face value with no tax adjustment', () => {
    const result = calculateNetWorth({
      rothValue: 50000,
      traditionalValue: 0,
      taxableValue: 0,
      taxableUnrealizedGains: 0,
      marginalRate: 0.24,
      longTermRate: 0.15,
    });

    expect(result.roth_value).toBe(50000);
  });

  it('adjusts traditional by (1 - marginalRate)', () => {
    const result = calculateNetWorth({
      rothValue: 0,
      traditionalValue: 100000,
      taxableValue: 0,
      taxableUnrealizedGains: 0,
      marginalRate: 0.24,
      longTermRate: 0.15,
    });

    expect(result.traditional_adjusted).toBe(76000); // 100000 * (1 - 0.24)
  });

  it('adjusts taxable by subtracting capital gains tax on unrealized gains', () => {
    const result = calculateNetWorth({
      rothValue: 0,
      traditionalValue: 0,
      taxableValue: 200000,
      taxableUnrealizedGains: 50000,
      marginalRate: 0.24,
      longTermRate: 0.15,
    });

    // 200000 - (50000 * 0.15) = 200000 - 7500 = 192500
    expect(result.taxable_adjusted).toBe(192500);
  });

  it('computes total as sum of all adjusted values', () => {
    const result = calculateNetWorth({
      rothValue: 50000,
      traditionalValue: 100000,
      taxableValue: 200000,
      taxableUnrealizedGains: 50000,
      marginalRate: 0.24,
      longTermRate: 0.15,
    });

    // Roth: 50000, Traditional: 76000, Taxable: 192500
    expect(result.total_net_worth).toBe(50000 + 76000 + 192500);
    expect(result.total_net_worth).toBe(318500);
  });

  it('handles zero values correctly', () => {
    const result = calculateNetWorth({
      rothValue: 0,
      traditionalValue: 0,
      taxableValue: 0,
      taxableUnrealizedGains: 0,
      marginalRate: 0.24,
      longTermRate: 0.15,
    });

    expect(result.roth_value).toBe(0);
    expect(result.traditional_adjusted).toBe(0);
    expect(result.taxable_adjusted).toBe(0);
    expect(result.total_net_worth).toBe(0);
  });

  it('handles zero tax rates (no tax burden)', () => {
    const result = calculateNetWorth({
      rothValue: 50000,
      traditionalValue: 100000,
      taxableValue: 200000,
      taxableUnrealizedGains: 50000,
      marginalRate: 0,
      longTermRate: 0,
    });

    expect(result.roth_value).toBe(50000);
    expect(result.traditional_adjusted).toBe(100000); // No discount
    expect(result.taxable_adjusted).toBe(200000); // No gains tax
    expect(result.total_net_worth).toBe(350000);
  });

  it('handles negative unrealized gains (losses) correctly', () => {
    const result = calculateNetWorth({
      rothValue: 0,
      traditionalValue: 0,
      taxableValue: 150000,
      taxableUnrealizedGains: -10000,
      marginalRate: 0.24,
      longTermRate: 0.15,
    });

    // 150000 - (-10000 * 0.15) = 150000 + 1500 = 151500
    // (losses reduce your tax liability, increasing after-tax value)
    expect(result.taxable_adjusted).toBe(151500);
  });
});
