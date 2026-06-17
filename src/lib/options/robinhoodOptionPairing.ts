/**
 * Robinhood Option Trade Pairing Engine
 *
 * Pairs option opens with closes chronologically per symbol:
 *   STO (Sell to Open) → matched with BTC (Buy to Close) or OEXP/OASGN
 *   BTO (Buy to Open) → matched with STC (Sell to Close) or OEXP
 *
 * Each completed pair = one option trade with a realized P&L.
 * Unmatched opens = still open positions.
 *
 * Robinhood Trans Codes:
 *   STO  = Sell to Open (credit received)
 *   BTC  = Buy to Close (debit paid to close short)
 *   BTO  = Buy to Open (debit paid)
 *   STC  = Sell to Close (credit received from closing long)
 *   OEXP = Option Expiration (worthless)
 *   OASGN = Option Assignment
 */

import pb from '@/lib/pocketbase';
import type { CashTransactionRecord } from '@/types/database';

/* ─── Types ────────────────────────────────────────────────────────────── */

export interface OptionTrade {
  id: string;
  symbol: string; // underlying (ADM, HRL, etc.)
  accountId: string;
  optionDesc: string; // full description from Robinhood
  direction: 'short' | 'long'; // STO = short, BTO = long
  openDate: string;
  closeDate: string | null;
  openAmount: number; // credit for STO (positive), debit for BTO (negative)
  closeAmount: number; // debit for BTC (negative), credit for STC (positive), 0 for exp
  realizedPnL: number; // openAmount + closeAmount (for short: credit - debit = profit)
  status: 'open' | 'closed' | 'expired' | 'assigned';
}

export interface PerSymbolOptionSummary {
  symbol: string;
  accountId: string;
  trades: OptionTrade[];
  totalPnL: number;
  openTrades: number;
  closedTrades: number;
  winCount: number;
  lossCount: number;
}

/* ─── Pairing Logic ────────────────────────────────────────────────────── */

/**
 * Groups option transactions by underlying symbol and pairs opens with closes.
 */
export async function pairRobinhoodOptions(accountId: string): Promise<PerSymbolOptionSummary[]> {
  // Fetch all option-related transactions for this account
  let txns: CashTransactionRecord[] = [];
  try {
    txns = await pb.collection('cash_transactions').getFullList<CashTransactionRecord>({
      filter: `account_id = "${accountId}"`,
      sort: 'transaction_date',
      requestKey: `rh-options-${accountId}`,
    });
  } catch {
    return [];
  }

  // Filter to option transactions only
  const optionActions = new Set(['sto', 'btc', 'bto', 'stc', 'oexp', 'oasgn']);
  const optionTxns = txns.filter((tx) => {
    const action = (tx.raw_action ?? '').toLowerCase();
    return optionActions.has(action);
  });

  if (optionTxns.length === 0) return [];

  // Group by underlying symbol
  const bySymbol = new Map<string, CashTransactionRecord[]>();
  for (const tx of optionTxns) {
    const sym = (tx.symbol ?? '').trim();
    if (!sym) continue;
    // Extract underlying from option description or symbol
    // Robinhood descriptions like "ADM 8/23/2024 Put $59.00"
    const underlying = extractUnderlying(sym, tx.description ?? '');
    if (!underlying) continue;

    if (!bySymbol.has(underlying)) bySymbol.set(underlying, []);
    bySymbol.get(underlying)!.push(tx);
  }

  // Pair trades per symbol
  const results: PerSymbolOptionSummary[] = [];

  for (const [symbol, symbolTxns] of bySymbol) {
    const trades = pairTradesForSymbol(symbolTxns, symbol, accountId);

    const closedTrades = trades.filter((t) => t.status !== 'open');
    const totalPnL = closedTrades.reduce((s, t) => s + t.realizedPnL, 0);
    const winCount = closedTrades.filter((t) => t.realizedPnL > 0).length;
    const lossCount = closedTrades.filter((t) => t.realizedPnL < 0).length;

    results.push({
      symbol,
      accountId,
      trades,
      totalPnL,
      openTrades: trades.filter((t) => t.status === 'open').length,
      closedTrades: closedTrades.length,
      winCount,
      lossCount,
    });
  }

  return results;
}

/**
 * Extract underlying symbol from Robinhood option description.
 * Descriptions: "ADM 8/23/2024 Put $59.00" → "ADM"
 * Or symbol field might just be "ADM" for simple cases.
 */
function extractUnderlying(symbol: string, description: string): string | null {
  // If symbol is a plain ticker (no spaces, no dates), it IS the underlying
  if (/^[A-Z]{1,6}$/.test(symbol)) return symbol;

  // Try to extract from description: first word is usually the underlying
  const desc = (description || '').trim();
  const firstWord = desc.split(/\s+/)[0];
  if (firstWord && /^[A-Z]{1,6}$/i.test(firstWord)) return firstWord.toUpperCase();

  // Try symbol field: "ADM 8/23/2024 Put $59.00" → "ADM"
  const symFirst = symbol.split(/\s+/)[0];
  if (symFirst && /^[A-Z]{1,6}$/i.test(symFirst)) return symFirst.toUpperCase();

  return null;
}

/**
 * Pairs open/close transactions for a single symbol chronologically.
 *
 * Strategy:
 * - STO transactions go into a "short opens" queue
 * - BTO transactions go into a "long opens" queue
 * - BTC matches the oldest unmatched STO (FIFO)
 * - STC matches the oldest unmatched BTO (FIFO)
 * - OEXP matches any open (check description to determine which)
 * - OASGN matches the oldest short open
 */
