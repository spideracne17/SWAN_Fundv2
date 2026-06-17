import CryptoJS from 'crypto-js';
import pb from '@/lib/pocketbase';
import type { NormalizedRecord } from './normalization';

// ─── File-Level Deduplication ────────────────────────────────────────────────

/**
 * Result of checking whether a file has already been imported.
 */
export interface FileImportCheckResult {
  alreadyImported: boolean;
  existingLog?: {
    filename: string;
    import_date: string;
  };
}

/**
 * Computes a SHA-256 hash of an entire file for file-level deduplication.
 *
 * Reads the file as an ArrayBuffer, converts it to a CryptoJS WordArray,
 * and returns the hex-encoded SHA-256 hash.
 *
 * @param file - The File object to hash
 * @returns Hex-encoded SHA-256 hash of the file contents
 */
export async function computeFileHash(file: File): Promise<string> {
  const arrayBuffer = await file.arrayBuffer();
  const wordArray = CryptoJS.lib.WordArray.create(arrayBuffer);
  return CryptoJS.SHA256(wordArray).toString();
}

/**
 * Checks the csv_import_log table for an existing import with the same file hash.
 *
 * If found, returns the filename and import date of the existing log entry,
 * enabling the UI to warn the user about a potential duplicate import.
 *
 * @param fileHash - SHA-256 hash of the file to check
 * @returns Object indicating if file was already imported, with existing log details if so
 */
export async function checkFileAlreadyImported(
  fileHash: string,
): Promise<FileImportCheckResult> {
  try {
    const result = await pb.collection('csv_import_log').getFirstListItem(
      `file_hash = "${fileHash}"`,
      { fields: 'filename,import_date' },
    );

    return {
      alreadyImported: true,
      existingLog: {
        filename: result.filename as string,
        import_date: result.import_date as string,
      },
    };
  } catch {
    // PocketBase throws a 404 ClientResponseError when no record matches
    return { alreadyImported: false };
  }
}

// ─── Record Hash Input ───────────────────────────────────────────────────────

/**
 * The canonical fields used to compute a deduplication hash for a transaction record.
 */
export interface HashableRecord {
  account_id: string;
  transaction_date: string;
  transaction_type: string;
  symbol?: string;
  quantity?: number;
  total_amount: number;
}

// ─── Validation Result ───────────────────────────────────────────────────────

/**
 * Result of validating and deduplicating a batch of normalized records.
 */
export interface ValidationResult {
  /** Records that pass validation and have no existing hash in the database. */
  valid: NormalizedRecord[];
  /** Records whose hash already exists in the database (skipped). */
  duplicates: NormalizedRecord[];
  /** Records that failed validation with the reason. */
  errors: { record: NormalizedRecord; error: string }[];
}

// ─── computeRecordHash ───────────────────────────────────────────────────────

/**
 * Computes a deterministic SHA-256 hash from canonical transaction fields.
 *
 * The hash is used for deduplication: identical records imported multiple times
 * will always produce the same hash, allowing duplicate detection.
 *
 * Fields are concatenated in a fixed order with pipe (|) separators.
 * Optional fields use empty string when absent to maintain consistent positioning.
 *
 * @param record - The record containing canonical fields to hash
 * @returns Hex-encoded SHA-256 hash string
 */
export function computeRecordHash(record: HashableRecord): string {
  const canonical = [
    record.account_id,
    record.transaction_date,
    record.transaction_type,
    record.symbol ?? '',
    record.quantity?.toString() ?? '',
    record.total_amount.toString(),
  ].join('|');

  return CryptoJS.SHA256(canonical).toString();
}

// ─── validateAndDeduplicate ──────────────────────────────────────────────────

/** Required fields that must be present and non-empty on every record. */
const REQUIRED_FIELDS: (keyof NormalizedRecord)[] = [
  'account_id',
  'transaction_date',
  'transaction_type',
  'total_amount',
];

/**
 * Validates required fields and deduplicates records against the database.
 *
 * For each record:
 * 1. Validates that required fields are present and non-empty.
 * 2. Computes a SHA-256 hash from canonical fields.
 * 3. Queries the PocketBase `cash_transactions` table for existing hashes.
 * 4. Separates records into valid (new), duplicates, and errors.
 *
 * @param records - Array of normalized records to validate and deduplicate
 * @returns A promise resolving to a ValidationResult with valid, duplicate, and error buckets
 */
export async function validateAndDeduplicate(
  records: NormalizedRecord[],
): Promise<ValidationResult> {
  const valid: NormalizedRecord[] = [];
  const duplicates: NormalizedRecord[] = [];
  const errors: { record: NormalizedRecord; error: string }[] = [];

  // Step 1: Validate required fields and compute hashes
  const validatedRecords: NormalizedRecord[] = [];

  for (const record of records) {
    const missingFields = REQUIRED_FIELDS.filter((field) => {
      const value = record[field];
      if (value === undefined || value === null) return true;
      if (typeof value === 'string' && value.trim() === '') return true;
      return false;
    });

    if (missingFields.length > 0) {
      errors.push({
        record,
        error: `Missing required fields: ${missingFields.join(', ')}`,
      });
      continue;
    }

    // Recompute hash using the canonical hash function
    const hash = computeRecordHash(record);
    validatedRecords.push({ ...record, hash });
  }

  // Step 2: Query existing hashes from the database
  if (validatedRecords.length === 0) {
    return { valid, duplicates, errors };
  }

  const hashes = validatedRecords.map((r) => r.hash);
  const existingHashes = await queryExistingHashes(hashes);

  // Step 3: Separate into valid (new) and duplicates
  for (const record of validatedRecords) {
    if (existingHashes.has(record.hash)) {
      duplicates.push(record);
    } else {
      valid.push(record);
    }
  }

  return { valid, duplicates, errors };
}

/**
 * Queries PocketBase for existing hashes in the cash_transactions table.
 *
 * To avoid exceeding URL length limits, hashes are queried in batches.
 * Returns a Set of hashes that already exist in the database.
 *
 * @param hashes - Array of hash strings to check
 * @returns Set of hashes that exist in the database
 */
async function queryExistingHashes(hashes: string[]): Promise<Set<string>> {
  const existingHashes = new Set<string>();

  // Batch hashes to avoid overly long filter expressions
  const BATCH_SIZE = 50;

  for (let i = 0; i < hashes.length; i += BATCH_SIZE) {
    const batch = hashes.slice(i, i + BATCH_SIZE);

    // Build a PocketBase filter: hash = "abc" || hash = "def" || ...
    const filter = batch.map((h) => `hash = "${h}"`).join(' || ');

    try {
      const results = await pb.collection('cash_transactions').getFullList({
        filter,
        fields: 'hash',
      });

      for (const record of results) {
        if (record.hash) {
          existingHashes.add(record.hash as string);
        }
      }
    } catch {
      // If the collection is empty or doesn't exist yet, treat as no duplicates
      // PocketBase throws when filter matches zero records in some scenarios
    }
  }

  return existingHashes;
}
