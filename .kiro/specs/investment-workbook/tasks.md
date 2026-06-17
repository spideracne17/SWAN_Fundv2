# Implementation Plan: Investment Workbook

## Overview

This plan implements the Investment Workbook webapp — a personal investment tracking system with CSV import from Schwab/Robinhood, tax-lot accounting (FIFO), options trading analytics, trade capacity management, market color regime system, and 6 dashboards. The stack is React + TypeScript on Netlify with PocketBase/SQLite on pockethost.io.

## Tasks

- [x] 1. Project Setup and Configuration
  - [x] 1.1 Initialize React + TypeScript project with Vite, configure ESLint, Prettier, and path aliases
  - [x] 1.2 Install core dependencies: PocketBase JS SDK, SheetJS (xlsx), date-fns, crypto-js, TanStack Query, Recharts
  - [x] 1.3 Install dev dependencies: Vitest, fast-check, @testing-library/react
  - [x] 1.4 Configure PocketBase client with environment variable for API URL (VITE_POCKETBASE_URL)
  - [x] 1.5 Create PocketBase schema migration script defining all tables: accounts, instruments, settings, tax_lots, dispositions, option_positions, option_spreads, cash_transactions, dividends, csv_import_log, stock_splits, ira_contributions, sweep_balances, market_events
  - [x] 1.6 Seed default settings records for all categories (market_color, trade_capacity, tax, display, import, performance, risk) with documented defaults
  - [x] 1.7 Seed the 4 account records (2 Schwab taxable, 1 Schwab Roth IRA, 1 Robinhood Traditional IRA)
  - [x] 1.8 Configure Netlify deployment with build settings and environment variables
- [x] 2. CSV Import Pipeline - Format Detection and Parsing
  - [x] 2.1 Implement detectBrokerFormat(headerRow) that identifies Schwab Taxable, Schwab Roth IRA, and Robinhood formats from header columns
  - [x] 2.2 Implement drag-and-drop file upload component with visual drop zone feedback and file type validation (CSV/XLSX only)
  - [x] 2.3 Implement SheetJS-based file parser that reads CSV and XLSX files client-side and returns raw row arrays
  - [x] 2.4 Write unit tests for format detection covering all 3 formats plus unrecognized header error case
  - [x] 2.5 Write unit tests for file parsing with sample CSV content for each broker format
- [x] 3. CSV Import Pipeline - Data Normalization
  - [x] 3.1 Implement normalizeDate(raw, format) handling MM/DD/YYYY, YYYY-MM-DD, and "as of" patterns returning ISO 8601
  - [x] 3.2 Implement parseAmount(raw) handling $, commas, parenthesized negatives, empty strings, and edge cases
  - [x] 3.3 Implement mapActionToType(action, format) with complete mapping tables for Schwab and Robinhood actions
  - [x] 3.4 Implement normalizeRecords(rows, format, accountId) orchestrating all normalization steps into NormalizedRecord array
  - [x] 3.5 Write unit tests for date normalization (Schwab MM/DD/YYYY, "as of" dates, Robinhood ISO dates)
  - [x] 3.6 Write unit tests for amount parsing (positive, negative, parenthesized, empty, currency symbols)
  - [x] 3.7 Write unit tests for action mapping covering all known actions per broker plus unknown action error
  - [x] 3.8 Write property-based tests: for any valid date string normalizeDate returns valid ISO date; for any formatted amount parseAmount returns finite number
- [x] 4. CSV Import Pipeline - Deduplication and Validation
  - [x] 4.1 Implement computeRecordHash(record) using SHA-256 over canonical fields (account_id, transaction_date, transaction_type, symbol, quantity, total_amount)
  - [x] 4.2 Implement validateAndDeduplicate(records) that checks existing hashes in database and validates required fields
  - [x] 4.3 Implement file-level hash check (SHA-256 of entire file) against csv_import_log for full-file dedup warning
  - [x] 4.4 Write unit tests for hash computation determinism and uniqueness
  - [x] 4.5 Write property-based tests: for any two distinct records their hashes differ; same record always produces same hash
