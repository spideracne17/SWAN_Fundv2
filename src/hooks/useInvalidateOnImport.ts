import { useCallback } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { queryKeys } from '@/lib/queryClient';

/**
 * Hook that returns a function to invalidate all queries affected by a CSV import.
 *
 * After a successful import, the following collections may have new records:
 * - tax_lots (new purchase/DRIP lots)
 * - dispositions (new sale dispositions)
 * - dividends (dividend records + DRIP pairings)
 * - cash_transactions (all imported transactions)
 * - csv_import_log (the import log entry itself)
 *
 * Invalidation uses the top-level key for each collection so both list and
 * detail queries are refetched on next access.
 */
export function useInvalidateOnImport() {
  const queryClient = useQueryClient();

  const invalidateImportedData = useCallback(async () => {
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: queryKeys.taxLots.all }),
      queryClient.invalidateQueries({ queryKey: queryKeys.dispositions.all }),
      queryClient.invalidateQueries({ queryKey: queryKeys.dividends.all }),
      queryClient.invalidateQueries({
        queryKey: queryKeys.cashTransactions.all,
      }),
      queryClient.invalidateQueries({ queryKey: queryKeys.csvImportLog.all }),
    ]);
  }, [queryClient]);

  return { invalidateImportedData };
}
