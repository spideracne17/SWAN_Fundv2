import { useEffect, useState, useCallback } from 'react';
import { usePageTitle } from '@/hooks/usePageTitle';
import {
  fetchAccountingData,
  fetchRealizedGainLoss,
  applyMarketPrices,
  type AccountingDashboardData,
  type RealizedGainLoss,
} from '@/lib/dashboards/accounting';
import HistoricalValueChart from '@/components/portfolio/HistoricalValueChart';
import {
  calculateNetWorth,
  type NetWorthBreakdown,
} from '@/lib/dashboards/netWorth';
import { fetchStockPrices } from '@/lib/market/fetchStockPrices';
import { fetchFundamentals, type StockFundamentals } from '@/lib/market/fetchFundamentals';
import './AccountingPage.css';

interface SchwabLivePosition {
  accountNumber: string;
  accountLabel: string;
  symbol: string;
  assetType: string;
  quantity: number;
  averagePrice: number;
  marketValue: number;
  costBasis: number;
  unrealizedGL: number;
  unrealizedGLPct: number;
}

interface SchwabAccountSummary {
  accountNumber: string;
  label: string;
  totalValue: number;
  cashBalance: number;
  positions: SchwabLivePosition[];
}

/** Robinhood account ID */
const ROBINHOOD_ACCOUNT_ID = 'f40o2d14e4a5r06';
const ROTH_ACCOUNT_ID = 'v22i77x6vd97w8w';
const TRAD_ACCOUNT_ID = '69o8emiuvma4ty9';
const IRA_ACCOUNT_IDS = [ROTH_ACCOUNT_ID, TRAD_ACCOUNT_ID];