function pairTradesForSymbol(
  txns: CashTransactionRecord[],
  symbol: string,
  accountId: string,
): OptionTrade[] {
  const trades: OptionTrade[] = [];

  // Queues of unmatched opens
  const shortOpens: { tx: CashTransactionRecord; trade: OptionTrade }[] = [];
  const longOpens: { tx: CashTransactionRecord; trade: OptionTrade }[] = [];

  // Sort by date
  const sorted = [...txns].sort((a, b) => a.transaction_date.localeCompare(b.transaction_date));

  for (const tx of sorted) {
    const action = (tx.raw_action ?? '').toLowerCase();
    const amount = parseFloat(String(tx.total_amount)) || 0;
    const desc = tx.description ?? '';

    switch (action) {
      case 'sto': {
        // Open a short position (credit received)
        const trade: OptionTrade = {
          id: tx.id,
          symbol,
          accountId,
          optionDesc: desc,
          direction: 'short',
          openDate: tx.transaction_date,
          closeDate: null,
          openAmount: amount, // positive (credit)
          closeAmount: 0,
          realizedPnL: 0,
          status: 'open',
        };
        shortOpens.push({ tx, trade });
        trades.push(trade);
        break;
      }

      case 'bto': {
        // Open a long position (debit paid)
        const trade: OptionTrade = {
          id: tx.id,
          symbol,
          accountId,
          optionDesc: desc,
          direction: 'long',
          openDate: tx.transaction_date,
          closeDate: null,
          openAmount: amount, // negative (debit)
          closeAmount: 0,
          realizedPnL: 0,
          status: 'open',
        };
        longOpens.push({ tx, trade });
        trades.push(trade);
        break;
      }

      case 'btc': {
        // Close a short position (debit to buy back)
        // Match with oldest STO that has same option description pattern
        const match = findMatchingOpen(shortOpens, tx);
        if (match) {
          match.trade.closeDate = tx.transaction_date;
          match.trade.closeAmount = amount; // negative (debit)
          match.trade.realizedPnL = match.trade.openAmount + amount; // credit - debit
          match.trade.status = 'closed';
          shortOpens.splice(shortOpens.indexOf(match), 1);
        }
        break;
      }

      case 'stc': {
        // Close a long position (credit from selling)
        const match = findMatchingOpen(longOpens, tx);
        if (match) {
          match.trade.closeDate = tx.transaction_date;
          match.trade.closeAmount = amount; // positive (credit)
          match.trade.realizedPnL = match.trade.openAmount + amount; // -debit + credit
          match.trade.status = 'closed';
          longOpens.splice(longOpens.indexOf(match), 1);
        }
        break;
      }

      case 'oexp': {
        // Option expired worthless — close the oldest matching open
        // If we were short (STO), expiration = full profit
        // If we were long (BTO), expiration = full loss
        const shortMatch = shortOpens.length > 0 ? shortOpens[0] : null;
        const longMatch = longOpens.length > 0 ? longOpens[0] : null;

        // Try to match based on description similarity
        if (shortMatch) {
          shortMatch.trade.closeDate = tx.transaction_date;
          shortMatch.trade.closeAmount = 0;
          shortMatch.trade.realizedPnL = shortMatch.trade.openAmount; // full premium kept
          shortMatch.trade.status = 'expired';
          shortOpens.splice(0, 1);
        } else if (longMatch) {
          longMatch.trade.closeDate = tx.transaction_date;
          longMatch.trade.closeAmount = 0;
          longMatch.trade.realizedPnL = longMatch.trade.openAmount; // lost full debit
          longMatch.trade.status = 'expired';
          longOpens.splice(0, 1);
        }
        break;
      }

      case 'oasgn': {
        // Option assignment — close the short position
        const match = shortOpens.length > 0 ? shortOpens[0] : null;
        if (match) {
          match.trade.closeDate = tx.transaction_date;
          match.trade.closeAmount = amount;
          match.trade.realizedPnL = match.trade.openAmount + amount;
          match.trade.status = 'assigned';
          shortOpens.splice(0, 1);
        }
        break;
      }
    }
  }

  return trades;
}

/**
 * Find the oldest open that best matches a closing transaction.
 * Simple FIFO matching — first open gets closed first.
 * Could be enhanced to match by strike/expiration from description.
 */
function findMatchingOpen(
  opens: { tx: CashTransactionRecord; trade: OptionTrade }[],
  closeTx: CashTransactionRecord,
): { tx: CashTransactionRecord; trade: OptionTrade } | undefined {
  if (opens.length === 0) return undefined;

  // Try to match by option description (same strike/expiration)
  const closeDesc = (closeTx.description ?? '').toLowerCase();
  const matched = opens.find((o) => {
    const openDesc = (o.tx.description ?? '').toLowerCase();
    // Check if same strike/date pattern
    return openDesc === closeDesc;
  });

  // If exact match found, use it. Otherwise FIFO.
  return matched ?? opens[0];
}

/**
 * Convenience: get per-symbol options P&L totals from paired trades.
 * Returns a Map of "symbol_accountId" → net P&L
 */
export async function getPerSymbolOptionsPnL(accountId: string): Promise<Map<string, number>> {
  const summaries = await pairRobinhoodOptions(accountId);
  const result = new Map<string, number>();

  for (const summary of summaries) {
    const key = `${summary.symbol}_${summary.accountId}`;
    result.set(key, summary.totalPnL);
  }

  return result;
}
