# Investment Workbook

A personal investment tracking webapp with CSV import from Schwab/Robinhood, tax-lot accounting (FIFO), options trading analytics, trade capacity management, market color regime system, and 6 dashboards.

## Quick Start (Local Development)

### Prerequisites

- **Node.js** (v20+) — installed at `C:\Program Files\nodejs\`
- **PocketBase** — already extracted to `pocketbase/server/pocketbase.exe`

### Step 1: Start PocketBase

Open a terminal (Command Prompt or PowerShell) and run:

```cmd
cd C:\Users\Millennium-Falcon\Desktop\Kiro\pocketbase\server
.\pocketbase.exe serve
```

You should see:
```
Server started at http://127.0.0.1:8090
├─ REST API:  http://127.0.0.1:8090/api/
└─ Dashboard: http://127.0.0.1:8090/_/
```

**Leave this terminal open.** PocketBase must be running for the app to work.

### Step 2: Start the App

Open a **second** terminal and run:

```cmd
cd C:\Users\Millennium-Falcon\Desktop\Kiro
npm run dev
```

You should see:
```
VITE v6.4.3  ready in ~200ms
➜  Local:   http://localhost:5173/
```

### Step 3: Open in Browser

Go to **http://localhost:5173/** in Chrome.

### Step 4: Log In

- **Email:** user@example.com
- **Password:** password123456

You'll land on the Accounting Dashboard.

---

## How to Use

### Importing Transactions

1. Navigate to the **Import** page (sidebar → 📥 Import)
2. Drag and drop a CSV or XLSX file from Schwab or Robinhood onto the drop zone
3. The system will:
   - Detect the broker format automatically
   - Parse and normalize all records
   - Skip duplicates (same file won't import twice)
   - Pair DRIP dividends with reinvestments
   - Create tax lots for purchases
   - Download a JSON backup automatically
4. You'll see a summary showing new/duplicate/error counts

### Supported CSV Formats

| Broker | Account Type | Key Headers |
|--------|-------------|-------------|
| Schwab | Taxable (Spreads) | Action, Symbol, Fees & Comm |
| Schwab | Roth IRA | Action, Symbol (no Fees & Comm) |
| Robinhood | Traditional IRA | Trans Code, Instrument, Activity Date |

### Accounts (Import Order)

1. **Schwab Spreads** (Taxable) — ...0626
2. **Robinhood** (Traditional IRA) — ...0002
3. **Schwab Roth IRA** — ...0212
4. **Schwab Traditional IRA** — ...0617

### Dashboards

- **Accounting** — Positions per account (color-coded), cost basis, market value, unrealized G/L, P/E, 52W High/Low (color-coded), dividend yield, ex-div date, net worth breakdown
- **Trader** — SPX trade planning (52W range, strike targets 10-15% below market), options P&L (max loss exposure, unrealized, realized, total premium), slot management, performance metrics (win rate, avg days held, capital efficiency), closed trade history with assignment detection
- **Retirement** — IRA contribution tracking (Roth/Traditional), remaining room, monthly deposits, years-to-retirement warnings
- **Income** — Dividend/options/interest income by period (MTD/QTD/YTD/12M), hourly equivalents (40hr work week + 24/7), monthly dividend breakdown table
- **Tax** — Short/long-term gains, dividends, wash sales, TLH opportunities
- **Risk** — Concentration risk, max drawdown, flagged positions

### Settings

Navigate to **Settings** (sidebar → ⚙️) to configure:
- Market color thresholds (VIX levels, SPX conditions)
- Trade capacity (total slots, spread width, DTE minimum)
- Tax rates (marginal, long-term, short-term)
- Display preferences
- Import settings
- Risk thresholds

### PocketBase Admin

Access the admin panel at **http://127.0.0.1:8090/_/** to:
- View/edit raw data in any collection
- Manage users
- Export/import data

**Admin login:**
- Email: admin@investmentworkbook.local
- Password: admin123456

---

## Market Data Sources

| Data | Source | Cache |
|------|--------|-------|
| Stock prices (VGT, ADM, etc.) | Alpha Vantage GLOBAL_QUOTE → Yahoo Finance fallback | 24 hours in memory |
| Fundamentals (P/E, 52W, div yield) | Alpha Vantage OVERVIEW | 24 hours in localStorage |
| SPX price + 52W range | Yahoo Finance (^GSPC) via CORS proxy | 24 hours in memory |
| Schwab positions/quotes (planned) | Schwab Developer API (OAuth2) | — |

---

## Stopping the App

1. Press `Ctrl+C` in the Vite terminal (stops the frontend)
2. Press `Ctrl+C` in the PocketBase terminal (stops the backend)

Your data persists in `pocketbase/server/pb_data/` — it'll be there next time you start PocketBase.

---

## Project Structure

```
├── src/                    # React frontend source
│   ├── components/         # Reusable UI components
│   ├── contexts/           # React context (auth)
│   ├── hooks/              # Custom hooks (auth, market data)
│   ├── lib/                # Business logic
│   │   ├── dashboards/     # Dashboard data aggregation
│   │   ├── import/         # CSV import pipeline (parse, normalize, dedup, import)
│   │   ├── market/         # Stock prices + fundamentals (Alpha Vantage, Yahoo)
│   │   ├── options/        # Options tracking + accounting (spread detection, P&L)
│   │   ├── taxLots/        # Tax-lot accounting engine (FIFO)
│   │   └── tradeCapacity/  # Slot management
│   ├── pages/              # Dashboard page components
│   └── types/              # TypeScript type definitions
├── pocketbase/
│   ├── server/             # PocketBase binary + data
│   ├── migrations/         # Schema definition (pb_schema.json)
│   └── seeds/              # Seed data (settings, accounts)
├── .env                    # Environment variables (local)
├── netlify.toml            # Netlify deployment config
└── package.json            # Dependencies and scripts
```

---

## Available Scripts

| Command | Description |
|---------|-------------|
| `npm run dev` | Start Vite dev server (http://localhost:5173) |
| `npm run build` | TypeScript check + production build |
| `npm run test` | Run all 358 tests |
| `npm run lint` | Run ESLint |
| `npm run format` | Format with Prettier |

---

## Troubleshooting

**"npm is not recognized"**
→ Make sure Node.js is installed and in your PATH. Try running from Command Prompt instead of PowerShell.

**App shows "Loading..." forever**
→ Make sure PocketBase is running in a separate terminal (`.\pocketbase.exe serve`).

**Login fails**
→ Verify PocketBase has the users collection with the test user. Check the admin panel at http://127.0.0.1:8090/_/

**CSV import shows "FormatDetectionError"**
→ The file headers don't match any known broker format. Check that you're using an unmodified export from Schwab or Robinhood.
