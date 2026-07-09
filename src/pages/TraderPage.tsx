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

const SPREAD_WIDTH_DOLLARS = 500; // 5-point spread × $100 multiplier
const SCHWAB_SPREADS_ACCOUNT_ID = '7oq9h56iacbrxj3';

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
      <TradingEnginePanel accountValue={accountValue} optionsData={optionsData} />

      {/* Options P&L Summary */}
      <div className="trader-card trader-card--pnl">
        <h3>Options P&L</h3>
        <div className="pnl-grid">
          <div className="pnl-card pnl-card--exposure">
            <span className="pnl-card-label">Max Loss Exposure</span>
            <span className="pnl-card-value pnl--negative">
              {formatCurrency(optionsData?.maxLossExposure ?? 0)}
            </span>
            <span className="pnl-card-sub">Collateral reserved</span>
          </div>
          <div className="pnl-card pnl-card--unrealized">
            <span className="pnl-card-label">Unrealized (Open)</span>
            <span className={`pnl-card-value ${getPnLClass(optionsData?.totalUnrealizedPnL ?? 0)}`}>
              {formatCurrencyDecimal(optionsData?.totalUnrealizedPnL ?? 0)}
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
              {formatCurrencyDecimal(optionsData?.totalPremiumReceived ?? 0)}
            </span>
            <span className="pnl-card-sub">All time</span>
          </div>
        </div>
      </div>

      {/* Open Positions */}
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
                  <th>DTE</th>
                  <th>Closed / Exp</th>
                  <th>Potential Profit</th>
                  <th>Actual Profit</th>
                  <th>Money at Risk</th>
                  <th>% of Total</th>
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
      <td>{dte}</td>
      <td>{position.closeDate ? formatDateStr(position.closeDate) : '—'}</td>
      <td className="pnl--positive">{formatCurrencyDecimal(potentialProfit)}</td>
      <td className={getPnLClass(actualProfit)}>{formatCurrencyDecimal(actualProfit)}</td>
      <td>{formatCurrency(moneyAtRisk)}</td>
      <td className={getPnLClass(pctOfTotal)}>{pctOfTotal.toFixed(0)}%</td>
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
