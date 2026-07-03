import { useMemo, useState, useEffect, useCallback } from 'react';
import { usePageTitle } from '@/hooks/usePageTitle';
import { TARGET_PORTFOLIO, DIVIDEND_SETTINGS } from '@/lib/dividendEngine/sampleData';
import { loadLocalSettings } from '@/lib/dividendEngine/localSettings';
import { calculateQualityScore, type QualityScore, type DividendStockData } from '@/lib/dividendEngine/qualityScoring';
import { fetchIncomeData, calculateHourlyEquivalents, type TimePeriod, type IncomeDashboardData } from '@/lib/dashboards/income';
import { fetchStockPrices } from '@/lib/market/fetchStockPrices';
import './DividendPage.css';

/* ─── Tooltip Column Definitions ───────────────────────────────────────── */

const COLUMN_TOOLTIPS: Record<string, string> = {
  symbol: 'Stock ticker symbol',
  name: 'Company name',
  group: 'Calendar Group — A (Jan/Apr/Jul/Oct), B (Feb/May/Aug/Nov), C (Mar/Jun/Sep/Dec). Ensures monthly income.',
  yield: 'Current annual dividend yield (annual dividend / current price × 100)',
  avgYield: '5-Year Average Yield — what this stock typically yields. Used to calculate Relative Yield.',
  relYield: 'Relative Yield = Current Yield / 5yr Avg Yield. >1.0 means stock is cheap (yielding more than usual). <1.0 means expensive.',
  chowder: 'Chowder Number = Current Yield + 5yr Dividend Growth Rate. Higher = better total return from dividends. For <3% yield stocks, target ≥15. For 3-5% yield, target ≥12.',
  growth: '5-Year Dividend Growth Rate — how fast the company is increasing its dividend each year.',
  pe: 'Price-to-Earnings ratio. Lower = cheaper. <14 great, 14-18 good, 18-30 fair, >30 expensive.',
  belowHigh: '% below 52-week high. Higher = stock is cheaper vs recent peak. 20%+ = significant discount.',
  aboveLow: '% above 52-week low. Lower = stock is near its cheapest recent price. 0% = at the low.',
  payout: 'Payout Ratio — % of earnings paid as dividends. <60% is safe. >80% may indicate risk of a cut.',
  score: 'Quality Score (0-100) — weighted composite of all factors. Determines Buy/Watch/Pass rating.',
  rating: 'Rating based on Quality Score. Strong Buy ≥90, Buy ≥80, Watch ≥70, Pass <70.',
  king: 'Dividend King (50+ years consecutive increases) or Aristocrat (25+ years).',
  shares: 'Shares currently held in Robinhood account.',
  annualIncome: 'Estimated annual dividend income from current shares.',
};

/* ─── Color Helpers ────────────────────────────────────────────────────── */

function getChowderColor(chowder: number, currentYield: number): string {
  const threshold = currentYield >= 3 ? 12 : 15;
  if (chowder >= threshold) return '#34a853';
  if (chowder >= threshold - 2) return '#57bb8a';
  if (chowder >= threshold - 4) return '#f4b400';
  return '#ea4335';
}

function getRelYieldColor(relYield: number): string {
  // relYield is stored as percentage (100 = 1.0x)
  if (relYield >= 120) return '#34a853';
  if (relYield >= 100) return '#57bb8a';
  if (relYield >= 80) return '#f4b400';
  return '#ea4335';
}

function getPEColor(pe: number): string {
  if (pe <= 14) return '#34a853';
  if (pe <= 18) return '#57bb8a';
  if (pe <= 30) return '#f4b400';
  return '#ea4335';
}

function getPayoutColor(payout: number): string {
  if (payout <= 40) return '#34a853';
  if (payout <= 60) return '#57bb8a';
  if (payout <= 75) return '#f4b400';
  return '#ea4335';
}

function getGrowthColor(growth: number): string {
  if (growth >= 10) return '#34a853';
  if (growth >= 7) return '#57bb8a';
  if (growth >= 5) return '#f4b400';
  return '#ea4335';
}

