import { useMemo, useState, useEffect, useCallback } from 'react';
import { usePageTitle } from '@/hooks/usePageTitle';
import { TARGET_PORTFOLIO, DIVIDEND_SETTINGS } from '@/lib/dividendEngine/sampleData';
import { calculateQualityScore, type QualityScore, type DividendStockData } from '@/lib/dividendEngine/qualityScoring';
import { fetchIncomeData, calculateHourlyEquivalents, type TimePeriod, type IncomeDashboardData } from '@/lib/dashboards/income';
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

  const loadIncome = useCallback(async (p: TimePeriod) => {
    const data = await fetchIncomeData(p);
    setIncomeData(data);
  }, []);

  useEffect(() => { loadIncome(period); }, [period, loadIncome]);

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
          <span className="dividend-summary-value">${DIVIDEND_SETTINGS.monthlyContribution}</span>
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
            {scoredStocks.map(({ stock, score }) => (
              <StockRow key={stock.symbol} stock={stock} score={score} />
            ))}
          </tbody>
        </table>
      </div>

      {/* Calendar Groups Visual */}
      <div className="dividend-calendar">
        <h3>Income Calendar</h3>
        <div className="dividend-calendar-grid">
          <CalendarGroup label="Group A" months="Jan / Apr / Jul / Oct" color="#4fc3f7"
            stocks={scoredStocks.filter(s => s.stock.calendarGroup === 'A').map(s => s.stock.symbol)} />
          <CalendarGroup label="Group B" months="Feb / May / Aug / Nov" color="#66bb6a"
            stocks={scoredStocks.filter(s => s.stock.calendarGroup === 'B').map(s => s.stock.symbol)} />
          <CalendarGroup label="Group C" months="Mar / Jun / Sep / Dec" color="#ce93d8"
            stocks={scoredStocks.filter(s => s.stock.calendarGroup === 'C').map(s => s.stock.symbol)} />
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

function StockRow({ stock, score }: { stock: DividendStockData; score: QualityScore }) {
  const annualIncome = stock.sharesHeld * stock.annualDividendPerShare;
  const relYieldDisplay = score.relativeYield / 100; // Convert from % to multiplier

  return (
    <tr>
      <td>
        <span className="rating-badge" style={{ backgroundColor: score.ratingColor + '22', color: score.ratingColor }}>
          {score.rating}
        </span>
      </td>
      <td className="symbol-cell">{stock.symbol}</td>
      <td><span className={`group-badge group-badge--${stock.calendarGroup.toLowerCase()}`}>{stock.calendarGroup}</span></td>
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

function CalendarGroup({ label, months, color, stocks }: { label: string; months: string; color: string; stocks: string[] }) {
  return (
    <div className="calendar-group-card" style={{ borderColor: color }}>
      <span className="calendar-group-label" style={{ color }}>{label}</span>
      <span className="calendar-group-months">{months}</span>
      <div className="calendar-group-stocks">
        {stocks.map((s) => <span key={s} className="calendar-stock-chip">{s}</span>)}
      </div>
    </div>
  );
}

export default DividendPage;
