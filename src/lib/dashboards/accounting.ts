import pb from '@/lib/pocketbase';
import type { AccountRecord, DispositionRecord, TaxLotRecord } from '@/types/database';
import { getPerSymbolOptionsPnL } from '@/lib/options/robinhoodOptionPairing';

/**
 * Summary for a single symbol position per account.
 */
export interface PositionSummary {
  symbol: string;
  shares: number;
  cost_basis: number;
  market_value?: number;
  unrealized_gain_loss?: number;
  realized_gain_loss?: number;
  dividend_income?: number;
  options_income?: number;
  total_gain_loss?: number;
  account_id?: string;
  account_name?: string;
}

/**
 * Aggregated data for the Accounting dashboard.
 */
export interface AccountingDashboardData {
  cost_basis_total: number;
  market_value_total: number | null;
  unrealized_gain_loss: number | null;
  positions: PositionSummary[];
}

/**
 * Fetches and aggregates accounting dashboard data across all accounts.
 *
 * Queries all open/partial tax lots from PocketBase, groups by symbol,
 * and sums cost basis and shares. Market value is null/placeholder until
 * live GoogleFinance prices are integrated.
 */
export async function fetchAccountingData(): Promise<AccountingDashboardData> {
  // Fetch all tax lots from PocketBase (filter client-side to avoid PB filter syntax issues)
  let lots: TaxLotRecord[] = [];
  try {
    const allLots = await pb.collection('tax_lots').getFullList<TaxLotRecord>({
      sort: 'symbol',
    });
    lots = allLots.filter(lot => lot.status === 'open' || lot.status === 'partial');
  } catch {
    // If tax_lots collection is empty or query fails, use empty array
    lots = [];
  }

  // Fetch accounts to map account_id → name
  let accounts: AccountRecord[] = [];
  try {
    accounts = await pb.collection('accounts').getFullList<AccountRecord>();
  } catch {
    accounts = [];
  }
  const accountNameMap = new Map<string, string>(
    accounts.map(a => [a.id, a.name])
  );

  // Group by symbol + account_id and aggregate
  const positionMap = new Map<string, { shares: number; cost_basis: number; account_id: string; account_name: string }>();

  for (const lot of lots) {
    const key = `${lot.symbol}_${lot.account_id}`;
    const existing = positionMap.get(key);
    const remainingShares = parseFloat(String(lot.remaining_shares)) || 0;
    const costPerShare = parseFloat(String(lot.cost_per_share)) || 0;
    const lotCostBasis = parseFloat(String(lot.total_cost_basis)) || (remainingShares * costPerShare);

    if (existing) {
      existing.shares += remainingShares;
      existing.cost_basis += lotCostBasis;
    } else {
      positionMap.set(key, {
        shares: remainingShares,
        cost_basis: lotCostBasis,
        account_id: lot.account_id,
        account_name: accountNameMap.get(lot.account_id) ?? '',
      });
    }
  }

  // Build position summaries
  const positions: PositionSummary[] = [];
  let costBasisTotal = 0;

  // Fetch per-symbol realized G/L from dispositions
  let dispositions: DispositionRecord[] = [];
  try {
    dispositions = await pb.collection('dispositions').getFullList<DispositionRecord>({ requestKey: 'acct-dispositions' });
  } catch { /* empty */ }

  // Fetch per-symbol dividend income from cash_transactions
  let allTxns: { symbol: string; account_id: string; transaction_type: string; raw_action: string; total_amount: string }[] = [];
  try {
    allTxns = await pb.collection('cash_transactions').getFullList({ requestKey: 'acct-income' }) as typeof allTxns;
  } catch { /* empty */ }

  // Build lookup maps: symbol_accountId → realized G/L, dividends, options income
  const realizedMap = new Map<string, number>();
  for (const d of dispositions) {
    // Find which symbol this disposition belongs to via lot_id
    const lot = lots.find(l => l.id === d.lot_id) ??
      (await pb.collection('tax_lots').getOne(d.lot_id).catch(() => null));
    if (!lot) continue;
    const key = `${(lot as TaxLotRecord).symbol}_${(lot as TaxLotRecord).account_id}`;
    realizedMap.set(key, (realizedMap.get(key) ?? 0) + (parseFloat(String(d.gain_loss)) || 0));
  }

  const dividendMap = new Map<string, number>();
  const optionsMap = new Map<string, number>();

  // Get properly paired options P&L per symbol from each account
  const accountIds = [...new Set([...positionMap.values()].map(d => d.account_id))];
  for (const acctId of accountIds) {
    const acctOptionsPnL = await getPerSymbolOptionsPnL(acctId);
    for (const [key, pnl] of acctOptionsPnL) {
      optionsMap.set(key, (optionsMap.get(key) ?? 0) + pnl);
    }
  }

  // Dividends from cash_transactions
  for (const tx of allTxns) {
    const sym = (tx.symbol || '').trim();
    if (!sym) continue;
    const key = `${sym}_${tx.account_id}`;
    const amount = parseFloat(String(tx.total_amount)) || 0;
    const txType = (tx.transaction_type || '').toLowerCase();
    const rawAction = (tx.raw_action || '').toLowerCase();

    if (txType === 'dividend' || rawAction.includes('div')) {
      if (amount > 0) {
        dividendMap.set(key, (dividendMap.get(key) ?? 0) + amount);
      }
    }
  }

  for (const [key, data] of positionMap) {
    costBasisTotal += data.cost_basis;
    const symbol = key.split('_')[0] ?? '';

    const realized = realizedMap.get(key) ?? 0;
    const dividends = dividendMap.get(key) ?? 0;
    const options = optionsMap.get(key) ?? 0;

    positions.push({
      symbol,
      shares: data.shares,
      cost_basis: data.cost_basis,
      market_value: undefined,
      unrealized_gain_loss: undefined,
      realized_gain_loss: realized,
      dividend_income: dividends,
      options_income: options,
      total_gain_loss: realized + dividends + options, // unrealized added after market prices applied
      account_id: data.account_id,
      account_name: data.account_name,
    });
  }

  // Sort positions alphabetically by symbol, then by account name
  positions.sort((a, b) => {
    const symbolCmp = a.symbol.localeCompare(b.symbol);
    if (symbolCmp !== 0) return symbolCmp;
    return (a.account_name ?? '').localeCompare(b.account_name ?? '');
  });

  return {
    cost_basis_total: costBasisTotal,
    market_value_total: null, // Placeholder until GoogleFinance prices are integrated
    unrealized_gain_loss: null, // market_value_total - cost_basis_total when prices are available
    positions,
  };
}

