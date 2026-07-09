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
import { getValidToken } from '@/lib/schwab/tokenManager';
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
      <p>Sync from Schwab API or drag/drop CSV/XLSX files from Schwab or Robinhood.</p>

      {/* Schwab API Sync */}
      <SchwabSyncSection />

      <hr style={{ border: 'none', borderTop: '1px solid var(--color-border)', margin: '24px 0' }} />
      <h3 style={{ fontSize: '1rem', marginBottom: '12px' }}>CSV / XLSX Import</h3>

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

/* ─── Schwab API Sync ──────────────────────────────────────────────────── */

interface SchwabTransaction {
  type: string;
  transactionDate: string;
  description: string;
  accountNumber: string;
  netAmount: number;
  status: string;
}

function SchwabSyncSection() {
  const [syncing, setSyncing] = useState(false);
  const [result, setResult] = useState<{ count: number; transactions: SchwabTransaction[] } | null>(null);
  const [error, setError] = useState<string | null>(null);

  const handleSync = async () => {
    setSyncing(true);
    setError(null);
    setResult(null);

    try {
      // Get trading token
      const resp = await fetch('/schwab-trading-tokens.json');
      if (!resp.ok) throw new Error('No trading tokens. Run: node schwab/auth-trading.mjs');
      const tokens = await resp.json();
      if (!tokens.access_token) throw new Error('No access token available');

      const BASE = '/schwab-api';

      // Get account hashes first
      const acctResp = await fetch(`${BASE}/trader/v1/accounts/accountNumbers`, {
        headers: { 'Authorization': `Bearer ${tokens.access_token}` },
      });
      if (!acctResp.ok) throw new Error(`Accounts fetch failed: ${acctResp.status}`);
      const accounts = await acctResp.json();

      // Pull transactions from each account (last 30 days)
      const startDate = new Date();
      startDate.setDate(startDate.getDate() - 30);
      const startStr = startDate.toISOString();
      const endStr = new Date().toISOString();

      const allTransactions: SchwabTransaction[] = [];

      for (const acct of accounts) {
        try {
          const txResp = await fetch(
            `${BASE}/trader/v1/accounts/${acct.hashValue}/transactions?startDate=${startStr}&endDate=${endStr}`,
            { headers: { 'Authorization': `Bearer ${tokens.access_token}` } }
          );
          if (txResp.ok) {
            const txns = await txResp.json();
            if (Array.isArray(txns)) {
              allTransactions.push(...txns.map((t: Record<string, unknown>) => ({
                type: String(t.type ?? ''),
                transactionDate: String(t.time ?? t.transactionDate ?? ''),
                description: String(t.description ?? ''),
                accountNumber: acct.accountNumber,
                netAmount: Number(t.netAmount ?? 0),
                status: String(t.status ?? ''),
              })));
            }
          }
        } catch { /* skip individual account errors */ }
      }

      setResult({ count: allTransactions.length, transactions: allTransactions.slice(0, 20) });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Sync failed');
    } finally {
      setSyncing(false);
    }
  };

  return (
    <div style={{ marginBottom: '16px', padding: '16px 20px', background: 'var(--color-surface)', border: '1px solid var(--color-border)', borderRadius: '8px' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '12px' }}>
        <h3 style={{ margin: 0, fontSize: '1rem' }}>🔄 Sync from Schwab</h3>
        <button
          onClick={handleSync}
          disabled={syncing}
          style={{
            padding: '8px 16px',
            borderRadius: '6px',
            border: '1px solid var(--color-border)',
            backgroundColor: syncing ? 'var(--color-surface)' : '#4fc3f7',
            color: syncing ? 'var(--color-text-muted)' : '#000',
            cursor: syncing ? 'not-allowed' : 'pointer',
            fontWeight: 700,
            fontSize: '0.8125rem',
          }}
        >
          {syncing ? 'Syncing...' : 'Pull Last 30 Days'}
        </button>
      </div>

      {error && (
        <div style={{ color: '#ef5350', fontSize: '0.8125rem', marginBottom: '8px' }}>❌ {error}</div>
      )}

      {result && (
        <div>
          <div style={{ color: '#66bb6a', fontSize: '0.875rem', fontWeight: 600, marginBottom: '8px' }}>
            ✅ Found {result.count} transactions (showing first 20)
          </div>
          <div style={{ maxHeight: '300px', overflow: 'auto', fontSize: '0.75rem' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
              <thead>
                <tr style={{ borderBottom: '1px solid var(--color-border)' }}>
                  <th style={{ textAlign: 'left', padding: '4px 8px', color: 'var(--color-text-muted)' }}>Date</th>
                  <th style={{ textAlign: 'left', padding: '4px 8px', color: 'var(--color-text-muted)' }}>Account</th>
                  <th style={{ textAlign: 'left', padding: '4px 8px', color: 'var(--color-text-muted)' }}>Type</th>
                  <th style={{ textAlign: 'left', padding: '4px 8px', color: 'var(--color-text-muted)' }}>Description</th>
                  <th style={{ textAlign: 'right', padding: '4px 8px', color: 'var(--color-text-muted)' }}>Amount</th>
                </tr>
              </thead>
              <tbody>
                {result.transactions.map((tx, i) => (
                  <tr key={i} style={{ borderBottom: '1px solid var(--color-border)' }}>
                    <td style={{ padding: '4px 8px' }}>{tx.transactionDate.split('T')[0]}</td>
                    <td style={{ padding: '4px 8px' }}>...{tx.accountNumber.slice(-4)}</td>
                    <td style={{ padding: '4px 8px' }}>{tx.type}</td>
                    <td style={{ padding: '4px 8px' }}>{tx.description.slice(0, 50)}</td>
                    <td style={{ padding: '4px 8px', textAlign: 'right', color: tx.netAmount >= 0 ? '#66bb6a' : '#ef5350' }}>
                      ${tx.netAmount.toFixed(2)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}

export default ImportPage;
