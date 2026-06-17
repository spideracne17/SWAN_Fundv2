import { describe, it, expect } from 'vitest';
import {
  detectBrokerFormat,
  FormatDetectionError,
} from '../formatDetection';

describe('detectBrokerFormat', () => {
  describe('Schwab Taxable format', () => {
    it('returns schwab_taxable when headers contain Action, Symbol, and Fees & Comm', () => {
      const headers = ['Date', 'Action', 'Symbol', 'Description', 'Quantity', 'Price', 'Fees & Comm', 'Amount'];
      expect(detectBrokerFormat(headers)).toBe('schwab_taxable');
    });

    it('detects schwab_taxable with minimal required headers', () => {
      const headers = ['Action', 'Symbol', 'Fees & Comm'];
      expect(detectBrokerFormat(headers)).toBe('schwab_taxable');
    });
  });

  describe('Schwab Roth IRA format', () => {
    it('returns schwab_roth_ira when headers contain Action and Symbol but no Fees & Comm', () => {
      const headers = ['Date', 'Action', 'Symbol', 'Description', 'Quantity', 'Price', 'Amount'];
      expect(detectBrokerFormat(headers)).toBe('schwab_roth_ira');
    });

    it('detects schwab_roth_ira with minimal required headers', () => {
      const headers = ['Action', 'Symbol'];
      expect(detectBrokerFormat(headers)).toBe('schwab_roth_ira');
    });
  });

  describe('Robinhood Traditional IRA format', () => {
    it('returns robinhood_trad_ira when headers contain Activity Type and Instrument', () => {
      const headers = ['Activity Date', 'Process Date', 'Settle Date', 'Instrument', 'Description', 'Trans Code', 'Activity Type', 'Quantity', 'Price', 'Amount'];
      expect(detectBrokerFormat(headers)).toBe('robinhood_trad_ira');
    });

    it('detects robinhood_trad_ira with minimal required headers', () => {
      const headers = ['Activity Type', 'Instrument'];
      expect(detectBrokerFormat(headers)).toBe('robinhood_trad_ira');
    });
  });

  describe('Unrecognized headers', () => {
    it('throws FormatDetectionError for random headers', () => {
      const headers = ['Foo', 'Bar', 'Baz'];
      expect(() => detectBrokerFormat(headers)).toThrow(FormatDetectionError);
    });

    it('includes the detected headers in the error message', () => {
      const headers = ['Column1', 'Column2'];
      expect(() => detectBrokerFormat(headers)).toThrow(
        'Unable to detect CSV format from headers: [Column1, Column2]',
      );
    });

    it('stores detected headers on the error instance', () => {
      const headers = ['X', 'Y', 'Z'];
      try {
        detectBrokerFormat(headers);
        expect.fail('Expected FormatDetectionError to be thrown');
      } catch (err) {
        expect(err).toBeInstanceOf(FormatDetectionError);
        expect((err as FormatDetectionError).detectedHeaders).toEqual(['X', 'Y', 'Z']);
      }
    });

    it('sets error name to FormatDetectionError', () => {
      const headers = ['Unknown'];
      try {
        detectBrokerFormat(headers);
        expect.fail('Expected error');
      } catch (err) {
        expect((err as FormatDetectionError).name).toBe('FormatDetectionError');
      }
    });
  });

  describe('Edge cases', () => {
    it('handles case insensitivity in headers', () => {
      expect(detectBrokerFormat(['ACTION', 'SYMBOL', 'FEES & COMM'])).toBe('schwab_taxable');
      expect(detectBrokerFormat(['action', 'symbol'])).toBe('schwab_roth_ira');
      expect(detectBrokerFormat(['ACTIVITY TYPE', 'INSTRUMENT'])).toBe('robinhood_trad_ira');
    });

    it('handles mixed case in headers', () => {
      expect(detectBrokerFormat(['Action', 'SYMBOL', 'fees & comm'])).toBe('schwab_taxable');
      expect(detectBrokerFormat(['Activity Type', 'instrument'])).toBe('robinhood_trad_ira');
    });

    it('handles extra whitespace in headers', () => {
      expect(detectBrokerFormat(['  Action  ', ' Symbol ', ' Fees & Comm '])).toBe('schwab_taxable');
      expect(detectBrokerFormat([' Action', 'Symbol '])).toBe('schwab_roth_ira');
      expect(detectBrokerFormat(['  Activity Type  ', '  Instrument  '])).toBe('robinhood_trad_ira');
    });

    it('throws FormatDetectionError for empty header array', () => {
      expect(() => detectBrokerFormat([])).toThrow(FormatDetectionError);
    });
  });
});