/** Format a number as USD currency string */
function formatCurrency(value: number): string {
  return value.toLocaleString('en-US', {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

/** Return CSS class for positive/negative values */
function gainLossClass(value: number | null | undefined): string {
  if (value == null) return 'na';
  if (value > 0) return 'positive';
  if (value < 0) return 'negative';
  return '';
}

/** Get ex-dividend date urgency CSS class */
function getExDivClass(exDivDate: string | null): string {
  if (!exDivDate) return '';
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const exDate = new Date(exDivDate + 'T00:00:00');
  const diffMs = exDate.getTime() - today.getTime();
  const diffDays = diffMs / (1000 * 60 * 60 * 24);

  if (diffDays < 0) return ''; // already passed
  if (diffDays <= 3) return 'ex-div--urgent';
  if (diffDays <= 14) return 'ex-div--soon';
  if (diffDays <= 30) return 'ex-div--upcoming';
  return '';
}

/**
 * Get CSS class for % from 52W High column.
 * Based on how far below the 52W high the price is:
 * 0-15% below high = red (expensive, near the top)
 * 15-50% below high = yellow
 * 50-80% below high = light green
 * 80-100% below high = dark green (very cheap vs high)
 */
function getFromHighClass(pctFromHigh: number | null): string {
  if (pctFromHigh == null) return '';
  const distanceFromHigh = Math.abs(pctFromHigh); // pctFromHigh is negative (e.g., -5 means 5% below)
  if (distanceFromHigh <= 15) return 'range--red';
  if (distanceFromHigh <= 50) return 'range--yellow';
  if (distanceFromHigh <= 80) return 'range--light-green';
  return 'range--dark-green';
}

/**
 * Get CSS class for % from 52W Low column.
 * Based on how far above the 52W low the price is:
 * 0-10% above low = dark green (cheap, buy signal)
 * 10-30% above low = light green
 * 30-50% above low = yellow
 * 50%+ above low = red (expensive)
 */
function getFromLowClass(pctFromLow: number | null): string {
  if (pctFromLow == null) return '';
  if (pctFromLow <= 10) return 'range--dark-green';
  if (pctFromLow <= 30) return 'range--light-green';
  if (pctFromLow <= 50) return 'range--yellow';
  return 'range--red';
}

/**
 * Get CSS class for dividend yield:
 * >4% = dark green (buy signal)
 * 3-4% = light green
 * 2-3% = yellow
 * <2% = red (maybe wait)
 */
function getDivYieldClass(divYield: number | null | undefined): string {
  if (divYield == null) return '';
  if (divYield >= 4) return 'range--dark-green';
  if (divYield >= 3) return 'range--light-green';
  if (divYield >= 2) return 'range--yellow';
  return 'range--red';
}

/**
 * Get CSS class for P/E ratio:
 * <14 = dark green (cheap, buy)
 * 14-18 = light green
 * 18-30 = yellow
 * >30 = red (expensive)
 */
function getPEClass(pe: number | null | undefined): string {
  if (pe == null) return '';
  if (pe < 14) return 'range--dark-green';
  if (pe <= 18) return 'range--light-green';
  if (pe <= 30) return 'range--yellow';
  return 'range--red';
}

/** Account badge mapping */
const ACCOUNT_BADGE_MAP: Record<string, { label: string; className: string }> = {
  '562upqkz5ba4e16': { label: 'Spreads', className: 'account-badge--spreads' },
  'f40o2d14e4a5r06': { label: 'Robinhood', className: 'account-badge--robinhood' },
  'v22i77x6vd97w8w': { label: 'Roth', className: 'account-badge--roth' },
  '69o8emiuvma4ty9': { label: 'Traditional', className: 'account-badge--traditional' },
};

function AccountBadge({ accountId }: { accountId?: string }) {
  if (!accountId) return <span>—</span>;
  const badge = ACCOUNT_BADGE_MAP[accountId];
  if (!badge) return <span>—</span>;
  return (
    <span className={`account-badge ${badge.className}`}>{badge.label}</span>
  );
}

function AccountingPage() {
  usePageTitle('Portfolio');

  const [accountingData, setAccountingData] = useState<AccountingDashboardData | null>(null);
  const [realizedGL, setRealizedGL] = useState<RealizedGainLoss | null>(null);
  const [netWorth, setNetWorth] = useState<NetWorthBreakdown | null>(null);
  const [fundamentals, setFundamentals] = useState<Map<string, StockFundamentals>>(new Map());
  const [prices, setPrices] = useState<Map<string, number>>(new Map());
  const [schwabAccounts, setSchwabAccounts] = useState<SchwabAccountSummary[]>([]);
  const [schwabTotalValue, setSchwabTotalValue] = useState<number>(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const loadData = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);

      // Try Schwab first for live positions
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
              const accountLabels: Record<string, string> = {
                '89488212': 'Roth IRA',
                '97149617': 'Traditional IRA',
                '76771626': 'Schwab Spreads',
              };

              const summaries: SchwabAccountSummary[] = [];
              let total = 0;

              for (const acct of allAccounts) {
                const sa = acct.securitiesAccount;
                const acctNum = sa.accountNumber;
                const value = sa.currentBalances?.liquidationValue ?? 0;
                total += value;

                const positions: SchwabLivePosition[] = (sa.positions ?? [])
                  .filter((p: { instrument: { assetType: string } }) => p.instrument.assetType !== 'CURRENCY')
                  .map((p: { instrument: { symbol: string; assetType: string }; longQuantity: number; shortQuantity: number; averagePrice: number; marketValue: number; currentDayProfitLoss: number; currentDayProfitLossPercentage: number }) => {
                    const qty = p.longQuantity || -(p.shortQuantity || 0);
                    const cost = Math.abs(qty) * p.averagePrice;
                    const mktVal = p.marketValue;
                    const gl = mktVal - cost;
                    return {
                      accountNumber: acctNum,
                      accountLabel: accountLabels[acctNum] ?? `...${acctNum.slice(-4)}`,
                      symbol: p.instrument.symbol,
                      assetType: p.instrument.assetType,
                      quantity: qty,
                      averagePrice: p.averagePrice,
                      marketValue: mktVal,
                      costBasis: cost,
                      unrealizedGL: gl,
                      unrealizedGLPct: cost > 0 ? (gl / cost) * 100 : 0,
                    };
                  });

                summaries.push({
                  accountNumber: acctNum,
                  label: accountLabels[acctNum] ?? `...${acctNum.slice(-4)}`,
                  totalValue: value,
                  cashBalance: sa.currentBalances?.cashBalance ?? 0,
                  positions,
                });
              }

              setSchwabAccounts(summaries);
              setSchwabTotalValue(total);

              // Cache
              localStorage.setItem('schwab_portfolio_cache', JSON.stringify({ accounts: summaries, total, timestamp: Date.now() }));
            }
          }
        }
      } catch (err) {
        console.warn('Schwab portfolio fetch failed:', err);
        // Try cache
        try {
          const cached = localStorage.getItem('schwab_portfolio_cache');
          if (cached) {
            const { accounts, total } = JSON.parse(cached);
            setSchwabAccounts(accounts);
            setSchwabTotalValue(total);
          }
        } catch { /* ignore */ }
      }

      const [accounting, realized] = await Promise.all([
        fetchAccountingData(),
        fetchRealizedGainLoss(),
      ]);

      // Fetch live prices and fundamentals in parallel for all position symbols
      const symbols = accounting.positions.map((p) => p.symbol);
      let enrichedAccounting = accounting;

      if (symbols.length > 0) {
        const [priceMap, fundMap] = await Promise.all([
          fetchStockPrices(symbols),
          fetchFundamentals(symbols),
        ]);

        if (priceMap.size > 0) {
          enrichedAccounting = applyMarketPrices(accounting, priceMap);
          setPrices(priceMap);
        }

        setFundamentals(fundMap);
      }

      setAccountingData(enrichedAccounting);
      setRealizedGL(realized);

      // Calculate net worth by summing market values per account type
      const rothPositions = enrichedAccounting.positions.filter(p => p.account_id === 'vlubeg30nl05mm9');
      const tradPositions = enrichedAccounting.positions.filter(p => p.account_id === 'ncyrg5kkqts2e0r');
      const taxablePositions = enrichedAccounting.positions.filter(p => p.account_id === 'pd64pe7tiyvwro8' || p.account_id === '7oq9h56iacbrxj3');

      const rothValue = rothPositions.reduce((sum, p) => sum + (p.market_value ?? p.cost_basis), 0);
      const tradValue = tradPositions.reduce((sum, p) => sum + (p.market_value ?? p.cost_basis), 0);
      const taxableValue = taxablePositions.reduce((sum, p) => sum + (p.market_value ?? p.cost_basis), 0);
      const taxableUnrealizedGains = taxablePositions.reduce((sum, p) => sum + (p.unrealized_gain_loss ?? 0), 0);

      const nw = calculateNetWorth({
        rothValue,
        traditionalValue: tradValue,
        taxableValue,
        taxableUnrealizedGains,
        marginalRate: 0.24, // MFJ 24% bracket ($201,051–$383,900)
        longTermRate: 0.15, // MFJ 15% LTCG ($96,701–$600,050)
      });

      setNetWorth(nw);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load accounting data');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadData();
  }, [loadData]);

  // Calculate total Robinhood account value for weight calculation
  const robinhoodTotal = accountingData
    ? accountingData.positions
        .filter((p) => p.account_id === ROBINHOOD_ACCOUNT_ID)
        .reduce((sum, p) => sum + (p.market_value ?? p.cost_basis), 0)
    : 0;

  // Calculate total retirement (Roth + Traditional) for weight
  const retirementTotal = accountingData
    ? accountingData.positions
        .filter((p) => IRA_ACCOUNT_IDS.includes(p.account_id ?? ''))
        .reduce((sum, p) => sum + (p.market_value ?? p.cost_basis), 0)
    : 0;

  if (loading) {
    return (
      <div className="page accounting-page">
        <h2>Portfolio</h2>
        <div className="accounting-loading">Loading accounting data…</div>
      </div>
    );
  }

  if (error && !accountingData) {
    return (
      <div className="page accounting-page">
        <h2>Portfolio</h2>
        <div className="accounting-error">
          <p>{error}</p>
          <button className="accounting-retry-btn" onClick={loadData}>
            Retry
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="page accounting-page">
      <h2>Portfolio</h2>
      <p>Cost basis, market value, unrealized/realized gains, and net worth.</p>

      {/* Summary Cards */}
      <div className="accounting-cards">
        <div className="accounting-card">
          <p className="accounting-card-label">Total Cost Basis (how much you put in)</p>
          <p className="accounting-card-value">
            {accountingData ? formatCurrency(accountingData.cost_basis_total) : 'N/A'}
          </p>
        </div>
        <div className="accounting-card">
          <p className="accounting-card-label">Market Value (if you sold today)</p>
          <p className={`accounting-card-value ${accountingData?.market_value_total == null ? 'na' : ''}`}>
            {accountingData?.market_value_total != null ? formatCurrency(accountingData.market_value_total) : 'N/A'}
          </p>
        </div>
        <div className="accounting-card">
          <p className="accounting-card-label">Unrealized G/L (How much you could make)</p>
          <p className={`accounting-card-value ${gainLossClass(accountingData?.unrealized_gain_loss)}`}>
            {accountingData?.unrealized_gain_loss != null ? formatCurrency(accountingData.unrealized_gain_loss) : 'N/A'}
          </p>
        </div>
        <div className="accounting-card">
          <p className="accounting-card-label">Realized G/L (How much you've profited so far)</p>
          <p className={`accounting-card-value ${realizedGL ? gainLossClass(realizedGL.total) : 'na'}`}>
            {realizedGL ? formatCurrency(realizedGL.total) : 'N/A'}
          </p>
        </div>
      </div>

      {/* Detailed Positions Table (PocketBase — Robinhood + historical) */}
      <h3 className="accounting-section-title">Positions</h3>
      <div className="accounting-table-wrapper">
        <table className="accounting-table">
          <thead>
            <tr>
              <th>Account</th>
              <th>Symbol</th>
              <th className="numeric">Weight</th>
              <th className="numeric">Shares</th>
              <th className="numeric">Cost Basis</th>
              <th className="numeric">Market Value</th>
              <th className="numeric">Unrealized G/L</th>
              <th className="numeric">Realized G/L</th>
              <th className="numeric">Dividends</th>
              <th className="numeric">Options Income</th>
              <th className="numeric">Total G/L</th>
              <th className="numeric">Div Yield</th>
              <th className="numeric">P/E</th>
              <th className="numeric narrow-col">% from 52W High</th>
              <th className="numeric narrow-col">% from 52W Low</th>
              <th>Ex-Div Date</th>
            </tr>
          </thead>
          <tbody>
            {accountingData && accountingData.positions.length > 0 ? (
              accountingData.positions.map((position, idx, arr) => {
                const fund = fundamentals.get(position.symbol);
                const currentPrice = prices.get(position.symbol);

                // Weight: Robinhood = % of Robinhood, IRA = % of retirement
                const isRobinhood = position.account_id === ROBINHOOD_ACCOUNT_ID;
                const isIRA = IRA_ACCOUNT_IDS.includes(position.account_id ?? '');
                const positionValue = position.market_value ?? position.cost_basis;
                let weight: number | null = null;
                if (isRobinhood && robinhoodTotal > 0) {
                  weight = (positionValue / robinhoodTotal) * 100;
                } else if (isIRA && retirementTotal > 0) {
                  weight = (positionValue / retirementTotal) * 100;
                }

                // % from 52W High
                const pctFrom52High =
                  currentPrice != null && fund?.fiftyTwoWeekHigh != null
                    ? ((currentPrice - fund.fiftyTwoWeekHigh) / fund.fiftyTwoWeekHigh) * 100
                    : null;

                // % from 52W Low
                const pctFrom52Low =
                  currentPrice != null && fund?.fiftyTwoWeekLow != null
                    ? ((currentPrice - fund.fiftyTwoWeekLow) / fund.fiftyTwoWeekLow) * 100
                    : null;

                // Ex-div date class
                const exDivClass = fund ? getExDivClass(fund.exDividendDate) : '';

                // Detect boundary: only between Robinhood group and IRA group
                const prevIsRobinhood = idx > 0 && arr[idx - 1]?.account_id === ROBINHOOD_ACCOUNT_ID;
                const isBoundary = prevIsRobinhood && !isRobinhood;

                return (
                  <tr key={`${position.symbol}_${position.account_id ?? 'unknown'}`} className={isBoundary ? 'account-separator' : ''}>
                    <td><AccountBadge accountId={position.account_id} /></td>
                    <td className="symbol">{position.symbol}</td>
                    <td className="numeric">
                      {weight != null ? `${weight.toFixed(1)}%` : '—'}
                    </td>
                    <td className="numeric">
                      {position.shares.toLocaleString('en-US', { maximumFractionDigits: 4 })}
                    </td>
                    <td className="numeric">{formatCurrency(position.cost_basis)}</td>
                    <td className={`numeric ${position.market_value == null ? 'na' : ''}`}>
                      {position.market_value != null
                        ? formatCurrency(position.market_value)
                        : 'N/A'}
                    </td>
                    <td className={`numeric ${gainLossClass(position.unrealized_gain_loss)}`}>
                      {position.unrealized_gain_loss != null
                        ? formatCurrency(position.unrealized_gain_loss)
                        : 'N/A'}
                    </td>
                    <td className={`numeric ${gainLossClass(position.realized_gain_loss)}`}>
                      {position.realized_gain_loss ? formatCurrency(position.realized_gain_loss) : '—'}
                    </td>
                    <td className="numeric" style={{ color: '#66bb6a' }}>
                      {position.dividend_income ? formatCurrency(position.dividend_income) : '—'}
                    </td>
                    <td className="numeric" style={{ color: '#4fc3f7' }}>
                      {position.options_income ? formatCurrency(position.options_income) : '—'}
                    </td>
                    <td className={`numeric ${gainLossClass(position.total_gain_loss)}`} style={{ fontWeight: 600 }}>
                      {position.total_gain_loss ? formatCurrency(position.total_gain_loss) : '—'}
                    </td>
                    <td className={`numeric ${getDivYieldClass(fund?.dividendYield)}`}>
                      {fund?.dividendYield != null ? `${fund.dividendYield.toFixed(1)}%` : '—'}
                    </td>
                    <td className={`numeric ${getPEClass(fund?.peRatio)}`}>
                      {fund?.peRatio != null ? fund.peRatio.toFixed(1) : '—'}
                    </td>
                    <td className={`numeric ${getFromHighClass(pctFrom52High)}`}>
                      {pctFrom52High != null ? `${pctFrom52High.toFixed(1)}%` : '—'}
                    </td>
                    <td className={`numeric ${getFromLowClass(pctFrom52Low)}`}>
                      {pctFrom52Low != null ? `+${pctFrom52Low.toFixed(1)}%` : '—'}
                    </td>
                    <td className={exDivClass}>
                      {fund?.exDividendDate ?? '—'}
                    </td>
                  </tr>
                );
              })
            ) : (
              <tr>
                <td colSpan={12} className="accounting-table-empty">
                  No open positions found. Import transactions to see positions.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {/* Net Worth Breakdown */}
      {netWorth && (
        <div className="accounting-net-worth">
          <h3 className="accounting-section-title">Net Worth Breakdown</h3>
          <div className="accounting-net-worth-grid">
            <div className="accounting-net-worth-item">
              <span className="accounting-net-worth-label">Roth IRA</span>
              <span className="accounting-net-worth-value">
                {formatCurrency(netWorth.roth_value)}
              </span>
            </div>
            <div className="accounting-net-worth-item">
              <span className="accounting-net-worth-label">Traditional IRA (adjusted)</span>
              <span className="accounting-net-worth-value">
                {formatCurrency(netWorth.traditional_adjusted)}
              </span>
            </div>
            <div className="accounting-net-worth-item">
              <span className="accounting-net-worth-label">Taxable (adjusted)</span>
              <span className="accounting-net-worth-value">
                {formatCurrency(netWorth.taxable_adjusted)}
              </span>
            </div>
            <div className="accounting-net-worth-item">
              <span className="accounting-net-worth-label">Total Net Worth</span>
              <span className="accounting-net-worth-value total">
                {formatCurrency(netWorth.total_net_worth)}
              </span>
            </div>
          </div>

          {/* Options Income Summary */}
          {accountingData && (() => {
            const totalOptionsIncome = accountingData.positions.reduce((s, p) => s + (p.options_income ?? 0), 0);
            const totalRealizedGL = accountingData.positions.reduce((s, p) => s + (p.realized_gain_loss ?? 0), 0);
            const totalDividends = accountingData.positions.reduce((s, p) => s + (p.dividend_income ?? 0), 0);
            return totalOptionsIncome > 0 || totalRealizedGL !== 0 ? (
              <div className="accounting-net-worth-grid" style={{ marginTop: '16px', borderTop: '1px solid var(--color-border)', paddingTop: '16px' }}>
                <div className="accounting-net-worth-item">
                  <span className="accounting-net-worth-label">Options Income (all time)</span>
                  <span className="accounting-net-worth-value" style={{ color: '#4fc3f7' }}>
                    {formatCurrency(totalOptionsIncome)}
                  </span>
                </div>
                <div className="accounting-net-worth-item">
                  <span className="accounting-net-worth-label">Realized Gains (all time)</span>
                  <span className="accounting-net-worth-value" style={{ color: totalRealizedGL >= 0 ? '#66bb6a' : '#ef5350' }}>
                    {formatCurrency(totalRealizedGL)}
                  </span>
                </div>
                <div className="accounting-net-worth-item">
                  <span className="accounting-net-worth-label">Dividends Collected (all time)</span>
                  <span className="accounting-net-worth-value" style={{ color: '#66bb6a' }}>
                    {formatCurrency(totalDividends)}
                  </span>
                </div>
                <div className="accounting-net-worth-item">
                  <span className="accounting-net-worth-label">Total Income Generated</span>
                  <span className="accounting-net-worth-value total">
                    {formatCurrency(totalOptionsIncome + totalRealizedGL + totalDividends)}
                  </span>
                </div>
              </div>
            ) : null;
          })()}

          <p className="accounting-net-worth-note">
            Traditional adjusted = face × (1 − 24% marginal rate). Taxable adjusted = face − 15% LTCG on gains. Filing: Married Jointly.
          </p>
        </div>
      )}

      {/* Historical Portfolio Value Chart */}
      <HistoricalValueChart
        liveRobinhood={accountingData?.positions.filter(p => p.account_id === ROBINHOOD_ACCOUNT_ID).reduce((s, p) => s + (p.market_value ?? p.cost_basis), 0)}
        liveTraditional={accountingData?.positions.filter(p => p.account_id === TRAD_ACCOUNT_ID).reduce((s, p) => s + (p.market_value ?? p.cost_basis), 0)}
        liveRoth={accountingData?.positions.filter(p => p.account_id === ROTH_ACCOUNT_ID).reduce((s, p) => s + (p.market_value ?? p.cost_basis), 0)}
      />
    </div>
  );
}

export default AccountingPage;
