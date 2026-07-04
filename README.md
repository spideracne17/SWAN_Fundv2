# SWAN Fund — Sleep Well At Night

A personal investment tracking webapp: SPX credit spread trading engine, dividend portfolio operating system, CSV import from Schwab/Robinhood, tax-lot accounting (FIFO), and 7 dashboards.

---

## 🚀 Start the App (Local Development)

You need **2 terminals** open side by side. Copy/paste the commands below.

### Prerequisites (one-time setup)

- **Node.js v20+** — [download](https://nodejs.org/)
- **Git** — [download](https://git-scm.com/download/win)
- **PocketBase** — already included in `pocketbase/server/` (extract the zip if `pocketbase.exe` doesn't exist)

**PowerShell fix (run once):** If you get "running scripts is disabled" errors:
```powershell
Set-ExecutionPolicy -Scope CurrentUser -ExecutionPolicy RemoteSigned
```

If Node.js or Git aren't in your PATH, use full paths:
```
Node: "C:\Program Files\nodejs\npm.cmd"
Git:  "C:\Program Files\Git\bin\git.exe"
```

---

### Terminal 1 — Start PocketBase (Backend)

```powershell
# On PC (Millennium-Falcon):
cd C:\Users\Millennium-Falcon\Desktop\Kiro\pocketbase\server
.\pocketbase.exe serve

# On Laptop (X-Wing):
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
# On PC (Millennium-Falcon):
cd C:\Users\Millennium-Falcon\Desktop\Kiro
npm run dev

# On Laptop (X-Wing):
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

Your data persists in `pocketbase/server/pb_data/data.db`.

---

## 💾 Multi-Machine Database Sync

The PocketBase database (`pocketbase/server/pb_data/data.db`) contains all your financial data. To sync between machines:

### Before switching machines

```powershell
# 1. Stop PocketBase (Ctrl+C in Terminal 1)
# 2. Commit and push the database
& "C:\Program Files\Git\bin\git.exe" add -A
& "C:\Program Files\Git\bin\git.exe" commit -m "sync db"
& "C:\Program Files\Git\bin\git.exe" push
```

### On the other machine

```powershell
& "C:\Program Files\Git\bin\git.exe" pull
# Then start PocketBase + dev server as normal
```

### Rules

- **Always stop PocketBase before committing** — SQLite corrupts if copied while running
- **Always pull before starting work** — ensures latest database
- **Commit after imports** — so new transactions sync
- The `.db-shm` and `.db-wal` temp files are gitignored (they merge on clean shutdown)

### First-time on a new machine

If `pocketbase/server/pb_data/data.db` doesn't exist after cloning:
1. Extract `pocketbase.zip` → get `pocketbase.exe`
2. Create folder `pocketbase/server/pb_data/`
3. Copy `data.db` from your other machine (or follow First-Time PocketBase Setup below)

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
| **Import** | Drag/drop CSV/XLSX from Schwab or Robinhood |

---

## 📈 SPX Credit Spread Trading Engine — Strategy

A systematic, rules-based SPX put credit spread strategy. Removes emotion from every decision — entry, management, and exit.

### Market Condition System (VIX-Based)

| Condition | VIX Level | Color | Meaning |
|---|---|---|---|
| **Green** | Below 20 | `#00C087` | Normal operations — full size |
| **Yellow** | 20–25 | `#FFB800` | Caution — half size only, 90+120 DTE only |
| **Red** | 25–35 | `#FF4444` | Stop — no new trades, manage existing |
| **Black** | Above 35 | `#1A1A1A` | Emergency — close everything immediately |

### VIX Trend Patterns (Entry Signals)

| Pattern | Signal | When |
|---|---|---|
| **1 — Spiking** | Enter now | VIX > 20-day avg AND rising |
| **2 — Fading** | Enter now | VIX > 20-day avg AND falling (best R/R) |
| **3 — Elevated 3+ weeks** | Wait | Trending bear — don't enter |
| **4 — Low/below avg** | Skip | No premium, no cushion |

### Entry Rules

All must be true: Green/Yellow condition + Pattern 1 or 2 + slots available + market pulled back.

- Short strike: ~10% below current SPX
- Delta: 10–20 (Green), 8–12 (Yellow)
- Spread width: 5 points ($500 max risk per contract)
- Cash reserved per slot: $500

### DTE Ladder (Priority Order)

| Priority | DTE | Notes |
|---|---|---|
| P1 | 90 | Always first — best premium/time balance |
| P2 | 120 | Second — max buffer for slow recovery |
| P3 | 60–70 | Only if VIX > 20, NEVER in Yellow |
| P4 | 140–150 | Sparingly — delayed recovery scenarios |

### Position Management (Hold / Roll / Close)

| DTE | Drop | Condition | Action |
|---|---|---|---|
| Any | Any | Black (>35) | **CLOSE NOW** |
| Any | >15% in <4 weeks | Any | **CLOSE NOW** |
| <21 | Any | Any | **CLOSE** (time stop) |
| 21–45 | <10% | Green/Yellow | HOLD |
| 21–45 | 10–15% | Green/Yellow | ROLL (4–6 weeks out, lower strike) |
| 21–45 | >15% | Any | CLOSE |
| 45–60 | <15% | Green/Yellow | HOLD |
| 60+ | <15% | Green/Yellow | HOLD |

### 7 Non-Negotiable Rules

1. Close at 50% profit
2. Close at 21 DTE regardless
3. Enter on dips only
4. 90 DTE first, always
5. No 60-day spreads in Yellow
6. Half size in Yellow
7. Black means close everything

### Exit Rules

- **Profit target:** Close at 50% of max premium collected
- **Time stop:** Close at 21 DTE no matter what
- **Loss limit:** Spread width minus premium = defined max loss (no stop-loss needed)

### Trade Capacity

- Max simultaneous positions: 10 slots
- $500 reserved per slot
- Max 30% of slots on single underlying
- Avoid entries within 3 days of FOMC/CPI/NFP

---

## 💎 Dividend Portfolio OS v6 — Strategy

**Goal**: Build a high-quality dividend portfolio focused on qualified dividends, Dividend Aristocrats/Kings, dividend growth, valuation discipline, monthly income smoothing, and retirement income readiness.

### V1 — Quality Scoring Engine

Each stock scored 0–100 across 6 weighted factors:

| Factor | Weight |
|---|---:|
| Chowder Rule (Yield + 5yr Growth) | 25% |
| Yield vs 5-Year Average Yield | 25% |
| Dividend Growth Rate | 20% |
| P/E Valuation | 15% |
| 52-Week Position (% below high) | 10% |
| Payout Ratio | 5% |

**Ratings:** Strong Buy ≥90 • Buy ≥80 • Watch ≥70 • Pass <70

**Eligible universe:** Dividend Kings, Dividend Aristocrats, investment-grade balance sheets, positive FCF, qualified dividends. Excludes most REITs, BDCs, MLPs.

### V2 — Income Smoothing Engine

Stocks grouped by payment schedule to ensure monthly income:

| Group | Months |
|---|---|
| **A** | Jan / Apr / Jul / Oct |
| **B** | Feb / May / Aug / Nov |
| **C** | Mar / Jun / Sep / Dec |

- Target: Annual Income ÷ 12 each month
- Coverage Score: 0–100 (95+ = Excellent, 90–94 = Good, 80–89 = Acceptable)
- Gap Analyzer identifies weakest month and capital needed to fill it

### V3 — Portfolio Construction Rules

| Rule | Target |
|---|---:|
| Minimum Quality Score | 80 |
| Qualified Dividends | Required |
| Monthly Coverage Score | >90 |
| Single Position Maximum | 5% |
| Sector Maximum | 20% |

Priority: Quality → Dividend Safety → Growth → Valuation → Smoothing

### V4 — Capital Allocation Engine

Answers: **"Where should my next dollar go?"**

Priority order:
1. Quality Score ≥ 80 (Strong Buy / Buy only)
2. Fill weakest income month (underweight calendar group)
3. Buy undervalued holdings (relative yield > 110%)
4. Maintain diversification (respect position/sector caps)

Output: "Invest $X → 40% ABBV, 35% JNJ, 25% PEP" with dollar amounts.

### V5 — Dividend Growth Forecast

Projects future income at 1, 3, 5, 10, 20 years using three scenarios:
- **Conservative:** 50% of historical growth rate
- **Base Case:** Historical growth rate
- **Optimistic:** 125% of historical growth rate

Includes contribution impact (new money deployed monthly at average yield).

### V6 — Retirement Income Readiness

- **FI Score** = Annual Dividend Income ÷ Annual Expenses
- Estimates years to Dividend Independence
- User-editable Annual Expenses field (never hardcoded)

| Coverage | Status |
|---|---|
| 25% | Early Stage |
| 50% | Progressing |
| 75% | Near Goal |
| 100% | Financial Independence |
| 125%+ | Excess Income |

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
| Stock prices | Yahoo Finance (primary) → Alpha Vantage (fallback) | 24 hours in localStorage |
| Fundamentals (P/E, 52W, div yield) | Yahoo (ETFs) / Alpha Vantage (stocks) | 7 days in localStorage |
| SPX + VIX (trading engine) | Yahoo Finance via CORS proxy | 24 hours in localStorage |
| Schwab API (planned) | OAuth2 — positions, quotes, delta | — |

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
