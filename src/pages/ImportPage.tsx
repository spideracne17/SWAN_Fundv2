import { useCallback, useEffect, useState } from 'react';
import { usePageTitle } from '@/hooks/usePageTitle';
import FileDropZone from '@/components/import/FileDropZone';
import ImportProgress, { type ImportStage } from '@/components/import/ImportProgress';
import ImportSummary from '@/components/import/ImportSummary';
import { parseFile } from '@/lib/import/fileParser';
import { detectBrokerFormat } from '@/lib/import/formatDetection';
import { normalizeRecords } from '@/lib/import/normalization';
import { validateAndDeduplicate, computeFileHash } from '@/lib/import/deduplication';
import { importRecords, type ImportSummary as ImportSummaryData } from '@/lib/import/importRecords';
import { generateBackup } from '@/lib/import/backup';
import { useInvalidateOnImport } from '@/hooks/useInvalidateOnImport';
import pb from '@/lib/pocketbase';

interface Account {
  id: string;
  name: string;
  broker: string;
  account_type: string;
}

function ImportPage() {
  usePageTitle('Import');

  const [stage, setStage] = useState<ImportStage | null>(null);
  const [errorMessage, setErrorMessage] = useState<string>('');
  const [errorAtStage, setErrorAtStage] = useState<'parsing' | 'validating' | 'importing' | 'backup'>('parsing');
  const [summary, setSummary] = useState<ImportSummaryData | null>(null);
  const { invalidateImportedData } = useInvalidateOnImport();

  const [accounts, setAccounts] = useState<Account[]>([]);
  const [selectedAccountId, setSelectedAccountId] = useState<string>('');

  // Fetch accounts on mount
  useEffect(() => {
    pb.collection('accounts').getFullList().then((records) => {
      // Sort in preferred order: Spreads, Robinhood, Roth, Traditional
      const order = ['Schwab Spreads', 'Robinhood', 'Roth IRA', 'Traditional IRA'];
      const sorted = (records as unknown as Account[]).sort((a, b) => {
        const aIdx = order.findIndex((o) => a.name.includes(o));
        const bIdx = order.findIndex((o) => b.name.includes(o));
        return (aIdx === -1 ? 99 : aIdx) - (bIdx === -1 ? 99 : bIdx);
      });
      setAccounts(sorted);
    }).catch(() => {
      // silently fail — user will see empty dropdown
    });
  }, []);

  const handleFileAccepted = useCallback(async (file: File) => {
    if (!selectedAccountId) {
      setErrorMessage('Please select an account before importing.');
      setStage('error');
      setErrorAtStage('parsing');
      return;
    }

    setStage('parsing');
    setSummary(null);
    setErrorMessage('');

    try {
      // Stage 1: Parse file
      const { headers, rows } = await parseFile(file);
      const format = detectBrokerFormat(headers);

      // Stage 2: Normalize and validate
      setStage('validating');

      const accountId = selectedAccountId;
      const normalized = normalizeRecords(rows, format, accountId);
      const { valid, duplicates } = await validateAndDeduplicate(normalized);

      // Stage 3: Import
      setStage('importing');
      const fileHash = await computeFileHash(file);

      const importResult = await importRecords(valid, {
        filename: file.name,
        format,
        accountId,
        fileHash,
      });

      // Add duplicate/error counts from validation
      importResult.records_duplicate += duplicates.length;
      importResult.records_total = normalized.length;

      // Stage 4: Backup
      setStage('backup');
      if (importResult.records_new > 0) {
        const selectedAccount = accounts.find((a) => a.id === accountId);
        generateBackup(valid, importResult, {
          filename: file.name,
          format,
          accountId,
          fileHash,
        }, selectedAccount?.name);
      }

      // Done!
      setStage('complete');
      setSummary(importResult);

      // Invalidate cached queries so dashboards refresh
      await invalidateImportedData();

    } catch (err) {
      const message = err instanceof Error ? err.message : 'An unknown error occurred';
      setErrorMessage(message);
      setErrorAtStage(
        stage === 'parsing' || stage === null ? 'parsing' :
        stage === 'validating' ? 'validating' :
        stage === 'importing' ? 'importing' : 'backup'
      );
      setStage('error');
    }
  }, [invalidateImportedData, stage, selectedAccountId]);

  const handleError = useCallback((message: string) => {
    setErrorMessage(message);
  }, []);

  const handleReset = useCallback(() => {
    setStage(null);
    setSummary(null);
    setErrorMessage('');
  }, []);

  return (
    <div className="page">
      <h2>Import</h2>
      <p>Drag and drop CSV/XLSX files from Schwab or Robinhood to import transactions.</p>

      {/* Account selector */}
      <div style={{ marginBottom: '16px' }}>
        <label
          htmlFor="account-select"
          style={{
            display: 'block',
            marginBottom: '6px',
            fontSize: '0.875rem',
            color: 'var(--color-text-secondary, #aaa)',
          }}
        >
          Import to Account
        </label>
        <select
          id="account-select"
          value={selectedAccountId}
          onChange={(e) => setSelectedAccountId(e.target.value)}
          style={{
            width: '100%',
            maxWidth: '400px',
            padding: '10px 12px',
            borderRadius: '6px',
            border: '1px solid var(--color-border, #444)',
            backgroundColor: 'var(--color-surface, #1e1e1e)',
            color: 'var(--color-text, #e0e0e0)',
            fontSize: '0.9rem',
            cursor: 'pointer',
            appearance: 'auto',
          }}
        >
          <option value="" disabled>
            Select account...
          </option>
          {accounts.map((acct) => (
            <option key={acct.id} value={acct.id}>
              {acct.name}
            </option>
          ))}
        </select>
      </div>

      {/* Show drop zone when idle or after completion */}
      {(stage === null || stage === 'complete' || stage === 'error') && (
        <FileDropZone onFileAccepted={handleFileAccepted} onError={handleError} />
      )}

      {/* Progress indicator during import */}
      {stage && stage !== 'complete' && stage !== 'error' && (
        <ImportProgress currentStage={stage} />
      )}

      {/* Error state */}
      {stage === 'error' && (
        <ImportProgress currentStage="error" errorMessage={errorMessage} errorAtStage={errorAtStage} />
      )}

      {/* Success summary */}
      {stage === 'complete' && summary && (
        <>
          <div style={{ marginTop: '16px' }}>
            <ImportSummary summary={summary} />
          </div>
          <button
            onClick={handleReset}
            style={{
              marginTop: '16px',
              padding: '8px 16px',
              borderRadius: '6px',
              border: '1px solid var(--color-border)',
              backgroundColor: 'var(--color-surface)',
              color: 'var(--color-text)',
              cursor: 'pointer',
            }}
          >
            Import Another File
          </button>
        </>
      )}
    </div>
  );
}

export default ImportPage;
