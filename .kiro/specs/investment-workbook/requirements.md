# Requirements Document

## Introduction

This document defines the functional requirements for the Investment Workbook — a personal investment tracking and analytics webapp that consolidates data from 4 brokerage accounts (2 Schwab taxable, 1 Schwab Roth IRA, 1 Robinhood Traditional IRA). The system provides tax-lot accounting as the source of truth, options trading analytics, trade capacity management, and 6 purpose-built dashboards. It deploys as a React SPA on Netlify with a PocketBase/SQLite backend on pockethost.io.

## Glossary

- **Tax Lot**: An immutable record of a share acquisition with cost basis, used for gain/loss calculation on disposition
- **FIFO**: First In, First Out — the default lot selection method where oldest lots are sold first
- **DRIP**: Dividend Reinvestment Plan — automatically reinvesting dividends to purchase additional shares
- **Put Credit Spread**: An options strategy selling a higher-strike put and buying a lower-strike put for net credit
- **CSP**: Cash-Secured Put — selling a put option with full cash collateral to cover potential assignment
- **Covered Call**: Selling a call option backed by ownership of the underlying shares
- **Market Color**: A composite regime indicator (GREEN/YELLOW/RED/BLACK) derived from VIX, SPX moving averages, and IV rank
- **Slot**: A unit of collateral allocation for SPX spread positions
- **XIRR**: Extended Internal Rate of Return — time-weighted annualized return accounting for irregular cash flows
- **OCC Symbol**: Options Clearing Corporation standard format for option contract identifiers
- **DTE**: Days To Expiration — remaining calendar days until an option contract expires
- **Wash Sale**: IRS rule disallowing loss deduction when substantially identical securities are purchased within 31 days

## Requirements

### Requirement 1: CSV Import Pipeline

**User Story:** As an investor, I want to drag and drop CSV/XLSX export files from my Schwab and Robinhood accounts so that my transactions are automatically parsed, normalized, and imported without manual data entry.

#### Acceptance Criteria

- Given a CSV with headers containing "Action" and "Symbol" and "Fees & Comm", the system detects it as Schwab Taxable format
- Given a CSV with headers containing "Action" and "Symbol" without "Fees & Comm", the system detects it as Schwab Roth IRA format
- Given a CSV with headers containing "Activity Type" and "Instrument", the system detects it as Robinhood Traditional IRA format
- Given a CSV with unrecognized headers, a FormatDetectionError is displayed to the user with the detected headers shown
- Given a valid CSV or XLSX file up to 10MB, it is parsed entirely client-side using SheetJS in under 2 seconds
- Given a Schwab date in MM/DD/YYYY format, it is normalized to ISO 8601 (YYYY-MM-DD)
- Given a Schwab "as of" date like "01/15/2024 as of 01/14/2024", the first date (transaction date) is used
- Given amounts with "$", commas, or parentheses like "($1,234.56)", they are parsed to numeric value -1234.56
- Given a Schwab action "Buy", it maps to transaction_type "buy"; "Sell" maps to "sell"; "Qual Div" maps to "dividend"; "Reinvest Shares" maps to "reinvestment"; "Stock Split" maps to "split"
- Given a Robinhood activity "BUY" it maps to "buy"; "SELL" maps to "sell"; "DIV" and "CDIV" map to "dividend"
- Given an unmapped action string, an UnknownActionError is raised and the record is flagged for user review
- Given a record with account_id, transaction_date, transaction_type, symbol, quantity, and total_amount, a deterministic SHA-256 hash is computed for deduplication
- Given a record whose hash already exists in the database, it is skipped as a duplicate
- Given the same CSV file imported twice, zero new records are created on the second import
- Given a dividend and reinvestment record with the same symbol and transaction_date, they are paired as a DRIP with the tax lot linking to its source dividend
- Given a completed import, a csv_import_log record is created with filename, format, and counts (total, new, duplicate, error)
- Given an import with records_new > 0, a JSON backup file named "investment_backup_YYYY-MM-DD.json" is automatically downloaded

