import { useEffect, useState } from 'react';
import { usePageTitle } from '@/hooks/usePageTitle';
import {
  loadOptionsAccounting,
  type OptionsAccountingSummary,
  type SpreadTrade,
} from '@/lib/options/optionsAccounting';
import { loadLocalSettings } from '@/lib/dividendEngine/localSettings';
import { getAccountValue, type DataSource } from '@/lib/schwab/dataService';
import TradingEnginePanel from '@/components/trader/TradingEnginePanel';
import './TraderPage.css';

/* ─── Constants ────────────────────────────────────────────────────────── */

interface SchwabSpread {
  shortSymbol: string;
  longSymbol: string;
  shortStrike: number;
  longStrike: number;
  expiration: string;
  spreadWidth: number;
  shortQty: number;
  shortAvgPrice: number;
  longAvgPrice: number;
  netCredit: number;
  currentShortValue: number;
  currentLongValue: number;
  unrealizedPnL: number;
  dte: number;
}

const SPREAD_WIDTH_DOLLARS = 500; // 5-point spread × $100 multiplier
const SCHWAB_SPREADS_ACCOUNT_ID = '562upqkz5ba4e16';

/* ─── Helpers ──────────────────────────────────────────────────────────── */

function formatCurrency(value: number): string {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(value);
}

function formatCurrencyDecimal(value: number): string {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(value);
}

function formatPrice(value: number): string {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(value);
}

