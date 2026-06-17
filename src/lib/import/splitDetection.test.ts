import { describe, it, expect } from 'vitest';
import { detectStockSplit } from './splitDetection';

describe('detectStockSplit', () => {
  describe('Schwab format', () => {
    it('detects a forward 4-for-1 stock split from description', () => {
      const row: Record<string, string> = {
        Date: '06/10/2024',
        Action: 'Stock Split',
        Symbol: 'NVDA',
        Description: 'FORWARD SPLIT 4 FOR 1',
        Quantity: '30',
        Price: '',
        'Fees & Comm': '',
        Amount: '',
      };

      const result = detectStockSplit(row, 'schwab_taxable');

      expect(result).not.toBeNull();
      expect(result!.symbol).toBe('NVDA');
      expect(result!.split_date).toBe('2024-06-10');
      expect(result!.ratio_from).toBe(1);
      expect(result!.ratio_to).toBe(4);
    });

    it('detects a forward 10-for-1 stock split', () => {
      const row: Record<string, string> = {
        Date: '07/15/2024',
        Action: 'Stock Split',
        Symbol: 'AAPL',
        Description: 'FORWARD SPLIT 10 FOR 1',
        Quantity: '90',
        Price: '',
        'Fees & Comm': '',
        Amount: '',
      };

      const result = detectStockSplit(row, 'schwab_taxable');

      expect(result).not.toBeNull();
      expect(result!.symbol).toBe('AAPL');
      expect(result!.split_date).toBe('2024-07-15');
      expect(result!.ratio_from).toBe(1);
      expect(result!.ratio_to).toBe(10);
    });

    it('detects a reverse 1-for-4 stock split', () => {
      const row: Record<string, string> = {
        Date: '03/01/2024',
        Action: 'Stock Split',
        Symbol: 'GE',
        Description: 'REVERSE SPLIT 1 FOR 4',
        Quantity: '-15',
        Price: '',
        'Fees & Comm': '',
        Amount: '',
      };

      const result = detectStockSplit(row, 'schwab_taxable');

      expect(result).not.toBeNull();
      expect(result!.symbol).toBe('GE');
      expect(result!.split_date).toBe('2024-03-01');
      expect(result!.ratio_from).toBe(4);
      expect(result!.ratio_to).toBe(1);
    });

    it('handles case-insensitive action matching', () => {
      const row: Record<string, string> = {
        Date: '06/10/2024',
        Action: 'stock split',
        Symbol: 'NVDA',
        Description: 'FORWARD SPLIT 4 FOR 1',
        Quantity: '30',
        Price: '',
        'Fees & Comm': '',
        Amount: '',
      };

      const result = detectStockSplit(row, 'schwab_taxable');

      expect(result).not.toBeNull();
      expect(result!.ratio_to).toBe(4);
      expect(result!.ratio_from).toBe(1);
    });

    it('handles lowercase "for" in description', () => {
      const row: Record<string, string> = {
        Date: '06/10/2024',
        Action: 'Stock Split',
        Symbol: 'TSLA',
        Description: 'Forward Split 3 for 1',
        Quantity: '20',
        Price: '',
        'Fees & Comm': '',
        Amount: '',
      };

      const result = detectStockSplit(row, 'schwab_taxable');

      expect(result).not.toBeNull();
      expect(result!.symbol).toBe('TSLA');
      expect(result!.ratio_to).toBe(3);
      expect(result!.ratio_from).toBe(1);
    });

    it('returns null for non-split actions', () => {
      const row: Record<string, string> = {
        Date: '06/10/2024',
        Action: 'Buy',
        Symbol: 'AAPL',
        Description: 'BOUGHT 10 SHARES',
        Quantity: '10',
        Price: '150.00',
        'Fees & Comm': '$0.01',
        Amount: '-$1,500.01',
      };

      const result = detectStockSplit(row, 'schwab_taxable');

      expect(result).toBeNull();
    });

    it('returns null when symbol is missing', () => {
      const row: Record<string, string> = {
        Date: '06/10/2024',
        Action: 'Stock Split',
        Symbol: '',
        Description: 'FORWARD SPLIT 4 FOR 1',
        Quantity: '30',
        Price: '',
        'Fees & Comm': '',
        Amount: '',
      };

      const result = detectStockSplit(row, 'schwab_taxable');

      expect(result).toBeNull();
    });

    it('returns null when date is missing', () => {
      const row: Record<string, string> = {
        Date: '',
        Action: 'Stock Split',
        Symbol: 'NVDA',
        Description: 'FORWARD SPLIT 4 FOR 1',
        Quantity: '30',
        Price: '',
        'Fees & Comm': '',
        Amount: '',
      };

      const result = detectStockSplit(row, 'schwab_taxable');

      expect(result).toBeNull();
    });

    it('returns null when description has no parseable ratio', () => {
      const row: Record<string, string> = {
        Date: '06/10/2024',
        Action: 'Stock Split',
        Symbol: 'NVDA',
        Description: 'STOCK SPLIT ADJUSTMENT',
        Quantity: '30',
        Price: '',
        'Fees & Comm': '',
        Amount: '',
      };

      const result = detectStockSplit(row, 'schwab_taxable');

      expect(result).toBeNull();
    });

    it('works with schwab_roth_ira format', () => {
      const row: Record<string, string> = {
        Date: '06/10/2024',
        Action: 'Stock Split',
        Symbol: 'NVDA',
        Description: 'FORWARD SPLIT 4 FOR 1',
        Quantity: '12',
        Price: '',
        Amount: '',
      };

      const result = detectStockSplit(row, 'schwab_roth_ira');

      expect(result).not.toBeNull();
      expect(result!.symbol).toBe('NVDA');
      expect(result!.ratio_from).toBe(1);
      expect(result!.ratio_to).toBe(4);
    });

    it('handles "as of" date pattern', () => {
      const row: Record<string, string> = {
        Date: '06/10/2024 as of 06/09/2024',
        Action: 'Stock Split',
        Symbol: 'NVDA',
        Description: 'FORWARD SPLIT 4 FOR 1',
        Quantity: '30',
        Price: '',
        'Fees & Comm': '',
        Amount: '',
      };

      const result = detectStockSplit(row, 'schwab_taxable');

      expect(result).not.toBeNull();
      expect(result!.split_date).toBe('2024-06-10');
    });
  });

  describe('Robinhood format', () => {
    it('returns null for Robinhood format (not supported)', () => {
      const row: Record<string, string> = {
        Date: '2024-06-10',
        'Activity Type': 'SPLIT',
        Instrument: 'NVDA',
        Description: '4 for 1 split',
        Quantity: '30',
        Price: '',
        Fees: '',
        Amount: '',
      };

      const result = detectStockSplit(row, 'robinhood_trad_ira');

      expect(result).toBeNull();
    });
  });
});
