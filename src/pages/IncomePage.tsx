import { useState, useMemo } from 'react';
import { usePageTitle } from '@/hooks/usePageTitle';
import {
  calculateQualityScore,
  calculateIncomeSmoothing,
  calculateGrowthForecast,
  calculateRetirementReadiness,
  calculateAllocation,
  type QualityScore,
  type IncomeSmoothingResult,
  type GrowthForecastResult,
  type RetirementReadinessResult,
  type AllocationResult,
} from '@/lib/dividendEngine';
import { SAMPLE_HOLDINGS, SAMPLE_SETTINGS } from '@/lib/dividendEngine/sampleData';
import { loadLocalSettings, saveLocalSetting } from '@/lib/dividendEngine/localSettings';
import './IncomePage.css';

function fmt(n: number): string {
  return n.toLocaleString('en-US', { style: 'currency', currency: 'USD', minimumFractionDigits: 0, maximumFractionDigits: 0 });
}
function fmtDec(n: number): string {
  return n.toLocaleString('en-US', { style: 'currency', currency: 'USD', minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

type DividendTab = 'scoring' | 'smoothing' | 'allocation' | 'forecast' | 'retirement';

function IncomePage() {
  usePageTitle('Dividend Portfolio OS');
  const [activeTab, setActiveTab] = useState<DividendTab>('scoring');
  const localSettings = loadLocalSettings();
  const [annualExpenses, setAnnualExpenses] = useState(localSettings.annualExpenses);
  const [monthlyContribution, setMonthlyContribution] = useState(localSettings.monthlyContribution);

  // Calculate all engines from sample data
  const qualityScores: QualityScore[] = useMemo(
    () => SAMPLE_HOLDINGS.map(calculateQualityScore),
    [],
  );

  const smoothing: IncomeSmoothingResult = useMemo(
    () => calculateIncomeSmoothing(SAMPLE_HOLDINGS),
    [],
  );

  const forecast: GrowthForecastResult = useMemo(
    () => calculateGrowthForecast({
      currentAnnualIncome: smoothing.annualIncome,
      historicalGrowthRate: 7,
      monthlyContribution,
      averageYield: SAMPLE_SETTINGS.averageYield,
      yearsToRetirement: 20,
    }),
    [smoothing.annualIncome, monthlyContribution],
  );

  const retirement: RetirementReadinessResult = useMemo(
    () => calculateRetirementReadiness({
      annualDividendIncome: smoothing.annualIncome,
      annualExpenses,
      monthlyContribution,
      averageYield: SAMPLE_SETTINGS.averageYield,
      dividendGrowthRate: 7,
      qualifiedDividendPct: 85,
    }),
    [smoothing.annualIncome, annualExpenses, monthlyContribution],
  );

  const allocation: AllocationResult = useMemo(
    () => calculateAllocation({
      availableCash: 2500,
      holdings: SAMPLE_HOLDINGS,
      qualityScores,
      smoothingResult: smoothing,
      totalPortfolioValue: SAMPLE_HOLDINGS.reduce((s, h) => s + h.costBasis, 0),
    }),
    [qualityScores, smoothing],
  );

  const tabs: { id: DividendTab; label: string; icon: string }[] = [
    { id: 'scoring', label: 'Quality', icon: '⭐' },
    { id: 'smoothing', label: 'Income', icon: '📅' },
    { id: 'allocation', label: 'Allocate', icon: '🎯' },
    { id: 'forecast', label: 'Forecast', icon: '📈' },
    { id: 'retirement', label: 'FI Score', icon: '🏖️' },
  ];

  return (
    <div className="page income-page">
      <h2>Dividend Portfolio OS</h2>
      <p className="div-subtitle">Quality Scoring • Income Smoothing • Capital Allocation • Growth Forecast • Retirement Readiness</p>

      {/* KPI Bar */}
      <div className="div-kpi-bar">
        <div className="div-kpi">
          <span className="div-kpi-label">Annual Income</span>
          <span className="div-kpi-value">{fmt(smoothing.annualIncome)}</span>
        </div>
        <div className="div-kpi">
          <span className="div-kpi-label">Monthly Avg</span>
          <span className="div-kpi-value">{fmt(smoothing.targetMonthly)}</span>
        </div>
        <div className="div-kpi">
          <span className="div-kpi-label">Avg Quality</span>
          <span className="div-kpi-value">{(qualityScores.reduce((s, q) => s + q.totalScore, 0) / Math.max(qualityScores.length, 1)).toFixed(0)}</span>
        </div>
        <div className="div-kpi">
          <span className="div-kpi-label">Coverage Score</span>
          <span className="div-kpi-value">{smoothing.coverageScore.toFixed(0)}</span>
        </div>
        <div className="div-kpi">
          <span className="div-kpi-label">FI Score</span>
          <span className="div-kpi-value" style={{ color: retirement.fiStatusColor }}>{retirement.fiScore.toFixed(0)}%</span>
        </div>
      </div>

      {/* Tab Selector */}
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
      {activeTab === 'scoring' && <ScoringPanel scores={qualityScores} />}
      {activeTab === 'smoothing' && <SmoothingPanel result={smoothing} />}
      {activeTab === 'allocation' && <AllocationPanel result={allocation} />}
      {activeTab === 'forecast' && <ForecastPanel result={forecast} />}
      {activeTab === 'retirement' && (
        <RetirementPanel
          result={retirement}
          annualExpenses={annualExpenses}
          onExpensesChange={(v) => { setAnnualExpenses(v); saveLocalSetting('annualExpenses', v); }}
          monthlyContribution={monthlyContribution}
          onContributionChange={(v) => { setMonthlyContribution(v); saveLocalSetting('monthlyContribution', v); }}
        />
      )}
    </div>
  );
}

/* ─── Quality Scoring Panel ───────────────────────────────────────────── */

function ScoringPanel({ scores }: { scores: QualityScore[] }) {
  const sorted = [...scores].sort((a, b) => b.totalScore - a.totalScore);
  return (
    <div className="div-panel">
      <h3>Dividend Quality Scores</h3>
      <p className="div-panel-desc">Chowder 25% • Yield Valuation 25% • Growth 20% • P/E 15% • 52W Position 10% • Payout 5%</p>
      <div className="div-scoring-table-wrap">
        <table className="div-scoring-table">
          <thead>
            <tr>
              <th>Symbol</th>
              <th>Score</th>
              <th>Rating</th>
              <th>Chowder</th>
              <th>Rel. Yield</th>
              <th>Growth</th>
              <th>P/E</th>
              <th>52W Pos</th>
              <th>Payout</th>
            </tr>
          </thead>
          <tbody>
            {sorted.map((s) => (
              <tr key={s.symbol}>
                <td className="div-symbol">{s.symbol}</td>
                <td className="div-score">{s.totalScore.toFixed(0)}</td>
                <td><span className="div-rating-badge" style={{ color: s.ratingColor }}>{s.rating}</span></td>
                <td>{s.chowderNumber.toFixed(1)}</td>
                <td>{s.relativeYield.toFixed(0)}%</td>
                <td>{s.growthScore.toFixed(0)}</td>
                <td>{s.peScore.toFixed(0)}</td>
                <td>{s.positionScore.toFixed(0)}</td>
                <td>{s.payoutScore.toFixed(0)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

/* ─── Income Smoothing Panel ──────────────────────────────────────────── */

function SmoothingPanel({ result }: { result: IncomeSmoothingResult }) {
  const maxMonthly = Math.max(...result.monthlyBreakdown.map((m) => m.projected), 1);
  return (
    <div className="div-panel">
      <h3>Income Smoothing & Calendar</h3>
      <div className="div-smooth-kpis">
        <div className="div-smooth-kpi">
          <span className="div-smooth-kpi-label">Target/Month</span>
          <span className="div-smooth-kpi-value">{fmtDec(result.targetMonthly)}</span>
        </div>
        <div className="div-smooth-kpi">
          <span className="div-smooth-kpi-label">Coverage Score</span>
          <span className="div-smooth-kpi-value">{result.coverageScore.toFixed(0)}/100</span>
        </div>
        <div className="div-smooth-kpi">
          <span className="div-smooth-kpi-label">Weakest Month</span>
          <span className="div-smooth-kpi-value">{result.weakestMonth?.monthLabel ?? '—'}</span>
        </div>
        <div className="div-smooth-kpi">
          <span className="div-smooth-kpi-label">Variance</span>
          <span className="div-smooth-kpi-value">{fmtDec(result.incomeVariance)}</span>
        </div>
      </div>
      {/* Monthly bar chart */}
      <div className="div-month-chart">
        {result.monthlyBreakdown.map((m) => (
          <div key={m.month} className="div-month-bar-col">
            <div className="div-month-amount">{fmt(m.projected)}</div>
            <div className="div-month-bar-track">
              <div
                className={`div-month-bar-fill div-month-bar-fill--${m.group.toLowerCase()}`}
                style={{ height: `${(m.projected / maxMonthly) * 100}%` }}
              />
            </div>
            <div className="div-month-label">{m.monthLabel}</div>
            <div className="div-month-group">Grp {m.group}</div>
          </div>
        ))}
        <div className="div-month-target-line" style={{ bottom: `${(result.targetMonthly / maxMonthly) * 100}%` }}>
          <span>Target</span>
        </div>
      </div>
      {/* Group Totals */}
      <div className="div-group-totals">
        {result.groupTotals.map((g) => (
          <div key={g.group} className="div-group-item">
            <span className={`div-group-badge div-group-badge--${g.group.toLowerCase()}`}>Group {g.group}</span>
            <span>{fmt(g.total)} ({g.pct.toFixed(0)}%)</span>
          </div>
        ))}
      </div>
      {/* Gap Analysis */}
      {result.gapAnalysis.largestDeficit > 0 && (
        <div className="div-gap-analysis">
          <h4>Income Gap Analysis</h4>
          <p>Weakest: <strong>{result.gapAnalysis.lowestMonth}</strong> — deficit of {fmtDec(result.gapAnalysis.largestDeficit)}/mo</p>
          <p>Need {fmtDec(result.gapAnalysis.requiredAdditionalAnnual)}/yr additional income ({fmt(result.gapAnalysis.requiredAdditionalCapital)} capital at 3% yield)</p>
        </div>
      )}
    </div>
  );
}

/* ─── Allocation Panel ────────────────────────────────────────────────── */

function AllocationPanel({ result }: { result: AllocationResult }) {
  return (
    <div className="div-panel">
      <h3>Capital Allocation — Where Should My Next Dollar Go?</h3>
      <div className="div-alloc-kpis">
        <div className="div-smooth-kpi">
          <span className="div-smooth-kpi-label">Best Buy</span>
          <span className="div-smooth-kpi-value">{result.bestBuy}</span>
        </div>
        <div className="div-smooth-kpi">
          <span className="div-smooth-kpi-label">Most Undervalued</span>
          <span className="div-smooth-kpi-value">{result.mostUndervalued}</span>
        </div>
        <div className="div-smooth-kpi">
          <span className="div-smooth-kpi-label">Weakest Group</span>
          <span className="div-smooth-kpi-value">Group {result.weakestGroup}</span>
        </div>
      </div>
      {result.candidates.length > 0 && (
        <div className="div-alloc-candidates">
          <h4>Invest {fmt(result.investmentAmount)}</h4>
          {result.candidates.map((c) => (
            <div key={c.symbol} className="div-alloc-row">
              <span className="div-alloc-pct">{c.allocationPct}%</span>
              <span className="div-alloc-symbol">{c.symbol}</span>
              <span className="div-alloc-reason">{c.reason}</span>
              <span className={`div-alloc-priority div-alloc-priority--${c.priorityLevel}`}>P{c.priorityLevel}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

/* ─── Forecast Panel ──────────────────────────────────────────────────── */

function ForecastPanel({ result }: { result: GrowthForecastResult }) {
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

/* ─── Retirement Readiness Panel ──────────────────────────────────────── */

function RetirementPanel({
  result,
  annualExpenses,
  onExpensesChange,
  monthlyContribution,
  onContributionChange,
}: {
  result: RetirementReadinessResult;
  annualExpenses: number;
  onExpensesChange: (v: number) => void;
  monthlyContribution: number;
  onContributionChange: (v: number) => void;
}) {
  return (
    <div className="div-panel">
      <h3>Retirement Income Readiness</h3>

      {/* User inputs */}
      <div className="div-retire-inputs">
        <div className="div-retire-input-group">
          <label htmlFor="annual-expenses">Annual Expenses</label>
          <input
            id="annual-expenses"
            type="number"
            value={annualExpenses}
            onChange={(e) => onExpensesChange(Number(e.target.value))}
            min={0}
            step={1000}
          />
        </div>
        <div className="div-retire-input-group">
          <label htmlFor="monthly-contrib">Monthly Contribution</label>
          <input
            id="monthly-contrib"
            type="number"
            value={monthlyContribution}
            onChange={(e) => onContributionChange(Number(e.target.value))}
            min={0}
            step={50}
          />
        </div>
      </div>

      {/* FI Score hero */}
      <div className="div-fi-hero">
        <div className="div-fi-score" style={{ color: result.fiStatusColor }}>
          {result.fiScore.toFixed(1)}%
        </div>
        <div className="div-fi-status" style={{ color: result.fiStatusColor }}>
          {result.fiStatus}
        </div>
        {result.yearsToDividendIndependence !== null && result.yearsToDividendIndependence > 0 && (
          <div className="div-fi-years">
            ~{result.yearsToDividendIndependence} years to Dividend Independence
          </div>
        )}
        {result.yearsToDividendIndependence === 0 && (
          <div className="div-fi-years div-fi-years--achieved">
            ✓ Dividend Independence Achieved
          </div>
        )}
      </div>

      {/* Metrics grid */}
      <div className="div-retire-grid">
        <div className="div-retire-metric">
          <span className="div-retire-metric-label">Annual Income</span>
          <span className="div-retire-metric-value">{fmt(result.annualIncome)}</span>
        </div>
        <div className="div-retire-metric">
          <span className="div-retire-metric-label">Monthly Income</span>
          <span className="div-retire-metric-value">{fmt(result.monthlyIncome)}</span>
        </div>
        <div className="div-retire-metric">
          <span className="div-retire-metric-label">Annual Expenses</span>
          <span className="div-retire-metric-value">{fmt(result.annualExpenses)}</span>
        </div>
        <div className="div-retire-metric">
          <span className="div-retire-metric-label">Qualified %</span>
          <span className="div-retire-metric-value">{result.qualifiedPct}%</span>
        </div>
        <div className="div-retire-metric">
          <span className="div-retire-metric-label">5yr Projected</span>
          <span className="div-retire-metric-value">{fmt(result.projectedIncome5yr)}</span>
        </div>
        <div className="div-retire-metric">
          <span className="div-retire-metric-label">10yr Projected</span>
          <span className="div-retire-metric-value">{fmt(result.projectedIncome10yr)}</span>
        </div>
        <div className="div-retire-metric">
          <span className="div-retire-metric-label">20yr Projected</span>
          <span className="div-retire-metric-value">{fmt(result.projectedIncome20yr)}</span>
        </div>
        <div className="div-retire-metric">
          <span className="div-retire-metric-label">Coverage</span>
          <span className="div-retire-metric-value" style={{ color: result.fiStatusColor }}>
            {result.coveragePct.toFixed(1)}%
          </span>
        </div>
      </div>
    </div>
  );
}

export default IncomePage;
