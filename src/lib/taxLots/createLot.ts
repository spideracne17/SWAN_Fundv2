import type { AcquisitionType, LotStatus, TaxLotRecord } from '@/types/database';

/**
 * Input record representing a share purchase to be converted into a tax lot.
 */
export interface PurchaseRecord {
  account_id: string;
  symbol: string;
  acquisition_date: string;
  settlement_date?: string;
  shares_acquired: number;
  cost_per_share: number;
  fees?: number;
  acquisition_type?: AcquisitionType;
  source_transaction_hash?: string;
  drip_source_dividend_id?: string;
}

/**
 * Input record for creating a tax lot from a DRIP reinvestment.
 */
export interface DripReinvestmentRecord {
  account_id: string;
  symbol: string;
  acquisition_date: string;
  shares_acquired: number;
  cost_per_share: number;
  drip_source_dividend_id: string;
  source_transaction_hash?: string;
}

/**
 * Input record representing a transfer-in of shares with user-provided cost basis.
 */
export interface TransferInRecord {
  account_id: string;
  symbol: string;
  acquisition_date: string;
  shares_acquired: number;
  cost_per_share: number;
  total_cost_basis?: number;
  source_transaction_hash?: string;
}

/**
 * Creates an immutable tax lot record from a purchase.
 *
 * - status is always "open"
 * - remaining_shares equals shares_acquired
 * - total_cost_basis = shares_acquired × cost_per_share + fees
 * - acquisition_type defaults to "buy"
 * - split_adjusted defaults to false
 */
export function createLot(purchase: PurchaseRecord): TaxLotRecord {
  const fees = purchase.fees ?? 0;
  const totalCostBasis = purchase.shares_acquired * purchase.cost_per_share + fees;
  const now = new Date().toISOString();

  const lot: TaxLotRecord = {
    id: crypto.randomUUID(),
    account_id: purchase.account_id,
    symbol: purchase.symbol,
    acquisition_date: purchase.acquisition_date,
    settlement_date: purchase.settlement_date,
    shares_acquired: purchase.shares_acquired,
    remaining_shares: purchase.shares_acquired,
    cost_per_share: purchase.cost_per_share,
    total_cost_basis: totalCostBasis,
    acquisition_type: purchase.acquisition_type ?? 'buy',
    status: 'open' as LotStatus,
    fees,
    source_transaction_hash: purchase.source_transaction_hash,
    drip_source_dividend_id: purchase.drip_source_dividend_id,
    split_adjusted: false,
    created: now,
    updated: now,
  };

  return lot;
}

/**
 * Creates a tax lot from a DRIP reinvestment.
 *
 * - Sets acquisition_type to "drip"
 * - Links the lot to its source dividend via drip_source_dividend_id
 * - Fees default to 0 (DRIP reinvestments typically have no fees)
 */
export function createDripLot(reinvestment: DripReinvestmentRecord): TaxLotRecord {
  return createLot({
    account_id: reinvestment.account_id,
    symbol: reinvestment.symbol,
    acquisition_date: reinvestment.acquisition_date,
    shares_acquired: reinvestment.shares_acquired,
    cost_per_share: reinvestment.cost_per_share,
    acquisition_type: 'drip',
    drip_source_dividend_id: reinvestment.drip_source_dividend_id,
    source_transaction_hash: reinvestment.source_transaction_hash,
  });
}

/**
 * Creates an immutable tax lot record from a transfer-in with user-provided cost basis.
 *
 * - acquisition_type is always "transfer_in"
 * - status is always "open"
 * - remaining_shares equals shares_acquired
 * - If total_cost_basis is provided, uses it directly (user-provided);
 *   otherwise calculates as shares_acquired × cost_per_share
 * - split_adjusted defaults to false
 */
export function createTransferInLot(transfer: TransferInRecord): TaxLotRecord {
  const totalCostBasis =
    transfer.total_cost_basis ?? transfer.shares_acquired * transfer.cost_per_share;
  const now = new Date().toISOString();

  const lot: TaxLotRecord = {
    id: crypto.randomUUID(),
    account_id: transfer.account_id,
    symbol: transfer.symbol,
    acquisition_date: transfer.acquisition_date,
    settlement_date: undefined,
    shares_acquired: transfer.shares_acquired,
    remaining_shares: transfer.shares_acquired,
    cost_per_share: transfer.cost_per_share,
    total_cost_basis: totalCostBasis,
    acquisition_type: 'transfer_in',
    status: 'open' as LotStatus,
    fees: 0,
    source_transaction_hash: transfer.source_transaction_hash,
    split_adjusted: false,
    created: now,
    updated: now,
  };

  return lot;
}
