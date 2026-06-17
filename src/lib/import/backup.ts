import type { NormalizedRecord } from './normalization';
import type { ImportSummary, ImportOptions } from './importRecords';

// ─── Interfaces ──────────────────────────────────────────────────────────────

/**
 * Shape of the JSON backup file written to Downloads.
 */
export interface BackupPayload {
  metadata: {
    filename: string;
    format: string;
    date: string;
    records_total: number;
    records_new: number;
    records_duplicate: number;
    records_error: number;
  };
  records: NormalizedRecord[];
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

/**
 * Maps full account names to short labels for backup filenames.
 */
const ACCOUNT_LABEL_MAP: Record<string, string> = {
  'Schwab Spreads (Taxable)': 'Spreads',
  'Robinhood (Taxable)': 'Robinhood',
  'Schwab Roth IRA': 'Roth',
  'Schwab Traditional IRA': 'Traditional',
};

/**
 * Returns a short filename-safe label for an account name.
 * Falls back to the account name with spaces replaced by underscores.
 */
function getAccountLabel(accountName?: string): string {
  if (!accountName) return 'unknown';
  const label = ACCOUNT_LABEL_MAP[accountName] ?? accountName;
  return label.replace(/\s+/g, '_');
}

/**
 * Formats a Date as YYYY-MM-DD for the backup filename.
 */
function formatDate(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

// ─── generateBackup ──────────────────────────────────────────────────────────

/**
 * Serializes imported records plus metadata to JSON and triggers a browser
 * download as `investment_backup_ACCOUNTLABEL_YYYY-MM-DD.json`.
 *
 * This is called automatically after a successful import with records_new > 0.
 *
 * @param records - The normalized records that were imported
 * @param summary - The import summary with counts
 * @param options - The import options with filename and format
 * @param accountName - Optional account name used to generate the filename label
 */
export function generateBackup(
  records: NormalizedRecord[],
  summary: ImportSummary,
  options: ImportOptions,
  accountName?: string,
): void {
  const payload: BackupPayload = {
    metadata: {
      filename: options.filename,
      format: options.format,
      date: new Date().toISOString(),
      records_total: summary.records_total,
      records_new: summary.records_new,
      records_duplicate: summary.records_duplicate,
      records_error: summary.records_error,
    },
    records,
  };

  const json = JSON.stringify(payload, null, 2);
  const blob = new Blob([json], { type: 'application/json' });
  const url = URL.createObjectURL(blob);

  const link = document.createElement('a');
  link.href = url;
  const label = getAccountLabel(accountName);
  link.download = `investment_backup_${label}_${formatDate(new Date())}.json`;
  document.body.appendChild(link);
  link.click();

  // Clean up
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}
