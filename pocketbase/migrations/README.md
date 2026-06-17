# PocketBase Schema Migrations

## `pb_schema.json`

This file defines the schema for all 14 collections (tables) used by the Investment Workbook.

### How to Import

**Option 1: PocketBase Admin UI**

1. Open the PocketBase admin panel (e.g., `https://your-instance.pockethost.io/_/`)
2. Navigate to Settings → Import collections
3. Paste or upload the contents of `pb_schema.json`
4. Review and confirm the import

**Option 2: PocketBase Migrations API**

Use the PocketBase JS SDK to programmatically create collections:

```javascript
import PocketBase from 'pocketbase';
import schema from './pb_schema.json';

const pb = new PocketBase('http://127.0.0.1:8090');
await pb.admins.authWithPassword('admin@example.com', 'password');

for (const collection of schema) {
  await pb.collections.create(collection);
}
```

### Collections

| # | Collection | Description |
|---|-----------|-------------|
| 1 | `accounts` | Brokerage accounts (4 total: 2 Schwab taxable, 1 Roth, 1 Traditional) |
| 2 | `instruments` | Securities master list (stocks, ETFs, options, bonds, mutual funds) |
| 3 | `settings` | App configuration (thresholds, display prefs, etc.) |
| 4 | `tax_lots` | Tax lot accounting — single source of truth |
| 5 | `dispositions` | Sale/disposition records linked to tax lots |
| 6 | `option_positions` | Individual option legs (calls/puts, long/short) |
| 7 | `option_spreads` | Spread strategies linking option position legs |
| 8 | `cash_transactions` | All cash transactions from CSV imports |
| 9 | `dividends` | Dividend records with DRIP tracking |
| 10 | `csv_import_log` | Import audit trail with dedup hashes |
| 11 | `stock_splits` | Stock split events and lot adjustment tracking |
| 12 | `ira_contributions` | IRA contribution tracking by tax year |
| 13 | `sweep_balances` | Cash sweep/money market balances |
| 14 | `market_events` | Market condition snapshots (VIX, SPX, color) |

### TypeScript Types

Client-side type definitions are at `src/types/database.ts` and mirror this schema exactly.