### Requirement 2: Tax-Lot Accounting Engine

**User Story:** As an investor, I want the system to maintain immutable tax lots for every share acquisition and automatically process sales using FIFO disposition so that I have accurate cost basis and gain/loss tracking for tax reporting.

#### Acceptance Criteria

- Given a buy transaction, a new tax lot is created with status "open", remaining_shares equal to shares_acquired, and total_cost_basis equal to shares_acquired × cost_per_share + fees
- Given a DRIP reinvestment, a lot is created with acquisition_type "drip" and drip_source_dividend_id linking to the source dividend record
- Given a sale of N shares, lots are consumed in order of acquisition_date ascending (FIFO — oldest first)
- Given a sale that partially consumes a lot, the lot's remaining_shares is reduced and status changes to "partial"
- Given a sale that fully consumes a lot, the lot's remaining_shares becomes 0 and status changes to "closed"
- Given the sum of all disposition shares_disposed for a single sale, it equals exactly the sale quantity
- Given insufficient open lots for the sale quantity, an InsufficientLotsError is raised and no lots are modified
- Given a lot acquired on 2023-01-15 and disposed on 2024-01-16 (>365 days), the holding_period is "long_term"
- Given a lot acquired on 2023-01-15 and disposed on 2024-01-15 (365 days), the holding_period is "short_term"
- Given a 4:1 forward stock split, affected lot shares_acquired and remaining_shares are multiplied by 4, cost_per_share is divided by 4, and total_cost_basis remains unchanged
- Given a split adjustment, original values are preserved in original_shares and original_cost_per_share fields and split_adjusted is set to true
- Given a split on symbol X, only lots with status "open" or "partial" acquired before the split date are adjusted

### Requirement 3: Options Position Tracking

**User Story:** As an options trader, I want the system to parse option symbols from both brokers, link spread legs together, track roll chains, and handle expirations/assignments so that I can analyze my options trading performance.

#### Acceptance Criteria

- Given a Schwab option symbol "SPX 01/19/2024 4800.00 P", it parses to underlying=SPX, expiration=2024-01-19, strike=4800, type=put
- Given a Robinhood option symbol "SPX240119P04800000", it parses to underlying=SPX, expiration=2024-01-19, strike=4800, type=put
- Given an invalid option symbol format, an OptionParseError is raised with the raw value for review
- Given a short put and long put on the same underlying and same expiration opened together, they are linked as a put_credit_spread with net_credit = short_premium - long_premium
- Given a linked spread, max_loss equals (spread_width × 100 × contracts) minus net_credit
- Given a short call with a matching stock holding in the same account, it is identified as a covered_call
- Given an option position closed and a new position opened on the same underlying on the same day, they share a roll_chain_id and the closed position's status is "rolled"
- Given an option expiring out-of-the-money, its status changes to "expired" and full premium is realized as profit
- Given a short put assigned, a new tax lot is created with cost_basis = strike_price - premium_received per share
- Given a covered call assigned, the underlying lot is disposed with proceeds = strike_price + premium_received per share

### Requirement 4: Trade Capacity Engine

**User Story:** As a disciplined options trader, I want the system to enforce slot-based position limits that automatically adjust based on market conditions so that I never over-allocate collateral or take excessive risk.

#### Acceptance Criteria

- Given a configured total_slots value in settings, the system displays used, available, and maximum slots
- Given each slot, collateral equals spread_width × contracts × 100 (e.g., 50-pt spread × 1 contract = $5,000)
- Given a new spread proposal when available_slots > 0, a slot is reserved and available_slots decreases by 1
- Given a closed or expired spread, its slot is released and available_slots increases by 1
- Given market color GREEN, max_new_positions equals the configured total slot count
- Given market color YELLOW, max_new_positions equals half the slot count (rounded down)
- Given market color RED, max_new_positions equals 1
- Given market color BLACK, max_new_positions equals 0 and no new positions can be opened
- Given available_slots > 0 but market color restricts further, the market color limit takes precedence
- Given all open spreads in an account, total_collateral_committed equals sum of all spread collateral requirements
- Given a new spread that would exceed available buying power minus committed collateral, the reservation is denied