/**
 * Realized gain/loss breakdown (all-time).
 */
export interface RealizedGainLoss {
  short_term: number;
  long_term: number;
  total: number;
}

/**
 * Fetches total realized gain/loss from the dispositions table (all-time).
 * Sums gain_loss grouped by holding_period.
 */
export async function fetchRealizedGainLoss(): Promise<RealizedGainLoss> {
  let dispositions: DispositionRecord[] = [];
  try {
    dispositions = await pb
      .collection('dispositions')
      .getFullList<DispositionRecord>({ requestKey: 'realized-gl' });
  } catch {
    dispositions = [];
  }

  let shortTerm = 0;
  let longTerm = 0;

  for (const disposition of dispositions) {
    const gl = parseFloat(String(disposition.gain_loss)) || 0;
    if (disposition.holding_period === 'short_term') {
      shortTerm += gl;
    } else {
      longTerm += gl;
    }
  }

  return {
    short_term: shortTerm,
    long_term: longTerm,
    total: shortTerm + longTerm,
  };
}

/**
 * Computes unrealized gain/loss given market prices for each symbol.
 * This is a helper that can be used once live prices are available.
 *
 * @param positions - Position summaries from fetchAccountingData
 * @param prices - Map of symbol to current market price per share
 * @returns Updated dashboard data with market values populated
 */
export function applyMarketPrices(
  data: AccountingDashboardData,
  prices: Map<string, number>
): AccountingDashboardData {
  let marketValueTotal = 0;
  let allPricesAvailable = true;

  const updatedPositions: PositionSummary[] = data.positions.map((position) => {
    const price = prices.get(position.symbol);

    if (price !== undefined) {
      const marketValue = position.shares * price;
      const unrealizedGainLoss = marketValue - position.cost_basis;
      marketValueTotal += marketValue;

      // Total G/L = unrealized + realized + dividends + options
      const totalGL = unrealizedGainLoss +
        (position.realized_gain_loss ?? 0) +
        (position.dividend_income ?? 0) +
        (position.options_income ?? 0);

      return {
        ...position,
        market_value: marketValue,
        unrealized_gain_loss: unrealizedGainLoss,
        total_gain_loss: totalGL,
      };
    }

    allPricesAvailable = false;
    return position;
  });

  return {
    cost_basis_total: data.cost_basis_total,
    market_value_total: allPricesAvailable ? marketValueTotal : null,
    unrealized_gain_loss: allPricesAvailable
      ? marketValueTotal - data.cost_basis_total
      : null,
    positions: updatedPositions,
  };
}
