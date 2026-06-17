import { describe, it, expect, vi, beforeEach } from 'vitest';
import { parseFile } from '../fileParser';
import { detectBrokerFormat } from '../formatDetection';
import { normalizeRecords } from '../normalization';
import { validateAndDeduplicate, computeRecordHash } from '../deduplication';
import { pairDripRecords } from '../dripPairing';
import { importRecords } from '../importRecords';
import { generateBackup } from '../backup';

// ─── Mock PocketBase ─────────────────────────────────────────────────────────

const mockCreate = vi.fn().mockResolvedValue({ id: 'mock-id' });
const mockGetFullList = vi.fn().mockResolvedValue([]);

vi.mock('@/lib/pocketbase', () => ({
  default: {
    collection: () => ({
      create: mockCreate,
      getFullList: mockGetFullList,
      getFirstListItem: vi.fn().mockRejectedValue(new Error('Not found')),
    }),
  },
}));

// ─── Helpers ─────────────────────────────────────────────────────────────────

/**
 * Creates a mock File object with a working arrayBuffer() method for jsdom.
 */
function csvFile(content: string, name = 'schwab_export.csv'): File {
  const encoder = new TextEncoder();
  const buffer = encoder.encode(content).buffer;

  return {
    name,
    type: 'text/csv',
    size: content.length,
    lastModified: Date.now(),
    arrayBuffer: () => Promise.resolve(buffer),
  } as unknown as File;
}

// ─── Test Data ───────────────────────────────────────────────────────────────

/**
 * Simulated Schwab CSV headers (matches real Schwab taxable exports).
 */
const SCHWAB_HEADERS = ['Action', 'Date', 'Description', 'Symbol', 'Quantity', 'Price', 'Fees & Comm', 'Amount'];

/**
 * Pre-parsed rows that represent what parseFile would produce from a Schwab taxable CSV.
 * We construct these directly to avoid SheetJS date formatting differences across environments.
 */
const SCHWAB_ROWS: Record<string, string>[] = [
  { Action: 'Buy', Date: '01/15/2024', Description: 'BOUGHT APPLE INC', Symbol: 'AAPL', Quantity: '10', Price: '$150.00', 'Fees & Comm': '$4.95', Amount: '$1,504.95' },
  { Action: 'Sell', Date: '01/20/2024', Description: 'SOLD APPLE INC', Symbol: 'AAPL', Quantity: '5', Price: '$175.00', 'Fees & Comm': '$4.95', Amount: '$870.05' },
  { Action: 'Qual Div', Date: '02/01/2024', Description: 'QUALIFIED DIVIDEND', Symbol: 'VTI', Quantity: '', Price: '', 'Fees & Comm': '', Amount: '$25.00' },
  { Action: 'Reinvest Shares', Date: '02/01/2024', Description: 'REINVESTED DIV', Symbol: 'VTI', Quantity: '0.5', Price: '$50.00', 'Fees & Comm': '', Amount: '$25.00' },
];

const ACCOUNT_ID = 'acct_schwab_001';

// ─── Integration Test ────────────────────────────────────────────────────────

