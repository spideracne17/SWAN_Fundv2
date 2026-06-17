import { describe, it, expect } from 'vitest';
import {
  normalizeDate,
  DateNormalizationError,
  parseAmount,
  AmountParseError,
  mapActionToType,
  UnknownActionError,
  normalizeRecords,
} from '../normalization';


describe('normalizeDate', () => {
  describe('MM/DD/YYYY format (Schwab)', () => {
    it('converts MM/DD/YYYY to YYYY-MM-DD', () => {
      expect(normalizeDate('01/15/2024')).toBe('2024-01-15');
      expect(normalizeDate('12/31/2023')).toBe('2023-12-31');
      expect(normalizeDate('06/01/2020')).toBe('2020-06-01');
    });

    it('handles the format parameter', () => {
      expect(normalizeDate('01/15/2024', 'schwab_taxable')).toBe('2024-01-15');
      expect(normalizeDate('01/15/2024', 'schwab_roth_ira')).toBe(
        '2024-01-15',
      );
    });
  });

  describe('"as of" pattern (Schwab)', () => {
    it('extracts the first date (transaction date)', () => {
      expect(normalizeDate('01/15/2024 as of 01/14/2024')).toBe('2024-01-15');
    });

    it('handles case-insensitive "as of"', () => {
      expect(normalizeDate('03/20/2024 AS OF 03/19/2024')).toBe('2024-03-20');
      expect(normalizeDate('03/20/2024 As Of 03/19/2024')).toBe('2024-03-20');
    });

    it('handles extra whitespace around "as of"', () => {
      expect(normalizeDate('01/15/2024  as  of  01/14/2024')).toBe(
        '2024-01-15',
      );
    });
  });

  describe('YYYY-MM-DD format (Robinhood)', () => {
    it('passes through valid ISO dates unchanged', () => {
      expect(normalizeDate('2024-01-15')).toBe('2024-01-15');
      expect(normalizeDate('2023-12-31')).toBe('2023-12-31');
    });

    it('handles the robinhood format parameter', () => {
      expect(normalizeDate('2024-01-15', 'robinhood_trad_ira')).toBe(
        '2024-01-15',
      );
    });
  });

  describe('error cases', () => {
    it('throws for empty string', () => {
      expect(() => normalizeDate('')).toThrow(DateNormalizationError);
    });

    it('throws for whitespace-only string', () => {
      expect(() => normalizeDate('   ')).toThrow(DateNormalizationError);
    });

    it('throws for invalid format', () => {
      expect(() => normalizeDate('January 15, 2024')).toThrow(
        DateNormalizationError,
      );
      expect(() => normalizeDate('15-01-2024')).toThrow(
        DateNormalizationError,
      );
    });

    it('throws for invalid month', () => {
      expect(() => normalizeDate('13/01/2024')).toThrow(
        DateNormalizationError,
      );
      expect(() => normalizeDate('00/01/2024')).toThrow(
        DateNormalizationError,
      );
    });

    it('throws for invalid day', () => {
      expect(() => normalizeDate('02/30/2024')).toThrow(
        DateNormalizationError,
      );
      expect(() => normalizeDate('01/32/2024')).toThrow(
        DateNormalizationError,
      );
    });

    it('throws for invalid ISO date components', () => {
      expect(() => normalizeDate('2024-13-01')).toThrow(
        DateNormalizationError,
      );
      expect(() => normalizeDate('2024-02-30')).toThrow(
        DateNormalizationError,
      );
    });

    it('includes raw value in error', () => {
      try {
        normalizeDate('bad-date');
      } catch (e) {
        expect(e).toBeInstanceOf(DateNormalizationError);
        expect((e as DateNormalizationError).rawValue).toBe('bad-date');
      }
    });
  });

  describe('whitespace handling', () => {
    it('trims leading and trailing whitespace', () => {
      expect(normalizeDate('  01/15/2024  ')).toBe('2024-01-15');
      expect(normalizeDate('  2024-01-15  ')).toBe('2024-01-15');
    });
  });
});

