import { useMemo, useState, useEffect, useCallback } from 'react';
import { usePageTitle } from '@/hooks/usePageTitle';
import { TARGET_PORTFOLIO, DIVIDEND_SETTINGS } from '@/lib/dividendEngine/sampleData';
import { loadLocalSettings } from '@/lib/dividendEngine/localSettings';
import { calculateQualityScore, type QualityScore, type DividendStockData } from '@/lib/dividendEngine/qualityScoring';
import { calculateIncomeSmoothing, type IncomeSmoothingResult } from '@/lib/dividendEngine/incomeSmoothing';
import { calculateGrowthForecast, type GrowthForecastResult } from '@/lib/dividendEngine/growthForecast';
import { calculateRetirementReadiness, type RetirementReadinessResult } from '@/lib/dividendEngine/retirementReadiness';
import { fetchStockPrices } from '@/lib/market/fetchStockPrices';
import './DividendPage.css';

/* ─── Types ────────────────────────────────────────────────────────────── */

type DivTab = 'quality' | 'deploy' | 'income' | 'forecast' | 'fi';

/* ─── Helpers ──────────────────────────────────────────────────────────── */

function fmt(n: number): string {
  return n.toLocaleString('en-US', { style: 'currency', currency: 'USD', minimumFractionDigits: 0, maximumFractionDigits: 0 });
}
function fmtDec(n: number): string {
  return n.toLocaleString('en-US', { style: 'currency', currency: 'USD', minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function getChowderColor(chowder: number, currentYield: number): string {
  const threshold = currentYield >= 3 ? 12 : 15;
  if (chowder >= threshold) return '#34a853';
  if (chowder >= threshold - 2) return '#57bb8a';
  if (chowder >= threshold - 4) return '#f4b400';
  return '#ea4335';
}
function getRelYieldColor(relYield: number): string {
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

/* ─── Main Component ───────────────────────────────────────────────────── */

function DividendPage() {
  usePageTitle('Dividend Portfolio');

  const localSettings = loadLocalSettings();
  const monthlyDeploy = localSettings.monthlyContribution;
  const [activeTab, setActiveTab] = useState<DivTab>('quality');
  const [deployAmount, setDeployAmount] = useState(monthlyDeploy);
  const [annualExpenses, setAnnualExpenses] = useState(localSettings.annualExpenses);
  const [prices, setPrices] = useState<Map<string, number>>(new Map());

  const scoredStocks = useMemo(() => {
    return TARGET_PORTFOLIO.map((stock) => ({
      stock,
      score: calculateQualityScore(stock),
    })).sort((a, b) => {
      const groupOrder = a.stock.calendarGroup.localeCompare(b.stock.calendarGroup);
      if (groupOrder !== 0) return groupOrder;
      return b.score.totalScore - a.score.totalScore;
    });
  }, []);

  const totalAnnualIncome = scoredStocks.reduce((sum, { stock }) =>
    sum + (stock.sharesHeld * stock.annualDividendPerShare), 0);
  const monthlyIncome = totalAnnualIncome / 12;
  const avgScore = scoredStocks.reduce((s, { score }) => s + score.totalScore, 0) / Math.max(scoredStocks.length, 1);

  const smoothing = useMemo(() => calculateIncomeSmoothing(TARGET_PORTFOLIO), []);

  const forecast = useMemo(() => calculateGrowthForecast({
    currentAnnualIncome: totalAnnualIncome,
    historicalGrowthRate: 7,
    monthlyContribution: monthlyDeploy,
    averageYield: DIVIDEND_SETTINGS.averageYield,
    yearsToRetirement: 20,
  }), [totalAnnualIncome, monthlyDeploy]);

  const retirement = useMemo(() => calculateRetirementReadiness({
    annualDividendIncome: totalAnnualIncome,
    annualExpenses,
    monthlyContribution: monthlyDeploy,
    averageYield: DIVIDEND_SETTINGS.averageYield,
    dividendGrowthRate: 7,
    qualifiedDividendPct: 85,
  }), [totalAnnualIncome, annualExpenses, monthlyDeploy]);

  useEffect(() => {
    fetchStockPrices(TARGET_PORTFOLIO.map(s => s.symbol)).then(setPrices);
  }, []);

  const tabs: { id: DivTab; label: string; icon: string }[] = [
    { id: 'quality', label: 'Quality', icon: '⭐' },
    { id: 'deploy', label: 'Deploy', icon: '🎯' },
    { id: 'income', label: 'Income', icon: '📅' },
    { id: 'forecast', label: 'Forecast', icon: '📈' },
    { id: 'fi', label: 'FI Score', icon: '🏖️' },
  ];

  return (
    <div className="page dividend-page">
      <h2>Dividend Portfolio</h2>
      <p className="dividend-subtitle">
        {TARGET_PORTFOLIO.length} stocks • All qualified dividends • Dividend Kings & Aristocrats
      </p>

      {/* KPI Summary */}
      <div className="dividend-summary">
        <div className="dividend-summary-card">
          <span className="dividend-summary-label">Annual Income</span>
          <span className="dividend-summary-value dividend-summary-value--green">{fmtDec(totalAnnualIncome)}</span>
        </div>
        <div className="dividend-summary-card">
          <span className="dividend-summary-label">Monthly Income</span>
          <span className="dividend-summary-value dividend-summary-value--green">{fmtDec(monthlyIncome)}</span>
        </div>
        <div className="dividend-summary-card">
          <span className="dividend-summary-label">Avg Quality</span>
          <span className="dividend-summary-value">{avgScore.toFixed(0)}</span>
        </div>
        <div className="dividend-summary-card">
          <span className="dividend-summary-label">Coverage Score</span>
          <span className="dividend-summary-value">{smoothing.coverageScore.toFixed(0)}</span>
        </div>
        <div className="dividend-summary-card">
          <span className="dividend-summary-label">FI Score</span>
          <span className="dividend-summary-value" style={{ color: retirement.fiStatusColor }}>{retirement.fiScore.toFixed(0)}%</span>
        </div>
        <div className="dividend-summary-card">
          <span className="dividend-summary-label">Monthly Contribution</span>
          <span className="dividend-summary-value">${monthlyDeploy}</span>
          <span className="dividend-summary-note">change in Settings</span>
        </div>
      </div>

      {/* Sub-tabs */}
      <div className="div-tabs">
        {tabs.map((tab) => (
          <button
            key={tab.id}
            className={`div-tab ${activeTab === tab.id ? 'div-tab--active' : ''}`}
            onClick={() => setActiveTab(tab.id)}
          >
            <span className="div-tab-icon">{tab.icon}</span>
            <span className="div-tab-label">{tab.label}</span>
          </button>
        ))}
      </div>

      {/* Tab Content */}
      {activeTab === 'quality' && <QualityTab scoredStocks={scoredStocks} prices={prices} />}
      {activeTab === 'deploy' && <DeployTab scoredStocks={scoredStocks} deployAmount={deployAmount} setDeployAmount={setDeployAmount} />}
      {activeTab === 'income' && <IncomeTab smoothing={smoothing} />}
      {activeTab === 'forecast' && <ForecastTab result={forecast} />}
      {activeTab === 'fi' && <FITab result={retirement} annualExpenses={annualExpenses} setAnnualExpenses={setAnnualExpenses} />}
    </div>
  );
}

/* ─── Quality Tab ──────────────────────────────────────────────────────── */

function QualityTab({ scoredStocks, prices }: { scoredStocks: { stock: DividendStockData; score: QualityScore }[]; prices: Map<string, number> }) {
  return (
    <div className="dividend-table-wrapper">
      <table className="dividend-table">
        <thead>
          <tr>
            <th>Rating</th><th>Symbol</th><th>Group</th><th className="numeric">Price</th>
            <th className="numeric">Yield</th><th className="numeric">Rel. Yield</th>
            <th className="numeric">Chowder</th><th className="numeric">Growth</th>
            <th className="numeric">P/E</th><th className="numeric">% Below High</th>
            <th className="numeric">Payout</th><th className="numeric">Score</th>
            <th>King/Arist</th><th className="numeric">Shares</th><th className="numeric">Ann. Income</th>
          </tr>
        </thead>
        <tbody>
          {scoredStocks.map(({ stock, score }, idx, arr) => {
            const prevGroup = idx > 0 ? arr[idx - 1]!.stock.calendarGroup : null;
            const isGroupBoundary = idx > 0 && stock.calendarGroup !== prevGroup;
            const annualIncome = stock.sharesHeld * stock.annualDividendPerShare;
            const relYield = score.relativeYield / 100;
            const price = prices.get(stock.symbol);
            return (
              <tr key={stock.symbol} className={isGroupBoundary ? 'group-divider' : ''}>
                <td><span className="rating-badge" style={{ backgroundColor: score.ratingColor + '22', color: score.ratingColor }}>{score.rating}</span></td>
                <td className="symbol-cell">{stock.symbol}</td>
                <td><span className={`group-badge group-badge--${stock.calendarGroup.toLowerCase()}`}>{stock.calendarGroup}</span></td>
                <td className="numeric">{price ? `$${price.toFixed(2)}` : '—'}</td>
                <td className="numeric">{stock.currentYield.toFixed(1)}%</td>
                <td className="numeric" style={{ color: getRelYieldColor(score.relativeYield) }}>{relYield.toFixed(2)}x</td>
                <td className="numeric" style={{ color: getChowderColor(score.chowderNumber, stock.currentYield), fontWeight: 700 }}>{score.chowderNumber.toFixed(1)}</td>
                <td className="numeric" style={{ color: getGrowthColor(stock.dividendGrowthRate) }}>{stock.dividendGrowthRate.toFixed(1)}%</td>
                <td className="numeric" style={{ color: getPEColor(stock.peRatio) }}>{stock.peRatio.toFixed(1)}</td>
                <td className="numeric" style={{ color: stock.priceVs52WeekHigh >= 20 ? '#34a853' : stock.priceVs52WeekHigh >= 10 ? '#f4b400' : '#ea4335' }}>{stock.priceVs52WeekHigh}%</td>
                <td className="numeric" style={{ color: getPayoutColor(stock.payoutRatio) }}>{stock.payoutRatio}%</td>
                <td className="numeric" style={{ fontWeight: 700 }}>{score.totalScore.toFixed(0)}</td>
                <td>{stock.isDividendKing ? '👑' : stock.isDividendAristocrat ? '🏆' : '—'}</td>
                <td className="numeric">{stock.sharesHeld > 0 ? stock.sharesHeld.toFixed(2) : '—'}</td>
                <td className="numeric" style={{ color: annualIncome > 0 ? '#66bb6a' : 'var(--color-text-muted)' }}>{annualIncome > 0 ? `$${annualIncome.toFixed(2)}` : '—'}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

/* ─── Deploy Tab ───────────────────────────────────────────────────────── */

function DeployTab({ scoredStocks, deployAmount, setDeployAmount }: {
  scoredStocks: { stock: DividendStockData; score: QualityScore }[];
  deployAmount: number;
  setDeployAmount: (v: number) => void;
}) {
  const groupIncome: Record<string, number> = { A: 0, B: 0, C: 0 };
  for (const { stock } of scoredStocks) {
    groupIncome[stock.calendarGroup] += stock.sharesHeld * stock.annualDividendPerShare;
  }
  const weakestGroup = Object.entries(groupIncome).sort((a, b) => a[1] - b[1])[0]?.[0] ?? 'A';

  const candidates = scoredStocks
    .filter(({ score }) => score.totalScore >= 70)
    .map(({ stock, score }) => {
      let priority = 0;
      priority += score.totalScore >= 90 ? 40 : score.totalScore >= 80 ? 30 : 15;
      if (stock.calendarGroup === weakestGroup) priority += 25;
      if (score.relativeYield > 110) priority += 20;
      if (stock.sharesHeld === 0) priority += 15;
      return { stock, score, priority };
    })
    .sort((a, b) => b.priority - a.priority)
    .slice(0, 4);

  const totalPriority = candidates.reduce((s, c) => s + c.priority, 0);
  const bestBuy = candidates[0]?.stock.symbol ?? '—';
  const mostUndervalued = candidates.find(c => c.score.relativeYield > 110)?.stock.symbol ?? '—';

  return (
    <div className="div-panel">
      <h3>Capital Allocation — Where Should My Next Dollar Go?</h3>

      {/* Quick-glance KPI cards */}
      <div className="div-alloc-kpis">
        <div className="div-alloc-kpi-card">
          <span className="div-alloc-kpi-rank">1st</span>
          <span className="div-alloc-kpi-label">Best Buy</span>
          <span className="div-alloc-kpi-value">{bestBuy}</span>
        </div>
        <div className="div-alloc-kpi-card">
          <span className="div-alloc-kpi-rank">2nd</span>
          <span className="div-alloc-kpi-label">Most Undervalued</span>
          <span className="div-alloc-kpi-value">{mostUndervalued}</span>
        </div>
        <div className="div-alloc-kpi-card">
          <span className="div-alloc-kpi-rank">3rd</span>
          <span className="div-alloc-kpi-label">Weakest Group</span>
          <span className="div-alloc-kpi-value">Group {weakestGroup}</span>
        </div>
      </div>

      {/* Deploy amount input */}
      <div className="deploy-amount-row">
        <label htmlFor="deploy-amount">Amount to deploy now:</label>
        <input id="deploy-amount" type="number" className="deploy-amount-input" value={deployAmount}
          onChange={(e) => setDeployAmount(Number(e.target.value))} min={0} step={100} />
      </div>

      {/* Allocation breakdown */}
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
    </div>
  );
}

/* ─── Income Smoothing Tab ─────────────────────────────────────────────── */

function IncomeTab({ smoothing }: { smoothing: IncomeSmoothingResult }) {
  const maxMonthly = Math.max(...smoothing.monthlyBreakdown.map((m) => m.projected), 1);
  return (
    <div className="div-panel">
      <h3>Income Smoothing Calendar</h3>
      <div className="div-smooth-kpis">
        <div className="div-smooth-kpi">
          <span className="div-smooth-kpi-label">Target/Month</span>
          <span className="div-smooth-kpi-value">{fmtDec(smoothing.targetMonthly)}</span>
        </div>
        <div className="div-smooth-kpi">
          <span className="div-smooth-kpi-label">Coverage Score</span>
          <span className="div-smooth-kpi-value">{smoothing.coverageScore.toFixed(0)}/100</span>
        </div>
        <div className="div-smooth-kpi">
          <span className="div-smooth-kpi-label">Weakest Month</span>
          <span className="div-smooth-kpi-value">{smoothing.weakestMonth?.monthLabel ?? '—'}</span>
        </div>
        <div className="div-smooth-kpi">
          <span className="div-smooth-kpi-label">Variance</span>
          <span className="div-smooth-kpi-value">{fmtDec(smoothing.incomeVariance)}</span>
        </div>
      </div>
      <div className="div-month-chart">
        {smoothing.monthlyBreakdown.map((m) => (
          <div key={m.month} className="div-month-bar-col">
            <div className="div-month-amount">{fmt(m.projected)}</div>
            <div className="div-month-bar-track">
              <div className={`div-month-bar-fill div-month-bar-fill--${m.group.toLowerCase()}`}
                style={{ height: `${(m.projected / maxMonthly) * 100}%` }} />
            </div>
            <div className="div-month-label">{m.monthLabel}</div>
            <div className="div-month-group">Grp {m.group}</div>
          </div>
        ))}
      </div>
      <div className="div-group-totals">
        {smoothing.groupTotals.map((g) => (
          <div key={g.group} className="div-group-item">
            <span className={`div-group-badge div-group-badge--${g.group.toLowerCase()}`}>Group {g.group}</span>
            <span>{fmt(g.total)} ({g.pct.toFixed(0)}%)</span>
          </div>
        ))}
      </div>
      {smoothing.gapAnalysis.largestDeficit > 0 && (
        <div className="div-gap-analysis">
          <h4>Income Gap Analysis</h4>
          <p>Weakest: <strong>{smoothing.gapAnalysis.lowestMonth}</strong> — deficit of {fmtDec(smoothing.gapAnalysis.largestDeficit)}/mo</p>
          <p>Need {fmtDec(smoothing.gapAnalysis.requiredAdditionalAnnual)}/yr additional ({fmt(smoothing.gapAnalysis.requiredAdditionalCapital)} capital at 3% yield)</p>
        </div>
      )}
    </div>
  );
}

/* ─── Forecast Tab ─────────────────────────────────────────────────────── */

function ForecastTab({ result }: { result: GrowthForecastResult }) {
  return (
    <div className="div-panel">
      <h3>Dividend Growth Forecast</h3>
      <p className="div-panel-desc">Current: {fmtDec(result.currentIncome)}/yr • Growth: {result.growthRate}% • Contributions: {fmt(result.monthlyContribution)}/mo</p>
      <div className="div-forecast-table-wrap">
        <table className="div-forecast-table">
          <thead>
            <tr>
              <th>Period</th>
              <th>Conservative (50%)</th>
              <th>Base Case</th>
              <th>Optimistic (125%)</th>
              <th>From Contributions</th>
            </tr>
          </thead>
          <tbody>
            {result.forecasts.map((f) => (
              <tr key={f.years}>
                <td className="div-forecast-period">{f.label}</td>
                <td>{fmt(f.conservative)}</td>
                <td className="div-forecast-base">{fmt(f.base)}</td>
                <td>{fmt(f.optimistic)}</td>
                <td className="div-forecast-contrib">+{fmt(f.contributionImpact)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

/* ─── FI Score Tab ─────────────────────────────────────────────────────── */

function FITab({ result, annualExpenses, setAnnualExpenses }: {
  result: RetirementReadinessResult;
  annualExpenses: number;
  setAnnualExpenses: (v: number) => void;
}) {
  return (
    <div className="div-panel">
      <h3>Financial Independence Score</h3>
      <div className="div-retire-inputs">
        <div className="div-retire-input-group">
          <label htmlFor="annual-expenses">Annual Expenses</label>
          <input id="annual-expenses" type="number" value={annualExpenses}
            onChange={(e) => setAnnualExpenses(Number(e.target.value))} min={0} step={1000} />
        </div>
      </div>
      <div className="div-fi-hero">
        <div className="div-fi-score" style={{ color: result.fiStatusColor }}>{result.fiScore.toFixed(1)}%</div>
        <div className="div-fi-status" style={{ color: result.fiStatusColor }}>{result.fiStatus}</div>
        {result.yearsToDividendIndependence !== null && result.yearsToDividendIndependence > 0 && (
          <div className="div-fi-years">~{result.yearsToDividendIndependence} years to Dividend Independence</div>
        )}
        {result.yearsToDividendIndependence === 0 && (
          <div className="div-fi-years div-fi-years--achieved">✓ Dividend Independence Achieved</div>
        )}
      </div>
      <div className="div-retire-grid">
        <div className="div-retire-metric"><span className="div-retire-metric-label">Annual Income</span><span className="div-retire-metric-value">{fmt(result.annualIncome)}</span></div>
        <div className="div-retire-metric"><span className="div-retire-metric-label">Monthly Income</span><span className="div-retire-metric-value">{fmt(result.monthlyIncome)}</span></div>
        <div className="div-retire-metric"><span className="div-retire-metric-label">Annual Expenses</span><span className="div-retire-metric-value">{fmt(result.annualExpenses)}</span></div>
        <div className="div-retire-metric"><span className="div-retire-metric-label">Qualified %</span><span className="div-retire-metric-value">{result.qualifiedPct}%</span></div>
        <div className="div-retire-metric"><span className="div-retire-metric-label">5yr Projected</span><span className="div-retire-metric-value">{fmt(result.projectedIncome5yr)}</span></div>
        <div className="div-retire-metric"><span className="div-retire-metric-label">10yr Projected</span><span className="div-retire-metric-value">{fmt(result.projectedIncome10yr)}</span></div>
        <div className="div-retire-metric"><span className="div-retire-metric-label">20yr Projected</span><span className="div-retire-metric-value">{fmt(result.projectedIncome20yr)}</span></div>
        <div className="div-retire-metric"><span className="div-retire-metric-label">Coverage</span><span className="div-retire-metric-value" style={{ color: result.fiStatusColor }}>{result.coveragePct.toFixed(1)}%</span></div>
      </div>
    </div>
  );
}

export default DividendPage;
