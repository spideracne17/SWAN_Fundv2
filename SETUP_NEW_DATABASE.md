# How to Set Up a Fresh Database

Copy-paste this ENTIRE message to Kiro when starting a new database on any machine.

---

## PASTE THIS TO KIRO:

```
I need you to set up a fresh PocketBase database for my SWAN Fund app. Here's what to do:

1. Stop PocketBase if running
2. Delete the pb_data folder: pocketbase/server/pb_data/
3. Start PocketBase fresh
4. Create superuser: admin@investmentworkbook.local / admin123456
5. Run the setup script: node schwab/setup-db-full.mjs (or create collections manually)
6. Create user: user@example.com / password123456
7. Accounts to create:
   - "Schwab Spreads" (schwab, taxable, 0626)
   - "Robinhood" (robinhood, traditional_ira, 0002) 
   - "Schwab Roth IRA" (schwab, roth_ira, 0212)
   - "Schwab Traditional IRA" (schwab, traditional_ira, 0617)

IMPORTANT — After importing CSV files:
- VGT had an 8:1 stock split in April 2026
- Robinhood CSV shows PRE-SPLIT data (~214 shares at ~$550/share for Roth, ~160 for Traditional, ~54 for Robinhood)
- CORRECT post-split numbers: multiply shares by 8, divide cost_per_share by 8
- Roth: 1683.305 shares, cost basis $116,491.39
- Traditional: 1280.2673 shares, cost basis $86,010.81
- Robinhood: 433.4432 shares, cost basis $30,627
- Apply the split to all VGT tax_lots in PocketBase after import

Stocks I NO LONGER OWN (filter these out of Full Portfolio display):
- SLVO, EV, T1, TSLA

My CURRENT Robinhood holdings (as of July 2026):
- ADM: 41.583972 shares, avg cost $60.58
- HRL: 110.27033 shares, avg cost $31.40
- KMB: 24.151617 shares, avg cost $115.65
- KO: 5.879726 shares, avg cost $64.16
- MCD: 12.751661 shares, avg cost $258.42
- NEE: 1.895446 shares, avg cost $74.08
- SWK: 1 share, avg cost $92.15
- TGT: 10 shares, avg cost $130.99
- VGT: 433.4432 shares, avg cost $70.67
- NASA: 100 shares, avg cost $37.00

These numbers are HARDCODED in AccountingPage.tsx as ROBINHOOD_ACTUAL_SHARES.
If holdings change, update that constant directly — do NOT rely on PocketBase FIFO math.

Schwab accounts (live from API, don't touch):
- Roth: VGT 1683.305 shares
- Traditional: VGT 1280.2673 shares  
- Spreads: SPX credit spreads (live positions from API)

Schwab API setup:
- Two developer apps: "SwanFund_Market_Data" (port 5555) and "SwanFund_Accounts_Trading_Production" (port 3000)
- Run: node schwab/auth.mjs (market data)
- Run: node schwab/auth-trading.mjs (accounts)
- Tokens auto-refresh, re-auth every 7 days

The Dividends tab uses TARGET_PORTFOLIO in sampleData.ts — this is my WATCHLIST of Dividend Kings/Aristocrats I want to own. Keep all target stocks (including ones with 0 shares). Update sharesHeld for stocks I actually own.

DO NOT:
- Put "live data" in a separate section at the top of any page
- Change account names without asking
- Remove target stocks from the Dividends watchlist
- Change the import code or CSV parsing logic
```

---

## After Pasting the Above

Then import your 4 CSV files in this order:
1. Robinhood
2. Schwab Roth IRA  
3. Schwab Traditional IRA
4. Schwab Spreads

Then tell Kiro: "Apply the VGT 8:1 stock split to all VGT tax lots in PocketBase"