describe('parseAmount', () => {
  describe('basic numeric values', () => {
    it('parses plain integers', () => {
      expect(parseAmount('1234')).toBe(1234);
      expect(parseAmount('0')).toBe(0);
    });

    it('parses plain decimals', () => {
      expect(parseAmount('1234.56')).toBe(1234.56);
      expect(parseAmount('0.99')).toBe(0.99);
    });
  });

  describe('dollar signs and commas', () => {
    it('strips dollar sign', () => {
      expect(parseAmount('$1234.56')).toBe(1234.56);
    });

    it('strips commas', () => {
      expect(parseAmount('1,234.56')).toBe(1234.56);
      expect(parseAmount('1,234,567.89')).toBe(1234567.89);
    });

    it('strips dollar sign and commas together', () => {
      expect(parseAmount('$1,234.56')).toBe(1234.56);
      expect(parseAmount('$10,000.00')).toBe(10000);
    });
  });

  describe('parenthesized negatives', () => {
    it('parses parenthesized values as negative', () => {
      expect(parseAmount('(1234.56)')).toBe(-1234.56);
      expect(parseAmount('(500.00)')).toBe(-500);
    });

    it('handles parenthesized with dollar sign and commas', () => {
      expect(parseAmount('($1,234.56)')).toBe(-1234.56);
      expect(parseAmount('($500.00)')).toBe(-500);
    });
  });

  describe('explicit negative sign', () => {
    it('handles negative sign prefix', () => {
      expect(parseAmount('-123.45')).toBe(-123.45);
      expect(parseAmount('-$1,234.56')).toBe(-1234.56);
    });

    it('handles negative sign with dollar amount', () => {
      expect(parseAmount('-$500.00')).toBe(-500);
    });
  });

  describe('empty and whitespace', () => {
    it('returns 0 for empty string', () => {
      expect(parseAmount('')).toBe(0);
    });

    it('returns 0 for whitespace-only string', () => {
      expect(parseAmount('   ')).toBe(0);
      expect(parseAmount('\t')).toBe(0);
    });
  });

  describe('whitespace trimming', () => {
    it('trims leading and trailing whitespace', () => {
      expect(parseAmount('  $1,234.56  ')).toBe(1234.56);
      expect(parseAmount('  (500.00)  ')).toBe(-500);
    });
  });

  describe('error cases', () => {
    it('throws AmountParseError for non-numeric strings', () => {
      expect(() => parseAmount('abc')).toThrow(AmountParseError);
      expect(() => parseAmount('$abc')).toThrow(AmountParseError);
    });

    it('throws AmountParseError for currency symbol only', () => {
      expect(() => parseAmount('$')).toThrow(AmountParseError);
    });

    it('includes raw value in error', () => {
      try {
        parseAmount('not-a-number');
      } catch (e) {
        expect(e).toBeInstanceOf(AmountParseError);
        expect((e as AmountParseError).rawValue).toBe('not-a-number');
      }
    });
  });
});