- [x] 5. CSV Import Pipeline - DRIP Pairing and Import Execution
  - [x] 5.1 Implement pairDripRecords(records) that matches dividends with same-day reinvestments by symbol
  - [x] 5.2 Implement importRecords(validated) that batch-upserts to PocketBase in groups of 50, creates lots for purchases/DRIPs, and logs to csv_import_log
  - [x] 5.3 Implement JSON backup generation: serialize imported records plus metadata, trigger browser download as investment_backup_YYYY-MM-DD.json
  - [x] 5.4 Implement import progress UI component showing parsing, validation, import, and backup stages
  - [x] 5.5 Implement import summary UI showing counts (new, duplicate, error) and error details (row, field, value, message)
  - [x] 5.6 Write unit tests for DRIP pairing: matched pairs, unmatched dividends (cash), orphan reinvestments flagged
  - [x] 5.7 Write integration test for full import flow: parse, normalize, deduplicate, pair, import, backup
- [x] 6. Tax-Lot Accounting Engine - Lot Creation
  - [x] 6.1 Implement createLot(purchase) that creates immutable lot record with status open, calculates total_cost_basis including fees
  - [x] 6.2 Implement lot creation from DRIP reinvestment with acquisition_type drip and link to source dividend
  - [x] 6.3 Implement lot creation from transfer-in with user-provided cost basis
  - [x] 6.4 Write unit tests for lot creation verifying all fields, status, and cost basis arithmetic
- [x] 7. Tax-Lot Accounting Engine - FIFO Disposition
  - [x] 7.1 Implement disposeLotsFIFO(sale, openLots) with FIFO ordering, partial consumption, and status transitions
  - [x] 7.2 Implement getHoldingPeriod(acquisitionDate, dispositionDate) using greater-than-365-days rule
  - [x] 7.3 Implement gain/loss calculation per disposition: (proceeds_per_share - cost_basis_per_share) times shares_disposed
  - [x] 7.4 Implement InsufficientLotsError when sale quantity exceeds available shares with no lots modified on error
  - [x] 7.5 Write unit tests for FIFO ordering across multiple lots with different acquisition dates
  - [x] 7.6 Write unit tests for partial lot consumption and status transitions (open to partial to closed)
  - [x] 7.7 Write unit tests for holding period boundary: 365 days equals short-term, 366 days equals long-term
  - [x] 7.8 Write property-based tests: for any valid sale and lot set, sum of disposed shares equals sale quantity; all lot remaining_shares stay non-negative
- [x] 8. Tax-Lot Accounting Engine - Stock Splits
  - [x] 8.1 Implement adjustLotsForSplit(symbol, ratioFrom, ratioTo, splitDate) adjusting shares and cost_per_share while preserving total_cost_basis
  - [x] 8.2 Implement stock split detection from CSV import (Schwab action Stock Split)
  - [x] 8.3 Store split record in stock_splits table with ratio, date, and lots_adjusted count
  - [x] 8.4 Write unit tests for 4:1 forward split: shares times 4, cost divided by 4, total unchanged
  - [x] 8.5 Write unit tests for 1:4 reverse split: shares divided by 4, cost times 4, total unchanged
  - [x] 8.6 Write property-based test: for any valid split ratio and lot, total_cost_basis before equals total_cost_basis after
- [x] 9. Options Position Tracking - Symbol Parsing
  - [x] 9.1 Implement parseOptionSymbol(raw, format) handling Schwab format (SPX 01/19/2024 4800.00 P) and Robinhood OCC format (SPX240119P04800000)
  - [x] 9.2 Implement OptionParseError with raw value for unrecognized formats
  - [x] 9.3 Write unit tests for Schwab option symbol parsing with various underlyings, dates, strikes, and types
  - [x] 9.4 Write unit tests for Robinhood OCC symbol parsing including edge cases (1-6 char underlyings, fractional strikes)
  - [x] 9.5 Write property-based test: for any generated valid OCC symbol, parsing and re-serializing produces the original
