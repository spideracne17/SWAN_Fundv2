import { describe, it, expect } from 'vitest';
import { getHoldingPeriod } from '../holdingPeriod';

describe('getHoldingPeriod', () => {
  describe('boundary: 365 days = short_term, 366 days = long_term', () => {
    it('returns short_term for exactly 365 days (2023-01-15 to 2024-01-15)', () => {
      const result = getHoldingPeriod('2023-01-15', '2024-01-15');
      expect(result).toBe('short_term');
    });

    it('returns long_term for exactly 366 days (2023-01-15 to 2024-01-16)', () => {
      const result = getHoldingPeriod('2023-01-15', '2024-01-16');
      expect(result).toBe('long_term');
    });
  });

  describe('additional holding period cases', () => {
    it('returns short_term for 1 day', () => {
      const result = getHoldingPeriod('2023-06-01', '2023-06-02');
      expect(result).toBe('short_term');
    });

    it('returns short_term for 364 days', () => {
      const result = getHoldingPeriod('2023-01-15', '2024-01-14');
      expect(result).toBe('short_term');
    });

    it('returns long_term for 730 days', () => {
      const result = getHoldingPeriod('2022-01-15', '2024-01-15');
      expect(result).toBe('long_term');
    });
  });
});
