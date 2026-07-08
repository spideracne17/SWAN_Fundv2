/**
 * React hook for Schwab API connection status and data.
 *
 * On mount:
 * - Checks if tokens exist in localStorage
 * - If not, tries to load from schwab/tokens.json (via public server)
 * - Validates token freshness, refreshes if needed
 * - Provides connection status to UI
 */

import { useState, useEffect, useCallback } from 'react';
import {
  loadTokens,
  isRefreshTokenExpired,
  getValidToken,
  initializeTokensFromFile,
} from '@/lib/schwab/tokenManager';
import {
  getAllAccountsWithPositions,
  type SchwabAccountDetails,
  SchwabApiError,
} from '@/lib/schwab/client';

export type SchwabStatus = 'disconnected' | 'connecting' | 'connected' | 'expired' | 'error';

export interface UseSchwabReturn {
  status: SchwabStatus;
  error: string | null;
  accounts: SchwabAccountDetails[];
  totalValue: number;
  isConnected: boolean;
  refresh: () => Promise<void>;
}

export function useSchwab(): UseSchwabReturn {
  const [status, setStatus] = useState<SchwabStatus>('disconnected');
  const [error, setError] = useState<string | null>(null);
  const [accounts, setAccounts] = useState<SchwabAccountDetails[]>([]);

  const connect = useCallback(async () => {
    setStatus('connecting');
    setError(null);

    // Check localStorage first
    let tokens = loadTokens();

    // If no tokens in localStorage, try loading from file
    if (!tokens) {
      const loaded = await initializeTokensFromFile();
      if (loaded) tokens = loadTokens();
    }

    if (!tokens) {
      setStatus('disconnected');
      setError('No tokens. Run: node schwab/auth.mjs');
      return;
    }

    // Check if refresh token is expired
    if (isRefreshTokenExpired(tokens)) {
      setStatus('expired');
      setError('Refresh token expired. Re-run: node schwab/auth.mjs');
      return;
    }

    // Try to get a valid token (will auto-refresh if needed)
    const token = await getValidToken();
    if (!token) {
      setStatus('error');
      setError('Could not get valid token');
      return;
    }

    // Fetch accounts
    try {
      const accountData = await getAllAccountsWithPositions();
      setAccounts(accountData);
      setStatus('connected');
    } catch (err) {
      if (err instanceof SchwabApiError && err.status === 401) {
        setStatus('expired');
        setError('Token rejected. Re-run: node schwab/auth.mjs');
      } else {
        setStatus('error');
        setError(err instanceof Error ? err.message : 'Failed to fetch accounts');
      }
    }
  }, []);

  useEffect(() => {
    connect();
  }, [connect]);

  const totalValue = accounts.reduce((sum, a) => {
    return sum + (a.securitiesAccount?.currentBalances?.liquidationValue ?? 0);
  }, 0);

  return {
    status,
    error,
    accounts,
    totalValue,
    isConnected: status === 'connected',
    refresh: connect,
  };
}