- [x] 10. Options Position Tracking - Spread Linking and Lifecycle
  - [x] 10.1 Implement spread detection logic linking short plus long legs into SpreadPosition records (put_credit_spread, covered_call, csp)
  - [x] 10.2 Implement net_credit and max_loss calculations for linked spreads
  - [x] 10.3 Implement roll chain management: detect same-day close plus open on same underlying, assign shared roll_chain_id
  - [x] 10.4 Implement expiration handling: OTM sets status expired with full premium realized as profit
  - [x] 10.5 Implement assignment handling for short puts: create tax lot with cost_basis equals strike minus premium
  - [x] 10.6 Implement assignment handling for covered calls: dispose lot with proceeds equals strike plus premium
  - [x] 10.7 Write unit tests for spread linking with matching and non-matching legs
  - [x] 10.8 Write unit tests for roll chain grouping across multiple roll events
  - [x] 10.9 Write unit tests for expiration and assignment flows with correct P&L and lot effects
- [x] 11. Trade Capacity Engine
  - [x] 11.1 Implement getAvailableSlots(accountId) reading total_slots from settings and counting open spreads
  - [x] 11.2 Implement getCapacityByColor(marketColor) returning GREEN equals full, YELLOW equals half, RED equals 1, BLACK equals 0
  - [x] 11.3 Implement reserveSlot(accountId, spread) with market color enforcement and collateral validation
  - [x] 11.4 Implement releaseSlot(reservationId) for closed or expired spreads
  - [x] 11.5 Implement collateral calculation: spread_width times contracts times 100, validate against available buying power
  - [x] 11.6 Write unit tests for slot availability calculation with various open position counts
  - [x] 11.7 Write unit tests for capacity limits at each market color level
  - [x] 11.8 Write unit tests for reservation denial when market color or collateral blocks the trade
- [x] 12. Market Condition Color System
  - [x] 12.1 Implement calculateMarketColor(snapshot, thresholds) with BLACK priority, then RED, YELLOW, GREEN logic
  - [x] 12.2 Implement settings-driven threshold loading from PocketBase settings table with fallback defaults
  - [x] 12.3 Implement GoogleFinance market data fetching (VIX, SPX price, 50DMA, 200DMA) with 60-second polling during market hours
  - [x] 12.4 Implement staleness detection: show indicator when data older than 30 minutes, disable new trade capacity
  - [x] 12.5 Implement market hours detection (9:30 AM to 4:00 PM ET weekdays) to control polling behavior
  - [x] 12.6 Write unit tests for color calculation at all boundary values (GREEN to YELLOW, YELLOW to RED, any to BLACK)
  - [x] 12.7 Write property-based tests: for any valid MarketSnapshot calculateMarketColor returns exactly one valid color; if VIX exceeds black_threshold result is always BLACK
- [x] 13. Dashboard - Accounting and Net Worth
  - [x] 13.1 Implement Accounting dashboard data aggregation: total cost basis, market value using live prices, unrealized gain/loss across all accounts
  - [x] 13.2 Implement realized gain/loss YTD calculation from dispositions table
  - [x] 13.3 Implement net worth calculation: tax-adjusted values (Roth at face, Traditional at face times (1 minus marginal_rate), taxable with capital gains tax)
  - [x] 13.4 Implement Accounting dashboard UI with positions table, summary cards, and net worth breakdown
  - [x] 13.5 Write unit tests for net worth tax adjustment calculations
- [x] 14. Dashboard - Trader
  - [x] 14.1 Implement Trader dashboard data aggregation: current market color, open spreads with P&L and DTE, slot availability
  - [x] 14.2 Implement win rate calculation: profitable_closes divided by total_closes times 100 for option positions
  - [x] 14.3 Implement capital efficiency calculation: annualized_premium_collected divided by average_collateral_deployed
  - [x] 14.4 Implement Trader dashboard UI with market color indicator, spread table, slot meter, and performance metrics
  - [x] 14.5 Write unit tests for win rate and capital efficiency calculations