describe('Import Flow Integration', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // DB returns no existing hashes (all records are new)
    mockGetFullList.mockResolvedValue([]);
    mockCreate.mockResolvedValue({ id: 'mock-id' });

    // jsdom doesn't provide URL.createObjectURL/revokeObjectURL
    if (!URL.createObjectURL) {
      URL.createObjectURL = vi.fn().mockReturnValue('blob:mock-url');
    }
    if (!URL.revokeObjectURL) {
      URL.revokeObjectURL = vi.fn();
    }
  });

  it('parseFile correctly extracts headers from a Schwab CSV', async () => {
    const csv = [
      'Action,Date,Description,Symbol,Quantity,Price,Fees & Comm,Amount',
      'Buy,01/15/2024,BOUGHT APPLE INC,AAPL,10,$150.00,$4.95,"$1,504.95"',
    ].join('\n');

    const { headers, rows } = await parseFile(csvFile(csv));

    expect(headers).toContain('Action');
    expect(headers).toContain('Symbol');
    expect(headers).toContain('Fees & Comm');
    expect(rows).toHaveLength(1);
    expect(rows[0]!['Action']).toBe('Buy');
    expect(rows[0]!['Symbol']).toBe('AAPL');
  });

  it('runs the full pipeline: detect → normalize → deduplicate → pair → import → backup', async () => {
    // ── Step 1: Detect broker format from headers ──
    const format = detectBrokerFormat(SCHWAB_HEADERS);
    expect(format).toBe('schwab_taxable');

    // ── Step 2: Normalize records ──
    const normalized = normalizeRecords(SCHWAB_ROWS, format, ACCOUNT_ID);

    expect(normalized).toHaveLength(4);
    expect(normalized[0]!.transaction_type).toBe('buy');
    expect(normalized[0]!.symbol).toBe('AAPL');
    expect(normalized[0]!.transaction_date).toBe('2024-01-15');
    expect(normalized[0]!.quantity).toBe(10);
    expect(normalized[0]!.price_per_unit).toBe(150);
    expect(normalized[0]!.fees).toBe(4.95);
    expect(normalized[1]!.transaction_type).toBe('sell');
    expect(normalized[1]!.transaction_date).toBe('2024-01-20');
    expect(normalized[2]!.transaction_type).toBe('dividend');
    expect(normalized[2]!.symbol).toBe('VTI');
    expect(normalized[3]!.transaction_type).toBe('reinvestment');
    expect(normalized[3]!.quantity).toBe(0.5);

    // ── Step 3: Validate and deduplicate (mock DB has no existing hashes) ──
    const { valid, duplicates, errors } = await validateAndDeduplicate(normalized);

    expect(valid).toHaveLength(4);
    expect(duplicates).toHaveLength(0);
    expect(errors).toHaveLength(0);

    // ── Step 4: Pair DRIP records ──
    const { paired, unpaired } = pairDripRecords(valid);

    // VTI dividend + reinvestment on same day should pair
    expect(paired).toHaveLength(1);
    expect(paired[0]!.dividend.symbol).toBe('VTI');
    expect(paired[0]!.reinvestment.symbol).toBe('VTI');
    expect(paired[0]!.shares_acquired).toBe(0.5);
    expect(paired[0]!.cost_per_share).toBe(50);
    // Buy and Sell remain unpaired
    expect(unpaired).toHaveLength(2);
    expect(unpaired.map((r) => r.transaction_type)).toContain('buy');
    expect(unpaired.map((r) => r.transaction_type)).toContain('sell');

    // ── Step 5: Import records (mocked PocketBase) ──
    const importOptions = {
      filename: 'schwab_export.csv',
      format: format,
      accountId: ACCOUNT_ID,
      fileHash: 'abc123fakehash',
    };

    const summary = await importRecords(valid, importOptions);

    expect(summary.records_total).toBe(4);
    expect(summary.records_new).toBe(4);
    expect(summary.records_duplicate).toBe(0);
    expect(summary.records_error).toBe(0);

    // Verify PocketBase create was called:
    // 4 cash_transactions + 1 tax_lot (buy) + 1 tax_lot (reinvestment) + 1 csv_import_log = 7
    expect(mockCreate).toHaveBeenCalledTimes(7);

    // ── Step 6: Generate backup (triggers a mock download) ──
    const mockLink = { href: '', download: '', click: vi.fn() };
    const createElementSpy = vi.spyOn(document, 'createElement').mockReturnValue(mockLink as unknown as HTMLElement);
    const appendChildSpy = vi.spyOn(document.body, 'appendChild').mockImplementation(() => mockLink as unknown as Node);
    const removeChildSpy = vi.spyOn(document.body, 'removeChild').mockImplementation(() => mockLink as unknown as Node);
    const createObjectURLSpy = vi.spyOn(URL, 'createObjectURL').mockReturnValue('blob:mock-url');
    const revokeObjectURLSpy = vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => {});

    generateBackup(valid, summary, importOptions);

    expect(createElementSpy).toHaveBeenCalledWith('a');
    expect(mockLink.click).toHaveBeenCalled();
    expect(mockLink.download).toMatch(/^investment_backup_\d{4}-\d{2}-\d{2}\.json$/);
    expect(createObjectURLSpy).toHaveBeenCalled();
    expect(revokeObjectURLSpy).toHaveBeenCalled();

    // Cleanup spies
    createElementSpy.mockRestore();
    appendChildSpy.mockRestore();
    removeChildSpy.mockRestore();
    createObjectURLSpy.mockRestore();
    revokeObjectURLSpy.mockRestore();
  });

  it('correctly identifies duplicates when DB returns existing hashes', async () => {
    const format = detectBrokerFormat(SCHWAB_HEADERS);
    const normalized = normalizeRecords(SCHWAB_ROWS, format, ACCOUNT_ID);

    // validateAndDeduplicate recomputes hashes using SHA-256 (computeRecordHash),
    // so we need to compute the real hash for the first record to simulate a DB match
    const realHash = computeRecordHash(normalized[0]!);
    mockGetFullList.mockResolvedValue([{ hash: realHash }]);

    const { valid, duplicates } = await validateAndDeduplicate(normalized);

    // The record matching the existing hash should be marked as duplicate
    expect(duplicates.length).toBeGreaterThanOrEqual(1);
    expect(valid.length).toBeLessThan(4);
  });

  it('handles import errors gracefully', async () => {
    const format = detectBrokerFormat(SCHWAB_HEADERS);
    const normalized = normalizeRecords(SCHWAB_ROWS, format, ACCOUNT_ID);
    const { valid } = await validateAndDeduplicate(normalized);

    // Make the first PocketBase create call fail, then succeed for the rest
    mockCreate
      .mockRejectedValueOnce(new Error('Network timeout'))
      .mockResolvedValue({ id: 'mock-id' });

    const importOptions = {
      filename: 'schwab_export.csv',
      format: format,
      accountId: ACCOUNT_ID,
      fileHash: 'abc123fakehash',
    };

    const summary = await importRecords(valid, importOptions);

    expect(summary.records_error).toBeGreaterThanOrEqual(1);
    expect(summary.errors.length).toBeGreaterThanOrEqual(1);
    expect(summary.errors[0]!.error).toContain('Network timeout');
  });
});
