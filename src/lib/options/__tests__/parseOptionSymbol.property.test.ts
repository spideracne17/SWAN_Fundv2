import { describe, it, expect } from 'vitest';
import * as fc from 'fast-check';
import { parseOptionSymbol } from '../parseOptionSymbol';

/**
 * Property-based test: OCC symbol roundtrip
 * **Validates: Requirements 9.5**
 *
 * For any generated valid OCC symbol, parseOptionSymbol can parse it,
 * and when we re-serialize the parsed result back to OCC format,
 * it matches the original string.
 */
describe('parseOptionSymbol - property-based tests', () => {
  // Arbitrary for 1-6 uppercase letters
  const underlyingArb = fc
    .integer({ min: 1, max: 6 })
    .chain((len) =>
      fc.stringOf(fc.constantFrom(...'ABCDEFGHIJKLMNOPQRSTUVWXYZ'.split('')), {
        minLength: len,
        maxLength: len,
      })
    );

  // Arbitrary for valid YYMMDD date components
  const yearArb = fc.integer({ min: 24, max: 30 });
  const monthArb = fc.integer({ min: 1, max: 12 });
  const dayArb = fc.integer({ min: 1, max: 28 }); // Use 28 for safety across all months

  // Arbitrary for option type
  const typeArb = fc.constantFrom('C', 'P') as fc.Arbitrary<'C' | 'P'>;

  // Arbitrary for strike (integer 1 to 9999000, representing $0.001 to $9999.000)
  const strikeArb = fc.integer({ min: 1, max: 9999000 });

  // Build a valid OCC string from generated parts
  function buildOccSymbol(
    underlying: string,
    year: number,
    month: number,
    day: number,
    type: 'C' | 'P',
    strike: number
  ): string {
    const yy = year.toString().padStart(2, '0');
    const mm = month.toString().padStart(2, '0');
    const dd = day.toString().padStart(2, '0');
    const strikeStr = strike.toString().padStart(8, '0');
    return `${underlying}${yy}${mm}${dd}${type}${strikeStr}`;
  }

  // Re-serialize parsed result back to OCC format
  function reserialize(parsed: {
    underlying: string;
    expiration: string;
    type: 'call' | 'put';
    strike: number;
  }): string {
    const underlying = parsed.underlying;
    const [yearFull, mm, dd] = parsed.expiration.split('-');
    const yy = yearFull!.slice(2);
    const typeChar = parsed.type === 'call' ? 'C' : 'P';
    const strikeEncoded = Math.round(parsed.strike * 1000)
      .toString()
      .padStart(8, '0');
    return `${underlying}${yy}${mm}${dd}${typeChar}${strikeEncoded}`;
  }

  it('roundtrip: parsing a valid OCC symbol and re-serializing produces the original', () => {
    fc.assert(
      fc.property(
        underlyingArb,
        yearArb,
        monthArb,
        dayArb,
        typeArb,
        strikeArb,
        (underlying, year, month, day, type, strike) => {
          const occSymbol = buildOccSymbol(underlying, year, month, day, type, strike);

          const parsed = parseOptionSymbol(occSymbol, 'robinhood');

          const reserialized = reserialize(parsed);

          expect(reserialized).toBe(occSymbol);
        }
      ),
      { numRuns: 200 }
    );
  });
});