describe('mapActionToType', () => {
  describe('Schwab actions (schwab_taxable)', () => {
    it('maps Buy to buy', () => {
      expect(mapActionToType('Buy', 'schwab_taxable')).toBe('buy');
    });

    it('maps Sell to sell', () => {
      expect(mapActionToType('Sell', 'schwab_taxable')).toBe('sell');
    });

    it('maps Qual Div to dividend', () => {
      expect(mapActionToType('Qual Div', 'schwab_taxable')).toBe('dividend');
    });

    it('maps Non-Qual Div to dividend', () => {
      expect(mapActionToType('Non-Qual Div', 'schwab_taxable')).toBe('dividend');
    });

    it('maps Reinvest Shares to reinvestment', () => {
      expect(mapActionToType('Reinvest Shares', 'schwab_taxable')).toBe('reinvestment');
    });

    it('maps Stock Split to split', () => {
      expect(mapActionToType('Stock Split', 'schwab_taxable')).toBe('split');
    });

    it('maps Journal to transfer', () => {
      expect(mapActionToType('Journal', 'schwab_taxable')).toBe('transfer');
    });

    it('maps Bank Interest to interest', () => {
      expect(mapActionToType('Bank Interest', 'schwab_taxable')).toBe('interest');
    });

    it('maps Misc Cash Entry to other', () => {
      expect(mapActionToType('Misc Cash Entry', 'schwab_taxable')).toBe('other');
    });
  });

  describe('Schwab actions (schwab_roth_ira)', () => {
    it('maps Buy to buy for Roth IRA format', () => {
      expect(mapActionToType('Buy', 'schwab_roth_ira')).toBe('buy');
    });

    it('maps Sell to sell for Roth IRA format', () => {
      expect(mapActionToType('Sell', 'schwab_roth_ira')).toBe('sell');
    });

    it('maps Qual Div to dividend for Roth IRA format', () => {
      expect(mapActionToType('Qual Div', 'schwab_roth_ira')).toBe('dividend');
    });
  });

  describe('Robinhood actions (robinhood_trad_ira)', () => {
    it('maps BUY to buy', () => {
      expect(mapActionToType('BUY', 'robinhood_trad_ira')).toBe('buy');
    });

    it('maps SELL to sell', () => {
      expect(mapActionToType('SELL', 'robinhood_trad_ira')).toBe('sell');
    });

    it('maps DIV to dividend', () => {
      expect(mapActionToType('DIV', 'robinhood_trad_ira')).toBe('dividend');
    });

    it('maps CDIV to dividend', () => {
      expect(mapActionToType('CDIV', 'robinhood_trad_ira')).toBe('dividend');
    });

    it('maps ACH to transfer', () => {
      expect(mapActionToType('ACH', 'robinhood_trad_ira')).toBe('transfer');
    });

    it('maps INTEREST to interest', () => {
      expect(mapActionToType('INTEREST', 'robinhood_trad_ira')).toBe('interest');
    });
  });

  describe('case insensitivity', () => {
    it('maps "BUY" (uppercase) correctly', () => {
      expect(mapActionToType('BUY', 'schwab_taxable')).toBe('buy');
    });

    it('maps "buy" (lowercase) correctly', () => {
      expect(mapActionToType('buy', 'schwab_taxable')).toBe('buy');
    });

    it('maps "Buy" (mixed case) correctly', () => {
      expect(mapActionToType('Buy', 'schwab_taxable')).toBe('buy');
    });

    it('maps "QUAL DIV" (uppercase) correctly for Schwab', () => {
      expect(mapActionToType('QUAL DIV', 'schwab_taxable')).toBe('dividend');
    });

    it('maps "div" (lowercase) correctly for Robinhood', () => {
      expect(mapActionToType('div', 'robinhood_trad_ira')).toBe('dividend');
    });
  });

  describe('unknown action error', () => {
    it('throws UnknownActionError for unrecognized action', () => {
      expect(() => mapActionToType('UNKNOWN_ACTION', 'schwab_taxable')).toThrow(
        UnknownActionError,
      );
    });

    it('throws UnknownActionError for unrecognized Robinhood action', () => {
      expect(() => mapActionToType('UNKNOWN_ACTION', 'robinhood_trad_ira')).toThrow(
        UnknownActionError,
      );
    });

    it('includes raw action in error', () => {
      try {
        mapActionToType('UNKNOWN_ACTION', 'schwab_taxable');
      } catch (e) {
        expect(e).toBeInstanceOf(UnknownActionError);
        expect((e as UnknownActionError).rawAction).toBe('UNKNOWN_ACTION');
      }
    });

    it('includes format in error', () => {
      try {
        mapActionToType('UNKNOWN_ACTION', 'schwab_taxable');
      } catch (e) {
        expect(e).toBeInstanceOf(UnknownActionError);
        expect((e as UnknownActionError).format).toBe('schwab_taxable');
      }
    });

    it('error message includes raw action and format', () => {
      try {
        mapActionToType('BadAction', 'robinhood_trad_ira');
      } catch (e) {
        expect(e).toBeInstanceOf(UnknownActionError);
        const err = e as UnknownActionError;
        expect(err.message).toContain('BadAction');
        expect(err.message).toContain('robinhood_trad_ira');
      }
    });
  });
});


