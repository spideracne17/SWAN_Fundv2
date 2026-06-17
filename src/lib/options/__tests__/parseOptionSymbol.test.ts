import { describe, it, expect } from 'vitest';
import { parseOptionSymbol, OptionParseError } from '../parseOptionSymbol';

describe('parseOptionSymbol', () => {
  describe('Schwab format', () => {
    it('parses "SPX 01/19/2024 4800.00 P" correctly', () => {
      const result = parseOptionSymbol('SPX 01/19/2024 4800.00 P', 'schwab');
      expect(result).toEqual({
        underlying: 'SPX',
        expiration: '2024-01-19',
        strike: 4800,
        type: 'put',
      });
    });

    it('parses a call option', () => {
      const result = parseOptionSymbol('AAPL 03/15/2024 175.00 C', 'schwab');
      expect(result).toEqual({
        underlying: 'AAPL',
        expiration: '2024-03-15',
        strike: 175,
        type: 'call',
      });
    });

    it('parses fractional strike price', () => {
      const result = parseOptionSymbol('TSLA 06/21/2024 250.50 P', 'schwab');
      expect(result).toEqual({
        underlying: 'TSLA',
        expiration: '2024-06-21',
        strike: 250.5,
        type: 'put',
      });
    });

    // Task 9.3: Various underlying lengths
    describe('various underlying lengths', () => {
      it('parses 1-char underlying (X)', () => {
        const result = parseOptionSymbol('X 03/15/2024 25.00 C', 'schwab');
        expect(result).toEqual({
          underlying: 'X',
          expiration: '2024-03-15',
          strike: 25,
          type: 'call',
        });
      });

      it('parses 2-char underlying (GE)', () => {
        const result = parseOptionSymbol('GE 06/21/2024 50.00 P', 'schwab');
        expect(result).toEqual({
          underlying: 'GE',
          expiration: '2024-06-21',
          strike: 50,
          type: 'put',
        });
      });

      it('parses 3-char underlying (SPX)', () => {
        const result = parseOptionSymbol('SPX 12/20/2024 4500.00 C', 'schwab');
        expect(result).toEqual({
          underlying: 'SPX',
          expiration: '2024-12-20',
          strike: 4500,
          type: 'call',
        });
      });

      it('parses 4-char underlying (AAPL)', () => {
        const result = parseOptionSymbol('AAPL 09/20/2024 200.00 P', 'schwab');
        expect(result).toEqual({
          underlying: 'AAPL',
          expiration: '2024-09-20',
          strike: 200,
          type: 'put',
        });
      });

      it('parses 5-char underlying (GOOGL)', () => {
        const result = parseOptionSymbol('GOOGL 03/15/2024 150.00 C', 'schwab');
        expect(result).toEqual({
          underlying: 'GOOGL',
          expiration: '2024-03-15',
          strike: 150,
          type: 'call',
        });
      });
    });

    // Task 9.3: Various dates across months and years
    describe('various dates', () => {
      it('parses January expiration', () => {
        const result = parseOptionSymbol('AAPL 01/19/2024 175.00 C', 'schwab');
        expect(result.expiration).toBe('2024-01-19');
      });

      it('parses June expiration', () => {
        const result = parseOptionSymbol('AAPL 06/21/2024 175.00 C', 'schwab');
        expect(result.expiration).toBe('2024-06-21');
      });

      it('parses December expiration', () => {
        const result = parseOptionSymbol('AAPL 12/20/2024 175.00 C', 'schwab');
        expect(result.expiration).toBe('2024-12-20');
      });

      it('parses 2025 expiration year', () => {
        const result = parseOptionSymbol('AAPL 03/21/2025 200.00 P', 'schwab');
        expect(result.expiration).toBe('2025-03-21');
      });

      it('parses 2026 expiration year (LEAPS)', () => {
        const result = parseOptionSymbol('SPX 01/16/2026 5000.00 C', 'schwab');
        expect(result.expiration).toBe('2026-01-16');
      });
    });

    // Task 9.3: Various strike prices
    describe('various strike prices', () => {
      it('parses whole number strike (100)', () => {
        const result = parseOptionSymbol('AAPL 03/15/2024 100 C', 'schwab');
        expect(result.strike).toBe(100);
      });

      it('parses decimal strike (175.50)', () => {
        const result = parseOptionSymbol('AAPL 03/15/2024 175.50 C', 'schwab');
        expect(result.strike).toBe(175.5);
      });

      it('parses large strike (4800.00)', () => {
        const result = parseOptionSymbol('SPX 01/19/2024 4800.00 P', 'schwab');
        expect(result.strike).toBe(4800);
      });

      it('parses small strike (5.50)', () => {
        const result = parseOptionSymbol('F 03/15/2024 5.50 C', 'schwab');
        expect(result.strike).toBe(5.5);
      });
    });

    // Task 9.3: Call and Put types including lowercase
    describe('option types', () => {
      it('parses uppercase C as call', () => {
        const result = parseOptionSymbol('AAPL 03/15/2024 175.00 C', 'schwab');
        expect(result.type).toBe('call');
      });

      it('parses uppercase P as put', () => {
        const result = parseOptionSymbol('AAPL 03/15/2024 175.00 P', 'schwab');
        expect(result.type).toBe('put');
      });

      it('parses lowercase c as call', () => {
        const result = parseOptionSymbol('AAPL 03/15/2024 175.00 c', 'schwab');
        expect(result.type).toBe('call');
      });

      it('parses lowercase p as put', () => {
        const result = parseOptionSymbol('AAPL 03/15/2024 175.00 p', 'schwab');
        expect(result.type).toBe('put');
      });
    });
  });

  describe('Robinhood OCC format', () => {
    it('parses "SPX240119P04800000" correctly', () => {
      const result = parseOptionSymbol('SPX240119P04800000', 'robinhood');
      expect(result).toEqual({
        underlying: 'SPX',
        expiration: '2024-01-19',
        strike: 4800,
        type: 'put',
      });
    });

    it('parses a call option', () => {
      const result = parseOptionSymbol('AAPL240315C00175000', 'robinhood');
      expect(result).toEqual({
        underlying: 'AAPL',
        expiration: '2024-03-15',
        strike: 175,
        type: 'call',
      });
    });

    it('parses fractional strike (OCC encodes as integer * 1000)', () => {
      const result = parseOptionSymbol('TSLA240621P00250500', 'robinhood');
      expect(result).toEqual({
        underlying: 'TSLA',
        expiration: '2024-06-21',
        strike: 250.5,
        type: 'put',
      });
    });

    it('handles 1-char underlying', () => {
      const result = parseOptionSymbol('X240315C00025000', 'robinhood');
      expect(result).toEqual({
        underlying: 'X',
        expiration: '2024-03-15',
        strike: 25,
        type: 'call',
      });
    });

    // Task 9.4: Various underlying lengths (1-6 chars)
    describe('various underlying lengths', () => {
      it('parses 1-char underlying: X240315C00025000', () => {
        const result = parseOptionSymbol('X240315C00025000', 'robinhood');
        expect(result).toEqual({
          underlying: 'X',
          expiration: '2024-03-15',
          strike: 25,
          type: 'call',
        });
      });

      it('parses 2-char underlying: GE240621P00050000', () => {
        const result = parseOptionSymbol('GE240621P00050000', 'robinhood');
        expect(result).toEqual({
          underlying: 'GE',
          expiration: '2024-06-21',
          strike: 50,
          type: 'put',
        });
      });

      it('parses 3-char underlying: SPX240119P04800000', () => {
        const result = parseOptionSymbol('SPX240119P04800000', 'robinhood');
        expect(result).toEqual({
          underlying: 'SPX',
          expiration: '2024-01-19',
          strike: 4800,
          type: 'put',
        });
      });

      it('parses 4-char underlying: AAPL240315C00175000', () => {
        const result = parseOptionSymbol('AAPL240315C00175000', 'robinhood');
        expect(result).toEqual({
          underlying: 'AAPL',
          expiration: '2024-03-15',
          strike: 175,
          type: 'call',
        });
      });

      it('parses 5-char underlying: GOOGL240315C00150000', () => {
        const result = parseOptionSymbol('GOOGL240315C00150000', 'robinhood');
        expect(result).toEqual({
          underlying: 'GOOGL',
          expiration: '2024-03-15',
          strike: 150,
          type: 'call',
        });
      });

      it('parses 6-char underlying: NFLXXX240315C00100000', () => {
        const result = parseOptionSymbol('NFLXXX240315C00100000', 'robinhood');
        expect(result).toEqual({
          underlying: 'NFLXXX',
          expiration: '2024-03-15',
          strike: 100,
          type: 'call',
        });
      });
    });

    // Task 9.4: Fractional strikes
    describe('fractional strikes', () => {
      it('parses TSLA240621P00250500 → strike 250.5', () => {
        const result = parseOptionSymbol('TSLA240621P00250500', 'robinhood');
        expect(result.strike).toBe(250.5);
      });

      it('parses F240315C00005500 → strike 5.5', () => {
        const result = parseOptionSymbol('F240315C00005500', 'robinhood');
        expect(result).toEqual({
          underlying: 'F',
          expiration: '2024-03-15',
          strike: 5.5,
          type: 'call',
        });
      });

      it('parses strike with three decimal places (0.125 encoded as 00000125)', () => {
        const result = parseOptionSymbol('X240315C00000125', 'robinhood');
        expect(result.strike).toBe(0.125);
      });
    });

    // Task 9.4: Edge cases
    describe('edge cases', () => {
      it('parses very large strikes correctly', () => {
        const result = parseOptionSymbol('SPX240119C05500000', 'robinhood');
        expect(result.strike).toBe(5500);
      });

      it('parses zero-heavy strike encoding', () => {
        const result = parseOptionSymbol('F240315P00001000', 'robinhood');
        expect(result.strike).toBe(1);
      });

      it('rejects symbols with more than 6 chars in underlying', () => {
        expect(() =>
          parseOptionSymbol('ABCDEFG240315C00100000', 'robinhood')
        ).toThrow(OptionParseError);
      });

      it('rejects lowercase underlying letters', () => {
        expect(() =>
          parseOptionSymbol('aapl240315C00175000', 'robinhood')
        ).toThrow(OptionParseError);
      });
    });
  });

  describe('auto-detection', () => {
    it('auto-detects Schwab format (contains spaces)', () => {
      const result = parseOptionSymbol('SPX 01/19/2024 4800.00 P');
      expect(result).toEqual({
        underlying: 'SPX',
        expiration: '2024-01-19',
        strike: 4800,
        type: 'put',
      });
    });

    it('auto-detects Robinhood OCC format (no spaces)', () => {
      const result = parseOptionSymbol('SPX240119P04800000');
      expect(result).toEqual({
        underlying: 'SPX',
        expiration: '2024-01-19',
        strike: 4800,
        type: 'put',
      });
    });
  });

  describe('error handling', () => {
    it('throws OptionParseError for invalid Schwab format', () => {
      expect(() => parseOptionSymbol('INVALID FORMAT', 'schwab')).toThrow(
        OptionParseError
      );
    });

    it('throws OptionParseError for invalid Robinhood format', () => {
      expect(() => parseOptionSymbol('NOTVALID', 'robinhood')).toThrow(
        OptionParseError
      );
    });

    it('throws OptionParseError for empty string', () => {
      expect(() => parseOptionSymbol('')).toThrow(OptionParseError);
    });

    it('OptionParseError includes the raw value', () => {
      try {
        parseOptionSymbol('GARBAGE123', 'robinhood');
      } catch (e) {
        expect(e).toBeInstanceOf(OptionParseError);
        expect((e as OptionParseError).rawValue).toBe('GARBAGE123');
      }
    });

    it('throws OptionParseError for whitespace-only input', () => {
      expect(() => parseOptionSymbol('   ')).toThrow(OptionParseError);
    });
  });
});
