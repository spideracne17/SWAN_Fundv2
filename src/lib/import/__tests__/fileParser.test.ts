import { describe, it, expect } from 'vitest';
import { parseFile } from '../fileParser';

/**
 * Creates a mock File object with a working arrayBuffer() method for jsdom.
 * jsdom doesn't support File.arrayBuffer() or Blob.arrayBuffer(), so we
 * polyfill using TextEncoder.
 */
function csvFile(content: string, name = 'test.csv'): File {
  const encoder = new TextEncoder();
  const buffer = encoder.encode(content).buffer;

  const file = {
    name,
    type: 'text/csv',
    size: content.length,
    lastModified: Date.now(),
    arrayBuffer: () => Promise.resolve(buffer),
  } as unknown as File;

  return file;
}

describe('parseFile', () => {
  describe('Schwab Taxable CSV', () => {
    it('parses headers and rows from a Schwab taxable CSV', async () => {
      const csv = [
        'Action,Date,Description,Symbol,Quantity,Price,Fees & Comm,Amount',
        'Buy,01/15/2024,BOUGHT APPLE INC,AAPL,10,$150.00,$4.95,"$1,504.95"',
        'Sell,02/20/2024,SOLD APPLE INC,AAPL,5,$175.00,$4.95,"$870.05"',
      ].join('\n');

      const result = await parseFile(csvFile(csv));

      expect(result.headers).toEqual([
        'Action',
        'Date',
        'Description',
        'Symbol',
        'Quantity',
        'Price',
        'Fees & Comm',
        'Amount',
      ]);
      expect(result.rows).toHaveLength(2);
      expect(result.rows[0]!['Action']).toBe('Buy');
      expect(result.rows[0]!['Symbol']).toBe('AAPL');
      expect(result.rows[0]!['Fees & Comm']).toBe('$4.95');
      expect(result.rows[1]!['Action']).toBe('Sell');
    });
  });

  describe('Schwab Roth IRA CSV', () => {
    it('parses headers and rows from a Schwab Roth IRA CSV (no Fees & Comm column)', async () => {
      const csv = [
        'Action,Date,Description,Symbol,Quantity,Price,Amount',
        'Reinvest Shares,03/10/2024,REINVESTED DIV,VTI,0.5,$220.00,$110.00',
        'Qual Div,03/10/2024,QUALIFIED DIVIDEND,VTI,,,($55.00)',
      ].join('\n');

      const result = await parseFile(csvFile(csv));

      expect(result.headers).toEqual([
        'Action',
        'Date',
        'Description',
        'Symbol',
        'Quantity',
        'Price',
        'Amount',
      ]);
      expect(result.headers).not.toContain('Fees & Comm');
      expect(result.rows).toHaveLength(2);
      expect(result.rows[0]!['Action']).toBe('Reinvest Shares');
      expect(result.rows[0]!['Symbol']).toBe('VTI');
      expect(result.rows[1]!['Action']).toBe('Qual Div');
      expect(result.rows[1]!['Amount']).toBe('($55.00)');
    });
  });

  describe('Robinhood CSV', () => {
    it('parses headers and rows from a Robinhood Traditional IRA CSV', async () => {
      const csv = [
        'Activity Type,Date,Instrument,Description,Quantity,Price,Amount',
        'BUY,2024-01-20,SPY,Market Buy,15,450.25,6753.75',
        'DIV,2024-02-15,VTI,Dividend,,,12.34',
        'SELL,2024-03-01,SPY,Limit Sell,10,460.00,4600.00',
      ].join('\n');

      const result = await parseFile(csvFile(csv));

      expect(result.headers).toEqual([
        'Activity Type',
        'Date',
        'Instrument',
        'Description',
        'Quantity',
        'Price',
        'Amount',
      ]);
      expect(result.rows).toHaveLength(3);
      expect(result.rows[0]!['Activity Type']).toBe('BUY');
      expect(result.rows[0]!['Instrument']).toBe('SPY');
      expect(result.rows[1]!['Activity Type']).toBe('DIV');
      expect(result.rows[2]!['Quantity']).toBe('10');
    });
  });

  describe('Header extraction', () => {
    it('correctly extracts headers from the first row', async () => {
      const csv = 'ColA,ColB,ColC\nval1,val2,val3\n';
      const result = await parseFile(csvFile(csv));

      expect(result.headers).toEqual(['ColA', 'ColB', 'ColC']);
    });

    it('preserves header casing and special characters', async () => {
      const csv = 'Fees & Comm,Activity Type,Price ($)\n1,BUY,100\n';
      const result = await parseFile(csvFile(csv));

      expect(result.headers).toEqual(['Fees & Comm', 'Activity Type', 'Price ($)']);
    });
  });

  describe('Row data as Record<string, string>', () => {
    it('returns rows keyed by column header with string values', async () => {
      const csv = 'Name,Age,Active\nAlice,30,true\nBob,25,false\n';
      const result = await parseFile(csvFile(csv));

      expect(result.rows).toHaveLength(2);

      const firstRow = result.rows[0]!;
      expect(typeof firstRow['Name']).toBe('string');
      expect(typeof firstRow['Age']).toBe('string');
      expect(typeof firstRow['Active']).toBe('string');
      expect(firstRow['Name']).toBe('Alice');
      expect(firstRow['Age']).toBe('30');
      expect(firstRow['Active']).toBe('true');
    });
  });

  describe('Empty file handling', () => {
    it('returns empty headers and rows for a workbook with no data', async () => {
      // An empty string still gets parsed by SheetJS as a single empty cell.
      // A truly empty workbook (no sheets) would throw. Test the minimal case
      // where there is a ref but no meaningful data.
      const result = await parseFile(csvFile(''));
      // SheetJS sees one cell with empty value, producing a single empty header
      expect(result.headers).toEqual(['']);
      expect(result.rows).toEqual([]);
    });

    it('returns headers but no rows for a file with only a header row', async () => {
      const csv = 'Action,Date,Symbol\n';
      const result = await parseFile(csvFile(csv));

      expect(result.headers).toEqual(['Action', 'Date', 'Symbol']);
      expect(result.rows).toEqual([]);
    });
  });
});