describe('normalizeRecords', () => {
  const accountId = 'acct_123';

  describe('Schwab taxable format', () => {
    it('normalizes a basic buy row', () => {
      const rows = [
        {
          Date: '01/15/2024',
          Action: 'Buy',
          Symbol: 'AAPL',
          Description: 'APPLE INC',
          Quantity: '10',
          Price: '$150.00',
          'Fees & Comm': '$0.65',
          Amount: '-$1,500.65',
        },
      ];

      const result = normalizeRecords(rows, 'schwab_taxable', accountId);

      expect(result).toHaveLength(1);
      expect(result[0]!.transaction_date).toBe('2024-01-15');
      expect(result[0]!.transaction_type).toBe('buy');
      expect(result[0]!.symbol).toBe('AAPL');
      expect(result[0]!.description).toBe('APPLE INC');
      expect(result[0]!.quantity).toBe(10);
      expect(result[0]!.price_per_unit).toBe(150);
      expect(result[0]!.fees).toBe(0.65);
      expect(result[0]!.total_amount).toBe(-1500.65);
      expect(result[0]!.source_format).toBe('schwab_taxable');
      expect(result[0]!.raw_action).toBe('Buy');
      expect(result[0]!.account_id).toBe(accountId);
    });

    it('handles "as of" date patterns', () => {
      const rows = [
        {
          Date: '01/15/2024 as of 01/14/2024',
          Action: 'Qual Div',
          Symbol: 'VTI',
          Description: 'QUALIFIED DIVIDEND',
          Quantity: '',
          Price: '',
          'Fees & Comm': '',
          Amount: '$50.00',
        },
      ];

      const result = normalizeRecords(rows, 'schwab_taxable', accountId);

      expect(result).toHaveLength(1);
      expect(result[0]!.transaction_date).toBe('2024-01-15');
      expect(result[0]!.transaction_type).toBe('dividend');
      expect(result[0]!.quantity).toBeUndefined();
      expect(result[0]!.price_per_unit).toBeUndefined();
      expect(result[0]!.fees).toBeUndefined();
    });
  });

  describe('Robinhood format', () => {
    it('normalizes a Robinhood buy row', () => {
      const rows = [
        {
          Date: '2024-01-15',
          'Activity Type': 'BUY',
          Instrument: 'AAPL',
          Description: 'Apple Inc - Buy',
          Quantity: '5',
          Price: '150.00',
          Fees: '',
          Amount: '-750.00',
        },
      ];

      const result = normalizeRecords(rows, 'robinhood_trad_ira', accountId);

      expect(result).toHaveLength(1);
      expect(result[0]!.transaction_date).toBe('2024-01-15');
      expect(result[0]!.transaction_type).toBe('buy');
      expect(result[0]!.symbol).toBe('AAPL');
      expect(result[0]!.quantity).toBe(5);
      expect(result[0]!.price_per_unit).toBe(150);
      expect(result[0]!.fees).toBeUndefined();
      expect(result[0]!.total_amount).toBe(-750);
      expect(result[0]!.source_format).toBe('robinhood_trad_ira');
      expect(result[0]!.raw_action).toBe('BUY');
    });
  });

  describe('row skipping', () => {
    it('skips rows with empty date', () => {
      const rows = [
        { Date: '', Action: 'Buy', Symbol: 'AAPL', Description: '', Quantity: '10', Price: '$150', 'Fees & Comm': '', Amount: '-$1500' },
        { Date: '01/15/2024', Action: 'Buy', Symbol: 'AAPL', Description: '', Quantity: '10', Price: '$150', 'Fees & Comm': '', Amount: '-$1500' },
      ];

      const result = normalizeRecords(rows, 'schwab_taxable', accountId);
      expect(result).toHaveLength(1);
    });

    it('skips rows with empty action', () => {
      const rows = [
        { Date: '01/15/2024', Action: '', Symbol: 'AAPL', Description: '', Quantity: '10', Price: '$150', 'Fees & Comm': '', Amount: '-$1500' },
        { Date: '01/15/2024', Action: 'Buy', Symbol: 'AAPL', Description: '', Quantity: '10', Price: '$150', 'Fees & Comm': '', Amount: '-$1500' },
      ];

      const result = normalizeRecords(rows, 'schwab_taxable', accountId);
      expect(result).toHaveLength(1);
    });
  });

  describe('hash generation', () => {
    it('generates a placeholder hash from canonical fields', () => {
      const rows = [
        {
          Date: '01/15/2024',
          Action: 'Buy',
          Symbol: 'AAPL',
          Description: 'APPLE INC',
          Quantity: '10',
          Price: '$150.00',
          'Fees & Comm': '$0.65',
          Amount: '-$1,500.65',
        },
      ];

      const result = normalizeRecords(rows, 'schwab_taxable', accountId);
      // hash = accountId|date|type|symbol|qty|amount
      expect(result[0]!.hash).toBe('acct_123|2024-01-15|buy|AAPL|10|-1500.65');
    });

    it('handles records with no symbol in hash', () => {
      const rows = [
        {
          Date: '01/15/2024',
          Action: 'Bank Interest',
          Symbol: '',
          Description: 'BANK INT',
          Quantity: '',
          Price: '',
          'Fees & Comm': '',
          Amount: '$5.00',
        },
      ];

      const result = normalizeRecords(rows, 'schwab_taxable', accountId);
      expect(result[0]!.hash).toBe('acct_123|2024-01-15|interest|||5');
    });
  });

  describe('multiple rows', () => {
    it('normalizes multiple rows into NormalizedRecord array', () => {
      const rows = [
        { Date: '01/15/2024', Action: 'Buy', Symbol: 'AAPL', Description: 'BUY', Quantity: '10', Price: '$150', 'Fees & Comm': '', Amount: '-$1500' },
        { Date: '01/16/2024', Action: 'Sell', Symbol: 'AAPL', Description: 'SELL', Quantity: '5', Price: '$155', 'Fees & Comm': '$0.01', Amount: '$775' },
      ];

      const result = normalizeRecords(rows, 'schwab_taxable', accountId);

      expect(result).toHaveLength(2);
      expect(result[0]!.transaction_type).toBe('buy');
      expect(result[1]!.transaction_type).toBe('sell');
      expect(result[1]!.fees).toBe(0.01);
    });
  });
});
