/**
 * PocketBase Database Type Definitions
 *
 * These types mirror the PocketBase schema defined in pocketbase/migrations/pb_schema.json.
 * All records include PocketBase's auto-generated fields: id, created, updated.
 */

// ─── Base Record ─────────────────────────────────────────────────────────────

/** Fields automatically managed by PocketBase on every record. */
export interface BaseRecord {
  id: string;
  created: string;
  updated: string;
}

// ─── Enums / Unions ──────────────────────────────────────────────────────────

export type Broker = 'schwab' | 'robinhood';

export type AccountType = 'taxable' | 'roth_ira' | 'traditional_ira';

export type TaxStatus = 'taxable' | 'tax_deferred' | 'tax_free';

export type LotSelectionMethod = 'fifo' | 'lifo' | 'specific_id';

export type InstrumentType = 'stock' | 'etf' | 'option' | 'bond' | 'mutual_fund';

export type AcquisitionType = 'buy' | 'drip' | 'transfer_in' | 'exercise' | 'split_adjustment';

export type LotStatus = 'open' | 'partial' | 'closed';

export type HoldingPeriod = 'short_term' | 'long_term';

export type OptionType = 'call' | 'put';

export type OptionDirection = 'long' | 'short';

export type OptionPositionStatus = 'open' | 'closed' | 'expired' | 'assigned' | 'rolled';

export type SpreadType = 'put_credit_spread' | 'call_credit_spread' | 'covered_call' | 'csp';

export type SpreadStatus = 'open' | 'closed' | 'expired' | 'assigned';

export type DividendClassification = 'qualified' | 'ordinary' | 'return_of_capital' | 'section_199a';

export type ContributionType = 'regular' | 'catchup' | 'rollover';

export type MarketColor = 'GREEN' | 'YELLOW' | 'RED' | 'BLACK';

export type SettingsCategory =
  | 'market_color'
  | 'trade_capacity'
  | 'tax'
  | 'display'
  | 'import'
  | 'performance'
  | 'risk';

export type BrokerFormat =
  | 'schwab_taxable'
  | 'schwab_roth_ira'
  | 'robinhood_trad_ira';

// ─── Table Records ───────────────────────────────────────────────────────────

export interface AccountRecord extends BaseRecord {
  name: string;
  broker: Broker;
  account_type: AccountType;
  account_number_last4: string;
  tax_status: TaxStatus;
  is_active: boolean;
  default_lot_method: LotSelectionMethod;
}

export interface InstrumentRecord extends BaseRecord {
  symbol: string;
  name?: string;
  instrument_type: InstrumentType;
  underlying_symbol?: string;
}

export interface SettingsRecord extends BaseRecord {
  key: string;
  value: string; // JSON-encoded value
  category: SettingsCategory;
  description?: string;
}

export interface TaxLotRecord extends BaseRecord {
  account_id: string;
  symbol: string;
  instrument_id?: string;
  acquisition_date: string;
  settlement_date?: string;
  shares_acquired: number;
  remaining_shares: number;
  cost_per_share: number;
  total_cost_basis: number;
  acquisition_type: AcquisitionType;
  status: LotStatus;
  fees?: number;
  source_transaction_hash?: string;
  drip_source_dividend_id?: string;
  split_adjusted: boolean;
  original_shares?: number;
  original_cost_per_share?: number;
}

export interface DispositionRecord extends BaseRecord {
  lot_id: string;
  disposition_date: string;
  shares_disposed: number;
  proceeds_per_share: number;
  cost_basis_per_share: number;
  gain_loss: number;
  holding_period: HoldingPeriod;
  wash_sale_disallowed?: number;
}

