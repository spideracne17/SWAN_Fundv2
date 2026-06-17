import { describe, it, expect } from 'vitest';
import * as fc from 'fast-check';
import { normalizeDate, parseAmount } from '../normalization';

/**
 * Property-based tests for normalization utilities.
 *
 * **Validates: Requirements 1.2**
 */
describe('normalizeDate - property-based tests', () => {
  it('for any valid MM/DD/YYYY date, returns a string matching ISO date format', () => {
    const validDateArb = fc
      .record({
        month: fc.integer({ min: 1, max: 12 }),
        day: fc.integer({ min: 1, max: 28 }),
        year: fc.integer({ min: 2000, max: 2030 }),
      })
      .map(({ month, day, year }) => {
        const mm = String(month).padStart(2, '0');
        const dd = String(day).padStart(2, '0');
        return `${mm}/${dd}/${year}`;
      });

    fc.assert(
      fc.property(validDateArb, (dateStr) => {
        const result = normalizeDate(dateStr);
        expect(result).toMatch(/^\d{4}-\d{2}-\d{2}$/);
      }),
      { numRuns: 200 },
    );
  });
});

describe('parseAmount - property-based tests', () => {
  it('for any formatted amount string, returns a finite number', () => {
    const formattedAmountArb = fc
      .double({ min: 0.01, max: 9_999_999.99, noNaN: true, noDefaultInfinity: true })
      .map((num) => {
        const rounded = Math.round(num * 100) / 100;
        const formatted = rounded.toLocaleString('en-US', {
          minimumFractionDigits: 2,
          maximumFractionDigits: 2,
        });
        return `$${formatted}`;
      });

    fc.assert(
      fc.property(formattedAmountArb, (amountStr) => {
        const result = parseAmount(amountStr);
        expect(Number.isFinite(result)).toBe(true);
      }),
      { numRuns: 200 },
    );
  });

  it('for any parenthesized negative amount string, returns a finite negative number', () => {
    const negativeAmountArb = fc
      .double({ min: 0.01, max: 9_999_999.99, noNaN: true, noDefaultInfinity: true })
      .map((num) => {
        const rounded = Math.round(num * 100) / 100;
        const formatted = rounded.toLocaleString('en-US', {
          minimumFractionDigits: 2,
          maximumFractionDigits: 2,
        });
        return `($${formatted})`;
      });

    fc.assert(
      fc.property(negativeAmountArb, (amountStr) => {
        const result = parseAmount(amountStr);
        expect(Number.isFinite(result)).toBe(true);
        expect(result).toBeLessThan(0);
      }),
      { numRuns: 200 },
    );
  });
});
