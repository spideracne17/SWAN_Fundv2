# SWAN Fund — Sleep Well At Night

A personal investment tracking webapp: SPX credit spread trading engine, dividend portfolio operating system, CSV import from Schwab/Robinhood, tax-lot accounting (FIFO), and 7 dashboards.

---

## 🚀 Start the App (Local Development)

You need **2 terminals** open side by side. Copy/paste the commands below.

### Prerequisites (one-time setup)

- **Node.js v20+** — [download](https://nodejs.org/)
- **Git** — [download](https://git-scm.com/download/win)
- **PocketBase** — already included in `pocketbase/server/` (extract the zip if `pocketbase.exe` doesn't exist)

If Node.js or Git aren't in your PATH, use full paths:
```
Node: "C:\Program Files\nodejs\npm.cmd"
Git:  "C:\Program Files\Git\bin\git.exe"
```

---

### Terminal 1 — Start PocketBase (Backend)

```powershell
cd C:\Users\X-Wing\Desktop\Kiro\SWAN_Fund-main\pocketbase\server
.\pocketbase.exe serve
```

You should see:
```
Server started at http://127.0.0.1:8090
├─ REST API:  http://127.0.0.1:8090/api/
└─ Dashboard: http://127.0.0.1:8090/_/
```

**Leave this terminal open.** Don't close it.

---

### Terminal 2 — Start the App (Frontend)

```powershell
cd C:\Users\X-Wing\Desktop\Kiro\SWAN_Fund-main
npm run dev
```

You should see:
```
VITE v6.4.3  ready in ~200ms
➜  Local:   http://localhost:5173/
```

**Leave this terminal open too.**

---

### Open in Browser

Go to **http://localhost:5173/** in Chrome.

---

### Log In

| | |
|---|---|
| **Email** | user@example.com |
| **Password** | password123456 |

---

### First-Time PocketBase Setup

If this is a fresh install (no existing `pb_data/` folder), you need to set up the database:

1. Open **http://127.0.0.1:8090/_/** in browser
2. Create an admin account: `admin@investmentworkbook.local` / `admin123456`
3. Create a `users` collection (type: Auth)
4. Add a record: email `user@example.com`, password `password123456`

Now the app login will work.

---

### Stopping the App

1. Press `Ctrl+C` in Terminal 2 (stops frontend)
2. Press `Ctrl+C` in Terminal 1 (stops backend)

Your data persists in `pocketbase/server/pb_data/`.

---

## 🌐 Live Website (Future — Netlify + PocketHost)

When deployed, no terminals needed. Just open the URL.

| Environment | Frontend | Backend |
|---|---|---|
| **Local Dev** | http://localhost:5173 | http://127.0.0.1:8090 |
| **Production** | https://swan-fund.netlify.app *(TBD)* | https://swan-fund.pockethost.io *(TBD)* |

### Deploy Frontend (Netlify)

1. Connect GitHub repo to Netlify
2. Build command: `npm run build`
3. Publish directory: `dist`
4. Set env variable: `VITE_POCKETBASE_URL=https://your-instance.pockethost.io`

### Deploy Backend (PocketHost)

1. Create account at [pockethost.io](https://pockethost.io)
2. Create instance (free tier works)
3. Import schema from `pocketbase/migrations/pb_schema.json`
4. Create users and seed data

---

## 📊 Dashboards

| Tab | What It Does |
|-----|-------------|
| **Full Portfolio** | Positions per account, cost basis, market value, P/E, 52W, dividend yield |
| **Trader** | SPX credit spread engine — VIX conditions, pattern signals, DTE ladder, position alerts, 7 rules |
| **Dividends** | Quality scoring, income smoothing (calendar groups), capital allocation, growth forecast, FI score |
| **Retirement** | IRA contributions, remaining room, years-to-retirement |
| **Tax** | Short/long-term gains, wash sales, TLH opportunities |
| **Risk** | Concentration risk, max drawdown, flagged positions |
| **Import** | Drag/drop CSV/XLSX from Schwab or Robinhood |

---

## 🔧 Git Workflow

```powershell
# Check status
& "C:\Program Files\Git\bin\git.exe" status

# Stage all changes
& "C:\Program Files\Git\bin\git.exe" add -A

# Commit
& "C:\Program Files\Git\bin\git.exe" commit -m "your message here"

# Push to GitHub
& "C:\Program Files\Git\bin\git.exe" push
```

---

## How to Use

### Importing Transactions

1. Navigate to **Import** (sidebar → 📥)
2. Drag and drop a CSV or XLSX file onto the drop zone
3. The system auto-detects broker format, deduplicates, pairs DRIPs, creates tax lots, and downloads a backup
4. Summary shows new/duplicate/error counts

### Supported Formats

| Broker | Account Type | Key Headers |
|--------|-------------|-------------|
| Schwab | Taxable (Spreads) | Action, Symbol, Fees & Comm |
| Schwab | Roth IRA | Action, Symbol (no Fees & Comm) |
| Robinhood | Traditional IRA | Trans Code, Instrument, Activity Date |

### PocketBase Admin

Access **http://127.0.0.1:8090/_/** to view/edit raw data, manage users, export/import.

- Email: `admin@investmentworkbook.local`
- Password: `admin123456`

---

## Market Data Sources

| Data | Source | Cache |
|------|--------|-------|
| Stock prices | Alpha Vantage → Yahoo Finance fallback | 24 hours |
| Fundamentals (P/E, 52W, div yield) | Alpha Vantage OVERVIEW | 24 hours |
| SPX + VIX (trading engine) | Yahoo Finance via CORS proxy | 24 hours |

---

## Project Structure

```
├── src/
│   ├── components/            # UI components
│   ├── contexts/              # Auth context
│   ├── hooks/                 # Custom hooks
│   ├── lib/
│   │   ├── dashboards/        # Dashboard aggregation
│   │   ├── dividendEngine/    # Dividend OS v6 (quality, smoothing, allocation, forecast, FI)
│   │   ├── import/            # CSV import pipeline
│   │   ├── market/            # Stock prices + fundamentals
│   │   ├── options/           # Options tracking + accounting
│   │   ├── taxLots/           # Tax-lot engine (FIFO)
│   │   ├── tradeCapacity/     # Slot management
│   │   └── tradingEngine/     # SPX trading engine (signals, conditions, alerts, DTE ladder)
│   ├── pages/                 # Dashboard pages
│   └── types/                 # TypeScript types
├── pocketbase/
│   ├── server/                # PocketBase binary + data
│   ├── migrations/            # Schema (pb_schema.json)
│   └── seeds/                 # Seed data
├── .env                       # Environment variables
├── netlify.toml               # Netlify config
└── package.json               # Dependencies
```

---

## Available Scripts

| Command | Description |
|---------|-------------|
| `npm run dev` | Start dev server (http://localhost:5173) |
| `npm run build` | TypeScript check + production build |
| `npm run test` | Run all tests |
| `npm run lint` | ESLint |
| `npm run format` | Prettier |

---

## Troubleshooting

**"npm is not recognized"**
→ Node.js isn't in PATH. Use full path: `& "C:\Program Files\nodejs\npm.cmd" run dev`

**App shows "Loading..." forever**
→ PocketBase isn't running. Start it in Terminal 1.

**Login fails**
→ Fresh PocketBase needs the `users` collection + test user created (see First-Time Setup above).

**"git is not recognized"**
→ Use full path: `& "C:\Program Files\Git\bin\git.exe" status`