- [x] 15. Dashboard - Retirement
  - [x] 15.1 Implement Retirement dashboard: Roth IRA and Traditional IRA contribution tracking with current year remaining room
  - [x] 15.2 Implement tax-adjusted portfolio values: Roth at face value, Traditional at face times (1 minus marginal_tax_rate)
  - [x] 15.3 Implement Retirement dashboard UI with contribution progress bars and account summaries
  - [x] 15.4 Write unit tests for contribution room calculation against IRS annual limits
- [x] 16. Dashboard - Income
  - [x] 16.1 Implement Income dashboard: aggregate dividend income, options income, and interest income by period
  - [x] 16.2 Implement hourly equivalents: 40hr equals total_income divided by 2080, 24hr equals total_income divided by 1248
  - [x] 16.3 Implement period filtering: MTD, QTD, YTD, trailing 12 months
  - [x] 16.4 Implement Income dashboard UI with income breakdown chart, hourly comparisons, and period selector
  - [x] 16.5 Write unit tests for hourly equivalent calculations and period filtering logic
- [x] 17. Dashboard - Tax
  - [x] 17.1 Implement Tax dashboard: short-term gains, long-term gains, qualified dividends, ordinary dividends for selected tax year
  - [x] 17.2 Implement wash sale detection: identify sales where substantially identical security was purchased within 31 days
  - [x] 17.3 Implement tax-loss harvest opportunity detection: positions with unrealized loss exceeding 1000 dollars not wash-sale restricted
  - [x] 17.4 Implement Tax dashboard UI with gains breakdown, dividend classification, wash sale list, and TLH opportunities
  - [x] 17.5 Write unit tests for wash sale detection across 31-day window
  - [x] 17.6 Write unit tests for TLH opportunity identification with wash sale exclusion
- [x] 18. Dashboard - Risk
  - [x] 18.1 Implement Risk dashboard: concentration risk (each holding as percent of total portfolio) with threshold flagging from settings
  - [x] 18.2 Implement maximum drawdown calculation from historical portfolio values
  - [x] 18.3 Implement Risk dashboard UI with concentration chart, drawdown visualization, and flagged positions
  - [x] 18.4 Write unit tests for concentration calculation and threshold flagging
- [x] 19. Application Shell and Navigation
  - [x] 19.1 Implement app shell with responsive layout working on desktop Chrome and iPhone Chrome
  - [x] 19.2 Implement navigation between 6 dashboards plus Import page plus Settings page
  - [x] 19.3 Implement Settings management UI for viewing and editing all settings by category
  - [x] 19.4 Implement PocketBase authentication flow (single user, personal tool)
  - [x] 19.5 Implement TanStack Query configuration for data fetching with cache invalidation on imports
  - [x] 19.6 Write integration tests for navigation routing and settings CRUD

## Task Dependency Graph

```json
{
  "waves": [
    {"wave": 1, "tasks": ["1"]},
    {"wave": 2, "tasks": ["2", "19"]},
    {"wave": 3, "tasks": ["3", "6", "9"]},
    {"wave": 4, "tasks": ["4", "7", "8", "10", "12"]},
    {"wave": 5, "tasks": ["5", "11"]},
    {"wave": 6, "tasks": ["13", "14", "15", "16", "17", "18"]}
  ]
}
```

## Notes

- Property-based tests (tasks 3.8, 4.5, 7.8, 8.6, 9.5, 12.7) use fast-check library and validate core correctness properties from the design document
- PocketBase schema (task 1.5) should be created as a JSON migration file that can be imported via PocketBase admin UI or API
- GoogleFinance integration (task 12.3) may require a proxy or scraping approach since there is no official API — consider using a CORS proxy or server-side function if direct client access is blocked
- Batch size of 50 for PocketBase imports (task 5.2) is chosen to stay within free tier rate limits
- All monetary calculations should use integer cents internally to avoid floating-point precision issues
- The wash sale detection (task 17.2) should look both 31 days before AND 31 days after the sale date per IRS rules