### Requirement 5: Market Condition Color System

**User Story:** As a risk-aware trader, I want the system to automatically calculate a market regime color from VIX, SPX moving averages, and IV rank so that I can see at a glance whether conditions favor opening new positions.

#### Acceptance Criteria

- Given VIX ≤ green_vix_max (default 18), SPX above 50DMA, SPX above 200DMA, and IV rank ≤ 50, the market color is GREEN
- Given VIX > green_vix_max or SPX below 50DMA or IV rank > 50 (but not meeting RED/BLACK criteria), the color is YELLOW
- Given VIX > red_vix_max (default 25) and SPX below 200DMA, the color is RED
- Given VIX > black_vix_above (default 35), the color is BLACK regardless of all other values
- Given SPX drop exceeding black_spx_drop_pct (default -5%) relative to 200DMA, the color is BLACK regardless of other values
- Given all color thresholds stored in the settings table, changes take effect on the next calculation without code changes
- Given market hours (9:30 AM - 4:00 PM ET weekdays), market data is polled every 60 seconds from GoogleFinance
- Given outside market hours, the last market-hours snapshot is displayed with a stale indicator
- Given a GoogleFinance fetch failure or data older than 30 minutes, a staleness indicator is shown and new trade capacity is disabled

### Requirement 6: Dashboard System

**User Story:** As an investor, I want 6 purpose-built dashboards (Accounting, Trader, Retirement, Income, Tax, Risk) aggregating data across all accounts so that I can make informed decisions about my portfolio.

#### Acceptance Criteria

- Given the Accounting dashboard, it displays total cost basis (sum of all open lots), market value (using GoogleFinance prices), unrealized gain/loss, realized gain/loss YTD, and net worth (tax-adjusted)
- Given the Trader dashboard, it prominently displays current market color, open spreads with P&L and DTE, slot availability, and win rate (profitable_closes / total_closes × 100)
- Given the Trader dashboard, capital_efficiency is calculated as annualized_premium_collected / average_collateral_deployed
- Given the Retirement dashboard, it shows Roth IRA and Traditional IRA contribution amounts, remaining room for current year, and tax-adjusted portfolio values (Roth at face value, Traditional at face × (1 - marginal_rate))
- Given the Income dashboard, total investment income is the sum of dividend income, options income, and interest income for the selected period
- Given the Income dashboard, 40hr hourly equivalent is total_income ÷ (52 × 40) and 24hr equivalent is total_income ÷ (52 × 24)
- Given the Tax dashboard, it displays short-term gains, long-term gains, qualified dividends, and ordinary dividends separately for the tax year
- Given the Tax dashboard, tax-loss harvest opportunities are identified for positions with unrealized losses > $1,000 that are not wash-sale restricted
- Given the Risk dashboard, concentration risk shows each holding as percentage of total portfolio with flagging above the settings threshold

### Requirement 7: Application Architecture

**User Story:** As a user, I want to access my investment workbook via a URL in Chrome on desktop and iPhone, with drag-and-drop file import and automatic backups, so that I can manage my portfolio without needing app stores or terminal commands.

#### Acceptance Criteria

- Given the frontend, it deploys as a static React SPA to Netlify (free tier) accessible via URL in Chrome
- Given the backend, it runs as PocketBase (SQLite) on pockethost.io (free tier)
- Given the webapp URL, it is usable on both desktop Chrome and iPhone Chrome without App Store distribution
- Given the import interface, files are accepted via drag-and-drop with visual feedback on the drop zone
- Given a file drop, a progress indicator shows parsing, validation, and import stages sequentially
- Given a completed import, a summary displays records imported, duplicates skipped, and errors with row numbers
- Given a successful import with new records, a JSON backup is automatically triggered for download without user action
- Given all configurable values (thresholds, limits, colors, display preferences), they are stored in the settings table with category grouping and take effect without restart
- Given a new installation, all required default settings are seeded automatically
