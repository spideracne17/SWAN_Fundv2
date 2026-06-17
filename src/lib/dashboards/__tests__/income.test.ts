import { describe, it, expect } from 'vitest';
import { calculateHourlyEquivalents, getStartDateForPeriod } from '../income';

describe('calculateHourlyEquivalents', () => {
  it('calculates correct hourly equivalents for $20,800 annual income', () => {
    const result = calculateHourlyEquivalents(20800);

    expect(result.hourly_40hr).toBe(10);
    expect(result.hourly_24hr).toBeCloseTo(16.67, 2);
  });

  it('returns zero for both equivalents when income is 0', () => {
    const result = calculateHourlyEquivalents(0);

    expect(result.hourly_40hr).toBe(0);
    expect(result.hourly_24hr).toBe(0);
  });

  it('handles large income values correctly', () => {
    const result = calculateHourlyEquivalents(104000);

    expect(result.hourly_40hr).toBe(50);
    expect(result.hourly_24hr).toBeCloseTo(83.33, 2);
  });
});

describe('getStartDateForPeriod', () => {
  // Use a fixed reference date: July 15, 2024
  const referenceDate = new Date(2024, 6, 15); // Month is 0-indexed

  it('returns first day of current month for mtd', () => {
    const result = getStartDateForPeriod('mtd', referenceDate);
    expect(result).toBe('2024-07-01');
  });

  it('returns first day of current quarter for qtd', () => {
    const result = getStartDateForPeriod('qtd', referenceDate);
    expect(result).toBe('2024-07-01'); // Q3 starts July 1
  });

  it('returns first day of current quarter for qtd in Q1', () => {
    const febDate = new Date(2024, 1, 20); // Feb 20, 2024
    const result = getStartDateForPeriod('qtd', febDate);
    expect(result).toBe('2024-01-01');
  });

  it('returns January 1 of current year for ytd', () => {
    const result = getStartDateForPeriod('ytd', referenceDate);
    expect(result).toBe('2024-01-01');
  });

  it('returns date 12 months ago for trailing_12m', () => {
    const result = getStartDateForPeriod('trailing_12m', referenceDate);
    expect(result).toBe('2023-07-15');
  });
});