function formatDateStr(dateStr: string): string {
  const d = new Date(dateStr + 'T12:00:00');
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

function getPnLClass(value: number): string {
  if (value > 0) return 'pnl--positive';
  if (value < 0) return 'pnl--negative';
  return '';
}

function getDteFromToday(expirationDate: string): number {
  const exp = new Date(expirationDate + 'T16:00:00');
  const now = new Date();
  return Math.round((exp.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
}

function daysBetweenDates(dateA: string, dateB: string): number {
  const a = new Date(dateA + 'T12:00:00');
  const b = new Date(dateB + 'T12:00:00');
  return Math.round(Math.abs(b.getTime() - a.getTime()) / (1000 * 60 * 60 * 24));
}

/* ─── Component ────────────────────────────────────────────────────────── */

function TraderPage() {
  usePageTitle('SPX Credit Spreads');

  const [optionsData, setOptionsData] = useState<OptionsAccountingSummary | null>(null);
  const [accountValue, setAccountValue] = useState(loadLocalSettings().spreadsAccountValue);
  const [dataSource, setDataSource] = useState<DataSource>('default');
  const [schwabPositions, setSchwabPositions] = useState<SchwabSpread[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    async function loadData() {
      try {
        setLoading(true);
        setError(null);

        // Fetch account value (Schwab → cache → settings fallback)
        const acctResult = await getAccountValue();
        // Use the spreads account (0626) cash balance
        const spreadsAcct = acctResult.data.accounts.find(a => a.accountNumber.endsWith('0626') || a.accountNumber.endsWith('1626'));
        setAccountValue(spreadsAcct?.cashBalance ?? acctResult.data.totalValue);
        setDataSource(acctResult.source);

        // Fetch live option positions from Schwab
        try {
          const tokenResp = await fetch('/schwab-trading-tokens.json');
          if (tokenResp.ok) {
            const tokens = await tokenResp.json();
            if (tokens.access_token) {
              const posResp = await fetch('/schwab-api/trader/v1/accounts?fields=positions', {
                headers: { 'Authorization': `Bearer ${tokens.access_token}` },
              });
              if (posResp.ok) {
                const allAccounts = await posResp.json();
                const spreadsAccount = allAccounts.find((a: { securitiesAccount: { accountNumber: string } }) =>
                  a.securitiesAccount.accountNumber.endsWith('1626') || a.securitiesAccount.accountNumber.endsWith('0626')
                );
                const positions = spreadsAccount?.securitiesAccount?.positions ?? [];
                const optionPositions = positions.filter((p: { instrument: { assetType: string } }) => p.instrument.assetType === 'OPTION');

                // Pair into spreads (short + long at same expiry)
                const shorts = optionPositions.filter((p: { shortQuantity: number }) => p.shortQuantity > 0);
                const longs = optionPositions.filter((p: { longQuantity: number }) => p.longQuantity > 0);
                const spreads: SchwabSpread[] = [];

                for (const short of shorts) {
                  // Parse option symbol: SPX   YYMMDDP/CSTRIKE
                  const shortSym = short.instrument.symbol as string;
                  const shortMatch = shortSym.match(/(\d{6})([PC])(\d+)/);
                  if (!shortMatch) continue;

                  const expStr = shortMatch[1]; // YYMMDD
                  const shortStrike = parseInt(shortMatch[3]) / 1000;

                  // Find matching long leg (same expiry, nearby strike)
                  const longLeg = longs.find((l: { instrument: { symbol: string } }) => {
                    const lSym = l.instrument.symbol as string;
                    return lSym.includes(expStr);
                  });

                  const longSym = longLeg?.instrument?.symbol ?? '';
                  const longMatch = longSym.match(/(\d{6})([PC])(\d+)/);
                  const longStrike = longMatch ? parseInt(longMatch[3]) / 1000 : shortStrike - 5;

                  const exp = `20${expStr.slice(0,2)}-${expStr.slice(2,4)}-${expStr.slice(4,6)}`;
                  const dte = Math.round((new Date(exp + 'T16:00:00').getTime() - Date.now()) / (1000 * 60 * 60 * 24));

                  const netCredit = (short.averagePrice - (longLeg?.averagePrice ?? 0));

                  spreads.push({
                    shortSymbol: shortSym,
                    longSymbol: longSym,
                    shortStrike,
                    longStrike,
                    expiration: exp,
                    spreadWidth: Math.abs(shortStrike - longStrike),
                    shortQty: short.shortQuantity,
                    shortAvgPrice: short.averagePrice,
                    longAvgPrice: longLeg?.averagePrice ?? 0,
                    netCredit,
                    currentShortValue: Math.abs(short.marketValue) / 100,
                    currentLongValue: longLeg ? Math.abs(longLeg.marketValue) / 100 : 0,
                    unrealizedPnL: (netCredit - (Math.abs(short.marketValue) / 100 - (longLeg ? Math.abs(longLeg.marketValue) / 100 : 0))),
                    dte,
                  });
                }

                setSchwabPositions(spreads);
              }
            }
          }
        } catch (err) {
          console.warn('Failed to fetch Schwab positions:', err);
        }

        const accounting = await loadOptionsAccounting(SCHWAB_SPREADS_ACCOUNT_ID);
        setOptionsData(accounting);
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to load data');
      } finally {
        setLoading(false);
      }
    }
    loadData();
  }, []);

  if (loading) {
    return (
      <div className="page trader-page">
        <h2>SPX Credit Spreads</h2>
        <div className="trader-loading">Loading market data and options…</div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="page trader-page">
        <h2>SPX Credit Spreads</h2>
        <div className="trader-error">
          <p>{error}</p>
          <button className="trader-btn" onClick={() => window.location.reload()}>
            Retry
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="page trader-page">
      <h2>SPX Credit Spreads</h2>
      <p className="trader-subtitle">
        Schwab Spreads • ...0626 • Portfolio OS v3
        <span className={`data-source-badge data-source-badge--${dataSource}`}>
          {dataSource === 'schwab' ? '🟢 Live' : dataSource === 'cache' ? '🟡 Cached' : '⚪ Settings'}
        </span>
      </p>

      {/* Trading Engine (signals, market conditions, checklist, efficiency, monthly chart) */}
      <TradingEnginePanel accountValue={accountValue} optionsData={optionsData} liveOpenCount={schwabPositions.length} />

      {/* Options P&L Summary */}
      {(() => {
        // Use Schwab live data if available, otherwise fall back to PocketBase
        const liveMaxLoss = schwabPositions.length > 0
          ? schwabPositions.reduce((sum, sp) => sum + (sp.spreadWidth * 100 - sp.netCredit * 100), 0)
          : (optionsData?.maxLossExposure ?? 0);
        const liveUnrealizedPnL = schwabPositions.length > 0
          ? schwabPositions.reduce((sum, sp) => sum + sp.unrealizedPnL * 100, 0)
          : (optionsData?.totalUnrealizedPnL ?? 0);
        const livePremium = schwabPositions.length > 0
          ? schwabPositions.reduce((sum, sp) => sum + sp.netCredit * 100, 0)
          : (optionsData?.totalPremiumReceived ?? 0);

        return (
          <div className="trader-card trader-card--pnl">
            <h3>Options P&L</h3>
            <div className="pnl-grid">
              <div className="pnl-card pnl-card--exposure">
                <span className="pnl-card-label">Max Loss Exposure</span>
                <span className="pnl-card-value pnl--negative">
                  {formatCurrency(liveMaxLoss)}
                </span>
                <span className="pnl-card-sub">Collateral reserved</span>
              </div>
              <div className="pnl-card pnl-card--unrealized">
                <span className="pnl-card-label">Unrealized (Open)</span>
                <span className={`pnl-card-value ${getPnLClass(liveUnrealizedPnL)}`}>
                  {formatCurrencyDecimal(liveUnrealizedPnL)}
                </span>
                <span className="pnl-card-sub">Premium received, not yet expired</span>
              </div>
              <div className="pnl-card pnl-card--realized">
                <span className="pnl-card-label">Realized P&L</span>
                <span className={`pnl-card-value ${getPnLClass(optionsData?.totalRealizedPnL ?? 0)}`}>
                  {formatCurrencyDecimal(optionsData?.totalRealizedPnL ?? 0)}
                </span>
                <span className="pnl-card-sub">Closed + expired trades</span>
              </div>
              <div className="pnl-card pnl-card--total">
                <span className="pnl-card-label">Total Premium Received</span>
                <span className="pnl-card-value pnl--positive">
                  {formatCurrencyDecimal(livePremium)}
                </span>
                <span className="pnl-card-sub">{schwabPositions.length > 0 ? 'Open positions' : 'All time'}</span>
              </div>
            </div>
          </div>
        );
      })()}

      {/* Open Positions — Live from Schwab */}
      {schwabPositions.length > 0 && (
        <div className="trader-card trader-card--positions">
          <h3>Open Positions <span className="data-source-badge data-source-badge--schwab">🟢 Live</span></h3>
          <div className="positions-table-wrapper">
            <table className="positions-table">
              <thead>
                <tr>
                  <th>Expiration</th>
                  <th>DTE</th>
                  <th>Short Strike</th>
                  <th>Long Strike</th>
                  <th>Width</th>
                  <th>Net Credit</th>
                  <th>Current Value</th>
                  <th>P&L</th>
                </tr>
              </thead>
              <tbody>
                {schwabPositions.map((sp, i) => {
                  const dteClass = sp.dte <= 7 ? 'dte--urgent' : sp.dte <= 21 ? 'dte--warning' : '';
                  return (
                    <tr key={i}>
                      <td>{sp.expiration}</td>
                      <td className={dteClass}>{sp.dte}</td>
                      <td className="strike-value">{formatPrice(sp.shortStrike)}</td>
                      <td className="strike-value">{formatPrice(sp.longStrike)}</td>
                      <td>${sp.spreadWidth}</td>
                      <td className="pnl--positive">{formatCurrencyDecimal(sp.netCredit)}</td>
                      <td>{formatCurrencyDecimal(sp.currentShortValue - sp.currentLongValue)}</td>
                      <td className={sp.unrealizedPnL >= 0 ? 'pnl--positive' : 'pnl--negative'}>
                        {formatCurrencyDecimal(sp.unrealizedPnL)}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Open Positions — From PocketBase (fallback) */}
      {optionsData && optionsData.openPositions.length > 0 && (
        <div className="trader-card trader-card--positions">
          <h3>Open Positions</h3>
          <div className="positions-table-wrapper">
            <table className="positions-table">
              <thead>
                <tr>
                  <th>Opened</th>
                  <th>Expiration</th>
                  <th>DTE</th>
                  <th>Type</th>
                  <th>Short Strike</th>
                  <th>Long Strike</th>
                  <th>Width</th>
                  <th>Premium</th>
                  <th>Max Loss</th>
                </tr>
              </thead>
              <tbody>
                {optionsData.openPositions.map((pos) => (
                  <OpenPositionRow key={pos.id} position={pos} />
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Closed Trade History */}
      {optionsData && (optionsData.closedPositions.length > 0 || optionsData.expiredPositions.length > 0) && (
        <div className="trader-card trader-card--history">
          <h3>Closed Trade History</h3>
          <div className="positions-table-wrapper">
            <table className="positions-table">
              <thead>
                <tr>
                  <th>Symbol</th>
                  <th>Type</th>
                  <th>Opened</th>
                  <th>Closed / Exp</th>
                  <th>Contracts</th>
                  <th>Potential Profit</th>
                  <th>Actual Profit</th>
                  <th>Money at Risk</th>
                  <th>% of Total</th>
                  <th>DTE</th>
                  <th>Days Held</th>
                  <th>$/Day</th>
                  <th>Status</th>
                </tr>
              </thead>
              <tbody>
                {[...optionsData.closedPositions, ...optionsData.expiredPositions]
                  .sort((a, b) => (b.closeDate ?? '').localeCompare(a.closeDate ?? ''))
                  .map((pos) => (
                    <ClosedPositionRow key={pos.id} position={pos} />
                  ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Empty state */}
      {optionsData && optionsData.totalTrades === 0 && (
        <div className="trader-card trader-card--empty">
          <p className="empty-message">
            No option trades found. Import your Schwab spreads account CSV to populate this dashboard.
          </p>
        </div>
      )}
    </div>
  );
}

/* ─── Sub-components ───────────────────────────────────────────────────── */

function OpenPositionRow({ position }: { position: SpreadTrade }) {
  const dte = getDteFromToday(position.expirationDate);
  const dteClass = dte <= 7 ? 'dte--urgent' : dte <= 21 ? 'dte--warning' : '';

  return (
    <tr>
      <td>{formatDateStr(position.openDate)}</td>
      <td>{formatDateStr(position.expirationDate)}</td>
      <td className={dteClass}>{dte}</td>
      <td>{position.optionType === 'P' ? 'Put' : 'Call'}</td>
      <td className="strike-value">{formatPrice(position.shortStrike)}</td>
      <td className="strike-value">
        {position.longStrike > 0 ? formatPrice(position.longStrike) : '—'}
      </td>
      <td>${position.spreadWidth}</td>
      <td className="pnl--positive">{formatCurrencyDecimal(position.premiumReceived)}</td>
      <td className="pnl--negative">{formatCurrency(position.maxLoss)}</td>
    </tr>
  );
}

function ClosedPositionRow({ position }: { position: SpreadTrade }) {
  // Potential profit = premium received (max you can make if it expires OTM)
  const potentialProfit = position.premiumReceived;
  // Actual profit
  const actualProfit = position.realizedPnL ?? 0;
  // Money at risk = max loss (spread width * 100)
  const moneyAtRisk = position.maxLoss;
  // % of total = actual profit / potential profit * 100
  const pctOfTotal = potentialProfit > 0 ? (actualProfit / potentialProfit) * 100 : 0;
  // $/day = actual profit / days held
  const daysHeld = position.daysHeld ?? 1;
  const moneyPerDay = daysHeld > 0 ? actualProfit / daysHeld : 0;
  // DTE = days from open to expiration
  const dte = daysBetweenDates(position.openDate, position.expirationDate);

  return (
    <tr>
      <td className="symbol-cell">{position.underlying}</td>
      <td>{position.optionType === 'P' ? 'Put' : 'Call'}</td>
      <td>{formatDateStr(position.openDate)}</td>
      <td>{position.closeDate ? formatDateStr(position.closeDate) : '—'}</td>
      <td>{position.contracts ?? 1}</td>
      <td className="pnl--positive">{formatCurrencyDecimal(potentialProfit)}</td>
      <td className={getPnLClass(actualProfit)}>{formatCurrencyDecimal(actualProfit)}</td>
      <td>{formatCurrency(moneyAtRisk)}</td>
      <td className={getPnLClass(pctOfTotal)}>{pctOfTotal.toFixed(0)}%</td>
      <td>{dte}</td>
      <td>{daysHeld}</td>
      <td className={getPnLClass(moneyPerDay)}>{formatCurrencyDecimal(moneyPerDay)}</td>
      <td>
        <span className={`status-badge status-badge--${position.status}`}>
          {position.status}
        </span>
      </td>
    </tr>
  );
}

export default TraderPage;
