import * as XLSX from 'xlsx';

/**
 * Result from parsing a CSV or XLSX file.
 */
export interface ParseFileResult {
  /** Column headers extracted from the first row of the worksheet. */
  headers: string[];
  /** Data rows as key-value records (column header → cell value as string). */
  rows: Record<string, string>[];
}

/**
 * Parses a CSV or XLSX file entirely client-side using SheetJS.
 *
 * Reads the file as an ArrayBuffer, extracts the first worksheet,
 * detects headers from the first row, and returns all data rows as
 * Record<string, string> objects keyed by column header.
 *
 * @param file - A File object (CSV or XLSX) up to 10 MB
 * @returns Headers and row data from the first worksheet
 * @throws Error if the file cannot be read or contains no data
 */
export async function parseFile(file: File): Promise<ParseFileResult> {
  const arrayBuffer = await file.arrayBuffer();
  const workbook = XLSX.read(arrayBuffer, { type: 'array' });

  const firstSheetName = workbook.SheetNames[0];
  if (!firstSheetName) {
    throw new Error('Workbook contains no sheets');
  }

  const worksheet = workbook.Sheets[firstSheetName];
  if (!worksheet) {
    throw new Error('Unable to read the first worksheet');
  }

  // Convert sheet to JSON with header row detection.
  // Setting raw: false ensures all values come back as formatted strings.
  const rows = XLSX.utils.sheet_to_json<Record<string, string>>(worksheet, {
    raw: false,
    defval: '',
  });

  // Extract headers from the sheet range
  const ref = worksheet['!ref'];
  if (!ref) {
    return { headers: [], rows: [] };
  }

  const range = XLSX.utils.decode_range(ref);
  const headers: string[] = [];

  for (let col = range.s.c; col <= range.e.c; col++) {
    const cellAddress = XLSX.utils.encode_cell({ r: range.s.r, c: col });
    const cell = worksheet[cellAddress];
    const header = cell ? String(cell.v) : '';
    headers.push(header);
  }

  return { headers, rows };
}
