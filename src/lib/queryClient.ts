import { QueryClient } from '@tanstack/react-query';

/**
 * Application-wide QueryClient with sensible defaults for a personal
 * investment tracking tool backed by PocketBase.
 *
 * - staleTime 5 minutes: data rarely changes outside of explicit imports
 * - gcTime 30 minutes: keep unused cache around for quick back-navigation
 * - retry once: PocketBase is local/low-latency; fail fast on real errors
 * - refetchOnWindowFocus disabled: avoids unnecessary network chatter for
 *   a single-user app with infrequent data changes
 */
export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 5 * 60 * 1000, // 5 minutes
      gcTime: 30 * 60 * 1000, // 30 minutes
      retry: 1,
      refetchOnWindowFocus: false,
    },
  },
});

// ─── Query Key Factories ─────────────────────────────────────────────────────
// Structured query keys enable targeted cache invalidation.
// Pattern: [collection] → [collection, 'list', filters?] → [collection, 'detail', id]

export const queryKeys = {
  // Accounts
  accounts: {
    all: ['accounts'] as const,
    lists: () => [...queryKeys.accounts.all, 'list'] as const,
    list: (filters?: Record<string, unknown>) =>
      [...queryKeys.accounts.lists(), filters] as const,
    details: () => [...queryKeys.accounts.all, 'detail'] as const,
    detail: (id: string) => [...queryKeys.accounts.details(), id] as const,
  },

  // Instruments
  instruments: {
    all: ['instruments'] as const,
    lists: () => [...queryKeys.instruments.all, 'list'] as const,
    list: (filters?: Record<string, unknown>) =>
      [...queryKeys.instruments.lists(), filters] as const,
    details: () => [...queryKeys.instruments.all, 'detail'] as const,
    detail: (id: string) => [...queryKeys.instruments.details(), id] as const,
  },

  // Settings
  settings: {
    all: ['settings'] as const,
    lists: () => [...queryKeys.settings.all, 'list'] as const,
    list: (filters?: Record<string, unknown>) =>
      [...queryKeys.settings.lists(), filters] as const,
    byCategory: (category: string) =>
      [...queryKeys.settings.all, 'category', category] as const,
    details: () => [...queryKeys.settings.all, 'detail'] as const,
    detail: (id: string) => [...queryKeys.settings.details(), id] as const,
  },

  // Tax Lots
  taxLots: {
    all: ['tax_lots'] as const,
    lists: () => [...queryKeys.taxLots.all, 'list'] as const,
    list: (filters?: Record<string, unknown>) =>
      [...queryKeys.taxLots.lists(), filters] as const,
    details: () => [...queryKeys.taxLots.all, 'detail'] as const,
    detail: (id: string) => [...queryKeys.taxLots.details(), id] as const,
  },

  // Dispositions
  dispositions: {
    all: ['dispositions'] as const,
    lists: () => [...queryKeys.dispositions.all, 'list'] as const,
    list: (filters?: Record<string, unknown>) =>
      [...queryKeys.dispositions.lists(), filters] as const,
    details: () => [...queryKeys.dispositions.all, 'detail'] as const,
    detail: (id: string) => [...queryKeys.dispositions.details(), id] as const,
  },

  // Option Positions
  optionPositions: {
    all: ['option_positions'] as const,
    lists: () => [...queryKeys.optionPositions.all, 'list'] as const,
    list: (filters?: Record<string, unknown>) =>
      [...queryKeys.optionPositions.lists(), filters] as const,
    details: () => [...queryKeys.optionPositions.all, 'detail'] as const,
    detail: (id: string) =>
      [...queryKeys.optionPositions.details(), id] as const,
  },

  // Option Spreads
  optionSpreads: {
    all: ['option_spreads'] as const,
    lists: () => [...queryKeys.optionSpreads.all, 'list'] as const,
    list: (filters?: Record<string, unknown>) =>
      [...queryKeys.optionSpreads.lists(), filters] as const,
    details: () => [...queryKeys.optionSpreads.all, 'detail'] as const,
    detail: (id: string) =>
      [...queryKeys.optionSpreads.details(), id] as const,
  },

  // Cash Transactions
  cashTransactions: {
    all: ['cash_transactions'] as const,
    lists: () => [...queryKeys.cashTransactions.all, 'list'] as const,
    list: (filters?: Record<string, unknown>) =>
      [...queryKeys.cashTransactions.lists(), filters] as const,
    details: () => [...queryKeys.cashTransactions.all, 'detail'] as const,
    detail: (id: string) =>
      [...queryKeys.cashTransactions.details(), id] as const,
  },

  // Dividends
  dividends: {
    all: ['dividends'] as const,
    lists: () => [...queryKeys.dividends.all, 'list'] as const,
    list: (filters?: Record<string, unknown>) =>
      [...queryKeys.dividends.lists(), filters] as const,
    details: () => [...queryKeys.dividends.all, 'detail'] as const,
    detail: (id: string) => [...queryKeys.dividends.details(), id] as const,
  },

  // CSV Import Log
  csvImportLog: {
    all: ['csv_import_log'] as const,
    lists: () => [...queryKeys.csvImportLog.all, 'list'] as const,
    list: (filters?: Record<string, unknown>) =>
      [...queryKeys.csvImportLog.lists(), filters] as const,
    details: () => [...queryKeys.csvImportLog.all, 'detail'] as const,
    detail: (id: string) => [...queryKeys.csvImportLog.details(), id] as const,
  },

  // Stock Splits
  stockSplits: {
    all: ['stock_splits'] as const,
    lists: () => [...queryKeys.stockSplits.all, 'list'] as const,
    list: (filters?: Record<string, unknown>) =>
      [...queryKeys.stockSplits.lists(), filters] as const,
    details: () => [...queryKeys.stockSplits.all, 'detail'] as const,
    detail: (id: string) => [...queryKeys.stockSplits.details(), id] as const,
  },

  // IRA Contributions
  iraContributions: {
    all: ['ira_contributions'] as const,
    lists: () => [...queryKeys.iraContributions.all, 'list'] as const,
    list: (filters?: Record<string, unknown>) =>
      [...queryKeys.iraContributions.lists(), filters] as const,
    details: () => [...queryKeys.iraContributions.all, 'detail'] as const,
    detail: (id: string) =>
      [...queryKeys.iraContributions.details(), id] as const,
  },

  // Sweep Balances
  sweepBalances: {
    all: ['sweep_balances'] as const,
    lists: () => [...queryKeys.sweepBalances.all, 'list'] as const,
    list: (filters?: Record<string, unknown>) =>
      [...queryKeys.sweepBalances.lists(), filters] as const,
    details: () => [...queryKeys.sweepBalances.all, 'detail'] as const,
    detail: (id: string) => [...queryKeys.sweepBalances.details(), id] as const,
  },

  // Market Events
  marketEvents: {
    all: ['market_events'] as const,
    lists: () => [...queryKeys.marketEvents.all, 'list'] as const,
    list: (filters?: Record<string, unknown>) =>
      [...queryKeys.marketEvents.lists(), filters] as const,
    details: () => [...queryKeys.marketEvents.all, 'detail'] as const,
    detail: (id: string) => [...queryKeys.marketEvents.details(), id] as const,
  },
} as const;