/* ─── Component ────────────────────────────────────────────────────────── */

function DividendPage() {
  usePageTitle('Dividend Portfolio');

  const monthlyDeploy = loadLocalSettings().monthlyContribution;
  const [deployAmount, setDeployAmount] = useState(monthlyDeploy);

  const scoredStocks = useMemo(() => {
    return TARGET_PORTFOLIO.map((stock) => ({
      stock,
      score: calculateQualityScore(stock),
    })).sort((a, b) => {
      // Sort by calendar group first (A, B, C), then by score within group
      const groupOrder = a.stock.calendarGroup.localeCompare(b.stock.calendarGroup);
      if (groupOrder !== 0) return groupOrder;
      return b.score.totalScore - a.score.totalScore;
    });
  }, []);

  const totalAnnualIncome = scoredStocks.reduce((sum, { stock }) => {
    return sum + (stock.sharesHeld * stock.annualDividendPerShare);
  }, 0);

  const monthlyIncome = totalAnnualIncome / 12;

  // Actual income from PocketBase
  const [period, setPeriod] = useState<TimePeriod>('ytd');
  const [incomeData, setIncomeData] = useState<IncomeDashboardData | null>(null);
  const [prices, setPrices] = useState<Map<string, number>>(new Map());

  const loadIncome = useCallback(async (p: TimePeriod) => {
    const data = await fetchIncomeData(p);
    setIncomeData(data);
  }, []);

  useEffect(() => { loadIncome(period); }, [period, loadIncome]);

  // Fetch live prices for all target stocks
  useEffect(() => {
    const symbols = TARGET_PORTFOLIO.map(s => s.symbol);
    fetchStockPrices(symbols).then(setPrices);
  }, []);

  const hourly = incomeData ? calculateHourlyEquivalents(incomeData.total_income) : null;

  return (
    <div className="page dividend-page">
      <h2>Dividend Portfolio</h2>
      <p className="dividend-subtitle">
        {TARGET_PORTFOLIO.length} stocks • All qualified dividends • Dividend Kings & Aristocrats
      </p>

      {/* Summary Cards */}
      <div className="dividend-summary">
        <div className="dividend-summary-card">
          <span className="dividend-summary-label">Target Stocks</span>
          <span className="dividend-summary-value">{DIVIDEND_SETTINGS.targetPositions}</span>
        </div>
        <div className="dividend-summary-card">
          <span className="dividend-summary-label">Annual Income</span>
          <span className="dividend-summary-value dividend-summary-value--green">
            ${totalAnnualIncome.toFixed(2)}
          </span>
        </div>
        <div className="dividend-summary-card">
          <span className="dividend-summary-label">Monthly Income</span>
          <span className="dividend-summary-value dividend-summary-value--green">
            ${monthlyIncome.toFixed(2)}
          </span>
        </div>
        <div className="dividend-summary-card">
          <span className="dividend-summary-label">Avg Yield</span>
          <span className="dividend-summary-value">{DIVIDEND_SETTINGS.averageYield}%</span>
        </div>
        <div className="dividend-summary-card">
          <span className="dividend-summary-label">Monthly Deploy</span>
          <span className="dividend-summary-value">${monthlyDeploy}</span>
          <span className="dividend-summary-note">change in Settings</span>
        </div>
      </div>

      {/* Quality Table */}
      <div className="dividend-table-wrapper">
        <table className="dividend-table">
          <thead>
            <tr>
              <Th tooltip={COLUMN_TOOLTIPS.rating}>Rating</Th>
              <Th tooltip={COLUMN_TOOLTIPS.symbol}>Symbol</Th>
              <Th tooltip={COLUMN_TOOLTIPS.group}>Group</Th>
              <Th tooltip="Current stock price (from Yahoo Finance)" numeric>Price</Th>
              <Th tooltip={COLUMN_TOOLTIPS.yield} numeric>Yield</Th>
              <Th tooltip={COLUMN_TOOLTIPS.relYield} numeric>Rel. Yield</Th>
              <Th tooltip={COLUMN_TOOLTIPS.chowder} numeric>Chowder #</Th>
              <Th tooltip={COLUMN_TOOLTIPS.growth} numeric>Growth</Th>
              <Th tooltip={COLUMN_TOOLTIPS.pe} numeric>P/E</Th>
              <Th tooltip={COLUMN_TOOLTIPS.belowHigh} numeric>% Below High</Th>
              <Th tooltip={COLUMN_TOOLTIPS.aboveLow} numeric>% Above Low</Th>
              <Th tooltip={COLUMN_TOOLTIPS.payout} numeric>Payout</Th>
              <Th tooltip={COLUMN_TOOLTIPS.score} numeric>Score</Th>
              <Th tooltip={COLUMN_TOOLTIPS.king}>King/Arist</Th>
              <Th tooltip={COLUMN_TOOLTIPS.shares} numeric>Shares</Th>
              <Th tooltip={COLUMN_TOOLTIPS.annualIncome} numeric>Ann. Income</Th>
            </tr>
          </thead>
          <tbody>
            {scoredStocks.map(({ stock, score }, idx, arr) => {
              const prevGroup = idx > 0 ? arr[idx - 1]!.stock.calendarGroup : null;
              const isGroupBoundary = idx > 0 && stock.calendarGroup !== prevGroup;
              return (
                <StockRow key={stock.symbol} stock={stock} score={score} price={prices.get(stock.symbol)} isGroupBoundary={isGroupBoundary} />
              );
            })}
          </tbody>
        </table>
      </div>

      {/* Where to Deploy Money */}
      <div className="dividend-deploy">
        <h3>💡 Where to Deploy This Month</h3>
        <div className="deploy-amount-row">
          <label htmlFor="deploy-amount">Amount to deploy:</label>
          <input
            id="deploy-amount"
            type="number"
            className="deploy-amount-input"
            value={deployAmount}
            onChange={(e) => setDeployAmount(Number(e.target.value))}
            min={0}
            step={100}
          />
        </div>
        {(() => {
          // Calculate group income totals to find weakest group
          const groupIncome: Record<string, number> = { A: 0, B: 0, C: 0 };
          for (const { stock } of scoredStocks) {
            groupIncome[stock.calendarGroup] += stock.sharesHeld * stock.annualDividendPerShare;
          }
          const weakestGroup = Object.entries(groupIncome).sort((a, b) => a[1] - b[1])[0]?.[0] ?? 'A';

          // Score each stock for allocation priority
          const candidates = scoredStocks
            .filter(({ score }) => score.totalScore >= 70) // Watch or better
            .map(({ stock, score }) => {
              let priority = 0;
              // Quality score weight
              priority += score.totalScore >= 90 ? 40 : score.totalScore >= 80 ? 30 : 15;
              // Weakest group bonus
              if (stock.calendarGroup === weakestGroup) priority += 25;
              // Undervalued bonus (relative yield > 110%)
              if (score.relativeYield > 110) priority += 20;
              // Not yet owned bonus
              if (stock.sharesHeld === 0) priority += 15;
              return { stock, score, priority };
            })
            .sort((a, b) => b.priority - a.priority)
            .slice(0, 4);

          const totalPriority = candidates.reduce((s, c) => s + c.priority, 0);

          return (
            <div className="deploy-cards">
              {candidates.map(({ stock, score, priority }) => {
                const pct = totalPriority > 0 ? priority / totalPriority : 0;
                const dollars = deployAmount * pct;
                return (
                  <div key={stock.symbol} className="deploy-card">
                    <div className="deploy-card-top">
                      <span className="deploy-pct">{(pct * 100).toFixed(0)}%</span>
                      <span className="deploy-dollars">${dollars.toFixed(0)}</span>
                    </div>
                    <span className="deploy-symbol">{stock.symbol}</span>
                    <span className="deploy-name">{stock.name}</span>
                    <span className="deploy-reason">
                      {stock.calendarGroup === weakestGroup ? `Fills weak Grp ${weakestGroup}` : `Grp ${stock.calendarGroup}`}
                      {score.relativeYield > 110 ? ' • Undervalued' : ''}
                      {stock.sharesHeld === 0 ? ' • New position' : ''}
                    </span>
                    <span className="deploy-badge" style={{ color: score.ratingColor }}>{score.rating} ({score.totalScore.toFixed(0)})</span>
                  </div>
                );
              })}
            </div>
          );
        })()}
      </div>

      {/* Calendar Groups Visual */}
      <div className="dividend-calendar">
        <h3>Income Calendar</h3>
        <div className="dividend-calendar-grid">
          <CalendarGroup label="Group A" months="Jan / Apr / Jul / Oct" color="#4fc3f7"
            stocks={scoredStocks.filter(s => s.stock.calendarGroup === 'A').map(s => s.stock.symbol)}
            income={scoredStocks.filter(s => s.stock.calendarGroup === 'A').reduce((sum, s) => sum + s.stock.sharesHeld * s.stock.annualDividendPerShare, 0)} />
          <CalendarGroup label="Group B" months="Feb / May / Aug / Nov" color="#66bb6a"
            stocks={scoredStocks.filter(s => s.stock.calendarGroup === 'B').map(s => s.stock.symbol)}
            income={scoredStocks.filter(s => s.stock.calendarGroup === 'B').reduce((sum, s) => sum + s.stock.sharesHeld * s.stock.annualDividendPerShare, 0)} />
          <CalendarGroup label="Group C" months="Mar / Jun / Sep / Dec" color="#ce93d8"
            stocks={scoredStocks.filter(s => s.stock.calendarGroup === 'C').map(s => s.stock.symbol)}
            income={scoredStocks.filter(s => s.stock.calendarGroup === 'C').reduce((sum, s) => sum + s.stock.sharesHeld * s.stock.annualDividendPerShare, 0)} />
        </div>
      </div>

      {/* Actual Income Earned */}
      <div className="dividend-income-section">
        <h3>Actual Income Earned</h3>
        <div className="dividend-period-selector">
          {(['mtd', 'qtd', 'ytd', 'trailing_12m'] as TimePeriod[]).map((p) => (
            <button key={p} className={`dividend-period-btn ${period === p ? 'active' : ''}`} onClick={() => setPeriod(p)}>
              {p === 'trailing_12m' ? '12M' : p.toUpperCase()}
            </button>
          ))}
        </div>
        {incomeData && (
          <div className="dividend-income-grid">
            <div className="dividend-income-card">
              <span className="dividend-income-label">Dividends</span>
              <span className="dividend-income-value" style={{ color: '#66bb6a' }}>${incomeData.dividend_income.toFixed(2)}</span>
            </div>
            <div className="dividend-income-card">
              <span className="dividend-income-label">Options</span>
              <span className="dividend-income-value" style={{ color: '#4fc3f7' }}>${incomeData.options_income.toFixed(2)}</span>
            </div>
            <div className="dividend-income-card">
              <span className="dividend-income-label">Interest</span>
              <span className="dividend-income-value">${incomeData.interest_income.toFixed(2)}</span>
            </div>
            <div className="dividend-income-card">
              <span className="dividend-income-label">Total</span>
              <span className="dividend-income-value" style={{ color: '#fff', fontWeight: 700 }}>${incomeData.total_income.toFixed(2)}</span>
            </div>
            {hourly && (
              <>
                <div className="dividend-income-card">
                  <span className="dividend-income-label">$/hr (40hr week)</span>
                  <span className="dividend-income-value">${hourly.hourly_40hr.toFixed(2)}</span>
                </div>
                <div className="dividend-income-card">
                  <span className="dividend-income-label">$/hr (24/7)</span>
                  <span className="dividend-income-value">${hourly.hourly_24hr.toFixed(4)}</span>
                </div>
              </>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

/* ─── Sub-components ───────────────────────────────────────────────────── */

function Th({ children, tooltip, numeric }: { children: React.ReactNode; tooltip: string; numeric?: boolean }) {
  return (
    <th className={numeric ? 'numeric' : ''} title={tooltip}>
      <span className="th-content">
        {children}
        <span className="th-tooltip-icon">?</span>
      </span>
    </th>
  );
}

function StockRow({ stock, score, price, isGroupBoundary }: { stock: DividendStockData; score: QualityScore; price?: number; isGroupBoundary?: boolean }) {
  const annualIncome = stock.sharesHeld * stock.annualDividendPerShare;
  const relYieldDisplay = score.relativeYield / 100;

  return (
    <tr className={isGroupBoundary ? 'group-divider' : ''}>
      <td>
        <span className="rating-badge" style={{ backgroundColor: score.ratingColor + '22', color: score.ratingColor }}>
          {score.rating}
        </span>
      </td>
      <td className="symbol-cell">{stock.symbol}</td>
      <td><span className={`group-badge group-badge--${stock.calendarGroup.toLowerCase()}`}>{stock.calendarGroup}</span></td>
      <td className="numeric">{price ? `$${price.toFixed(2)}` : '—'}</td>
      <td className="numeric">{stock.currentYield.toFixed(1)}%</td>
      <td className="numeric" style={{ color: getRelYieldColor(score.relativeYield) }}>
        {relYieldDisplay.toFixed(2)}x
      </td>
      <td className="numeric" style={{ color: getChowderColor(score.chowderNumber, stock.currentYield), fontWeight: 700 }}>
        {score.chowderNumber.toFixed(1)}
      </td>
      <td className="numeric" style={{ color: getGrowthColor(stock.dividendGrowthRate) }}>
        {stock.dividendGrowthRate.toFixed(1)}%
      </td>
      <td className="numeric" style={{ color: getPEColor(stock.peRatio) }}>
        {stock.peRatio.toFixed(1)}
      </td>
      <td className="numeric" style={{ color: stock.priceVs52WeekHigh >= 20 ? '#34a853' : stock.priceVs52WeekHigh >= 15 ? '#57bb8a' : stock.priceVs52WeekHigh >= 10 ? '#f4b400' : '#ea4335' }}>
        {stock.priceVs52WeekHigh}%
      </td>
      <td className="numeric" style={{ color: (() => { const aboveLow = Math.max(0, 100 - stock.priceVs52WeekHigh * 2); return aboveLow <= 10 ? '#34a853' : aboveLow <= 30 ? '#57bb8a' : aboveLow <= 50 ? '#f4b400' : '#ea4335'; })() }}>
        {Math.max(0, 100 - stock.priceVs52WeekHigh * 2).toFixed(0)}%
      </td>
      <td className="numeric" style={{ color: getPayoutColor(stock.payoutRatio) }}>
        {stock.payoutRatio}%
      </td>
      <td className="numeric" style={{ fontWeight: 700 }}>{score.totalScore.toFixed(0)}</td>
      <td>{stock.isDividendKing ? '👑' : stock.isDividendAristocrat ? '🏆' : '—'}</td>
      <td className="numeric">{stock.sharesHeld > 0 ? stock.sharesHeld.toFixed(2) : '—'}</td>
      <td className="numeric" style={{ color: annualIncome > 0 ? '#66bb6a' : 'var(--color-text-muted)' }}>
        {annualIncome > 0 ? `$${annualIncome.toFixed(2)}` : '—'}
      </td>
    </tr>
  );
}

function CalendarGroup({ label, months, color, stocks, income }: { label: string; months: string; color: string; stocks: string[]; income: number }) {
  return (
    <div className="calendar-group-card" style={{ borderColor: color }}>
      <span className="calendar-group-label" style={{ color }}>{label}</span>
      <span className="calendar-group-months">{months}</span>
      <span className="calendar-group-income">${income.toFixed(2)}/yr</span>
      <div className="calendar-group-stocks">
        {stocks.map((s) => <span key={s} className="calendar-stock-chip">{s}</span>)}
      </div>
    </div>
  );
}

export default DividendPage;
