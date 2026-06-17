import { describe, it, expect } from 'vitest';
import * as fc from 'fast-check';
import { computeRecordHash, type HashableRecord } from '../deduplication';

/**
 * Arbitrary for generating random HashableRecord instances.
 */
const hashableRecordArb = fc.record({
  account_id: fc.string({ minLength: 1, maxLength: 20 }),
  transaction_date: fc.date({ min: new Date('2000-01-01'), max: new Date('2030-12-31') })
    .map(d => d.toISOString().split('T')[0]!),
  transaction_type: fc.stringOf(fc.constantFrom(...'abcdefghijklmnopqrstuvwxyz'.split('')), { minLength: 3, maxLength: 15 }),
  symbol: fc.option(fc.string({ minLength: 1, maxLength: 6 }), { nil: undefined }),
  quantity: fc.option(fc.double({ min: 0.001, max: 100000, noNaN: true, noDefaultInfinity: true }), { nil: undefined }),
  total_amount: fc.double({ min: -1000000, max: 1000000, noNaN: true, noDefaultInfinity: true }),
});

/**
 * Validates: Requirements 4.5
 *
 * Property 1: Determinism — calling computeRecordHash on the same record
 * always produces the same hash value.
 */
describe('computeRecordHash property-based tests', () => {
  it('same record always produces the same hash (determinism)', () => {
    fc.assert(
      fc.property(hashableRecordArb, (record: HashableRecord) => {
        const hash1 = computeRecordHash(record);
        const hash2 = computeRecordHash(record);
        expect(hash1).toBe(hash2);
      }),
      { numRuns: 200 },
    );
  });

  /**
   * Validates: Requirements 4.5
   *
   * Property 2: Uniqueness — for any two records that differ in at least one
   * canonical field, their hashes differ.
   */
  it('two distinct records produce different hashes', () => {
    fc.assert(
      fc.property(
        hashableRecordArb,
        hashableRecordArb,
        fc.constantFrom(
          'account_id',
          'transaction_date',
          'transaction_type',
          'symbol',
          'quantity',
          'total_amount',
        ) as fc.Arbitrary<keyof HashableRecord>,
        (baseRecord: HashableRecord, _otherRecord: HashableRecord, field: keyof HashableRecord) => {
          // Ensure the two records actually differ on the chosen field
          // by copying base and forcing one field to differ
          const modified = { ...baseRecord };

          if (field === 'account_id') {
            modified.account_id = baseRecord.account_id + '_x';
          } else if (field === 'transaction_date') {
            // Shift date by one day
            const d = new Date(baseRecord.transaction_date);
            d.setDate(d.getDate() + 1);
            modified.transaction_date = d.toISOString().split('T')[0]!;
          } else if (field === 'transaction_type') {
            modified.transaction_type = baseRecord.transaction_type + '_x';
          } else if (field === 'symbol') {
            modified.symbol = (baseRecord.symbol ?? '') + 'Z';
          } else if (field === 'quantity') {
            modified.quantity = (baseRecord.quantity ?? 0) + 1;
          } else if (field === 'total_amount') {
            modified.total_amount = baseRecord.total_amount + 0.01;
          }

          const hashBase = computeRecordHash(baseRecord);
          const hashModified = computeRecordHash(modified);
          expect(hashBase).not.toBe(hashModified);
        },
      ),
      { numRuns: 200 },
    );
  });
});