export interface OptionPositionRecord extends BaseRecord {
  account_id: string;
  underlying_symbol: string;
  option_symbol: string;
  option_type: OptionType;
  direction: OptionDirection;
  strike_price: number;
  expiration_date: string;
  contracts: number;
  premium_per_contract: number;
  total_premium: number;
  status: OptionPositionStatus;
  spread_id?: string;
  roll_chain_id?: string;
  opened_date: string;
  closed_date?: string;
  close_premium?: number;
  pnl?: number;
  assignment_lot_id?: string;
  source_transaction_hash?: string;
}

export interface OptionSpreadRecord extends BaseRecord {
  spread_type: SpreadType;
  short_leg_id: string;
  long_leg_id?: string;
  underlying_symbol: string;
  net_credit: number;
  max_loss: number;
  collateral_required: number;
  breakeven: number;
  status: SpreadStatus;
}

export interface CashTransactionRecord extends BaseRecord {
  account_id: string;
  transaction_date: string;
  settlement_date?: string;
  transaction_type: string;
  symbol?: string;
  description?: string;
  quantity?: number;
  price_per_unit?: number;
  total_amount: number;
  fees?: number;
  source_format?: string;
  raw_action?: string;
  hash?: string;
}

export interface DividendRecord extends BaseRecord {
  account_id: string;
  symbol: string;
  ex_date: string;
  pay_date: string;
  record_date?: string;
  amount_per_share: number;
  total_amount: number;
  shares_held_at_ex: number;
  classification: DividendClassification;
  is_drip: boolean;
  drip_lot_id?: string;
  tax_year: number;
  form_1099_amount?: number;
  source_transaction_hash?: string;
}

export interface CSVImportLogRecord extends BaseRecord {
  filename: string;
  format_detected: string;
  account_id: string;
  import_date: string;
  records_total: number;
  records_new: number;
  records_duplicate: number;
  records_error: number;
  errors?: ImportError[];
  file_hash: string;
  backup_generated: boolean;
}

export interface ImportError {
  row_number: number;
  field: string;
  value: string;
  error: string;
}

export interface StockSplitRecord extends BaseRecord {
  symbol: string;
  split_date: string;
  ratio_from: number;
  ratio_to: number;
  effective_date: string;
  lots_adjusted?: number;
  applied: boolean;
  applied_date?: string;
}

export interface IRAContributionRecord extends BaseRecord {
  account_id: string;
  tax_year: number;
  contribution_date: string;
  amount: number;
  contribution_type: ContributionType;
  source?: string;
}

export interface SweepBalanceRecord extends BaseRecord {
  account_id: string;
  balance_date: string;
  amount: number;
  currency?: string;
}

export interface MarketEventRecord extends BaseRecord {
  event_date: string;
  event_type: string;
  vix_level?: number;
  spx_price?: number;
  spx_50dma?: number;
  spx_200dma?: number;
  iv_rank?: number;
  market_color?: MarketColor;
  notes?: string;
}

// ─── Collection Name Map ─────────────────────────────────────────────────────

/** Maps TypeScript record types to their PocketBase collection names. */
export type CollectionName =
  | 'accounts'
  | 'instruments'
  | 'settings'
  | 'tax_lots'
  | 'dispositions'
  | 'option_positions'
  | 'option_spreads'
  | 'cash_transactions'
  | 'dividends'
  | 'csv_import_log'
  | 'stock_splits'
  | 'ira_contributions'
  | 'sweep_balances'
  | 'market_events';

/** Utility type to look up the record type for a given collection name. */
export type RecordTypeMap = {
  accounts: AccountRecord;
  instruments: InstrumentRecord;
  settings: SettingsRecord;
  tax_lots: TaxLotRecord;
  dispositions: DispositionRecord;
  option_positions: OptionPositionRecord;
  option_spreads: OptionSpreadRecord;
  cash_transactions: CashTransactionRecord;
  dividends: DividendRecord;
  csv_import_log: CSVImportLogRecord;
  stock_splits: StockSplitRecord;
  ira_contributions: IRAContributionRecord;
  sweep_balances: SweepBalanceRecord;
  market_events: MarketEventRecord;
};
