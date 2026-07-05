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

  // Weighted average dividend growth rate (weighted by each stock's income contribution)
  const weightedGrowthRate = useMemo(() => {
    const holdingsWithIncome = scoredStocks.filter(({ stock }) => stock.sharesHeld > 0 && stock.annualDividendPerShare > 0);
    const totalIncome = holdingsWithIncome.reduce((s, { stock }) => s + stock.sharesHeld * stock.annualDividendPerShare, 0);
    if (totalIncome === 0) return 7; // fallback if no holdings
    return holdingsWithIncome.reduce((s, { stock }) => {
      const weight = (stock.sharesHeld * stock.annualDividendPerShare) / totalIncome;
      return s + stock.dividendGrowthRate * weight;
    }, 0);
  }, [scoredStocks]);

  const smoothing = useMemo(() => calculateIncomeSmoothing(TARGET_PORTFOLIO), []);

  const forecast = useMemo(() => calculateGrowthForecast({
    currentAnnualIncome: totalAnnualIncome,
    historicalGrowthRate: weightedGrowthRate,
    monthlyContribution: monthlyDeploy,
    averageYield: DIVIDEND_SETTINGS.averageYield,
    yearsToRetirement: 20,
  }), [totalAnnualIncome, monthlyDeploy, weightedGrowthRate]);

  const retirement = useMemo(() => calculateRetirementReadiness({
    annualDividendIncome: totalAnnualIncome,
    annualExpenses,
    monthlyContribution: monthlyDeploy,
    averageYield: DIVIDEND_SETTINGS.averageYield,
    dividendGrowthRate: weightedGrowthRate,
    qualifiedDividendPct: 100,
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
          <span className="dividend-summary-desc">(Income spread across 12 months)</span>
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
      {activeTab === 'income' && <IncomeTab smoothing={smoothing} scoredStocks={scoredStocks} prices={prices} />}
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
            <th className="center">Chowder</th><th className="center">Growth</th>
            <th className="center">P/E</th><th className="center narrow-col">% Below High</th>
            <th className="center">Payout</th><th className="center">Score</th>
            <th className="center">King/Arist</th><th className="numeric">Shares</th><th className="numeric narrow-col">Dividend Payment</th><th className="numeric narrow-col">Annual Income</th>
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
                <td className="center" style={{ color: getChowderColor(score.chowderNumber, stock.currentYield), fontWeight: 700 }}>{score.chowderNumber.toFixed(1)}</td>
                <td className="center" style={{ color: getGrowthColor(stock.dividendGrowthRate) }}>{stock.dividendGrowthRate.toFixed(1)}%</td>
                <td className="center" style={{ color: getPEColor(stock.peRatio) }}>{stock.peRatio.toFixed(1)}</td>
                <td className="center" style={{ color: stock.priceVs52WeekHigh >= 20 ? '#34a853' : stock.priceVs52WeekHigh >= 10 ? '#f4b400' : '#ea4335' }}>{stock.priceVs52WeekHigh}%</td>
                <td className="center" style={{ color: getPayoutColor(stock.payoutRatio) }}>{stock.payoutRatio}%</td>
                <td className="center" style={{ fontWeight: 700 }}>{score.totalScore.toFixed(0)}</td>
                <td className="center">{stock.isDividendKing ? '👑' : stock.isDividendAristocrat ? '🏆' : '—'}</td>
                <td className="numeric">{stock.sharesHeld > 0 ? stock.sharesHeld.toFixed(2) : '—'}</td>
                <td className="numeric">${(stock.annualDividendPerShare / 4 * stock.sharesHeld).toFixed(2)}</td>
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

function IncomeTab({ smoothing, scoredStocks, prices }: { smoothing: IncomeSmoothingResult; scoredStocks: { stock: DividendStockData; score: QualityScore }[]; prices: Map<string, number> }) {
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

      {/* Options Premium Income — CSPs + Covered Calls */}
      <div className="div-wheel-section">
        <h3>🔄 Options Premium Income</h3>
        <p className="div-panel-desc">
          Sell puts on stocks you want to own — get paid while you wait. If assigned, sell covered calls to create extra income. If called away, repeat.
        </p>

        {/* Wheel KPIs */}
        <div className="div-smooth-kpis">
          <div className="div-smooth-kpi">
            <span className="div-smooth-kpi-label">Active CSPs</span>
            <span className="div-smooth-kpi-value">0</span>
            <span className="div-smooth-kpi-note">Waiting for assignment</span>
          </div>
          <div className="div-smooth-kpi">
            <span className="div-smooth-kpi-label">Active Covered Calls</span>
            <span className="div-smooth-kpi-value">0</span>
            <span className="div-smooth-kpi-note">On held shares</span>
          </div>
          <div className="div-smooth-kpi">
            <span className="div-smooth-kpi-label">Premium Collected (YTD)</span>
            <span className="div-smooth-kpi-value">$0</span>
          </div>
          <div className="div-smooth-kpi">
            <span className="div-smooth-kpi-label">Assignments (YTD)</span>
            <span className="div-smooth-kpi-value">0</span>
          </div>
        </div>

        {/* Candidates */}
        <div className="div-wheel-candidates">
          <h4>Top Options Income Candidates</h4>
          <p className="div-wheel-candidates-desc">
            Stocks rated Buy or higher — sell puts to get paid while building to 100 shares, then sell covered calls for extra income.
          </p>
          <div className="deploy-cards">
            {scoredStocks
              .filter(({ score }) => score.totalScore >= 80)
              .slice(0, 4)
              .map(({ stock, score }) => {
                const price = prices.get(stock.symbol) ?? 0;
                const sharesNeeded = Math.max(0, 100 - stock.sharesHeld);
                const costTo100 = sharesNeeded * price;
                const canSellCalls = stock.sharesHeld >= 100;
                const canSellPuts = stock.sharesHeld < 100;

                let status: string;
                let statusColor: string;
                if (canSellCalls) {
                  status = '✅ Ready — sell covered calls';
                  statusColor = '#66bb6a';
                } else if (stock.sharesHeld > 0) {
                  status = `Need ${sharesNeeded.toFixed(0)} more shares ($${costTo100.toFixed(0)}) for covered calls`;
                  statusColor = '#FFB800';
                } else {
                  status = `Need 100 shares ($${costTo100.toFixed(0)}) — sell puts in the meantime`;
                  statusColor = '#4fc3f7';
                }

                const isUnderwater = canSellCalls && price > 0 && price < (stock.costBasis / stock.sharesHeld);

                // Estimated premium: Price × 2% × IV factor × time factor
                // IV proxy: stocks further below 52W high have higher IV
                const ivFactor = 1 + (stock.priceVs52WeekHigh / 100);
                const dteDays = 37; // target 30-45 DTE midpoint
                const timeFactor = Math.sqrt(dteDays / 365);
                const estPremium = price > 0 ? price * 0.02 * ivFactor * timeFactor : 2;

                return (
                  <div key={stock.symbol} className={`deploy-card ${isUnderwater ? 'deploy-card--underwater' : ''}`}>
                    <div className="deploy-card-top">
                      <span className="deploy-symbol">{stock.symbol}</span>
                      <span className="deploy-badge" style={{ color: score.ratingColor }}>{score.rating} ({score.totalScore.toFixed(0)})</span>
                    </div>
                    <span className="deploy-name">{stock.name}</span>
                    <div className="div-wheel-status">
                      <span style={{ color: statusColor, fontWeight: 600, fontSize: '0.8125rem' }}>{status}</span>
                    </div>
                    <div className="div-wheel-details">
                      <span>Shares held: <strong>{stock.sharesHeld > 0 ? stock.sharesHeld.toFixed(2) : '0'}</strong></span>
                      <span>Price: <strong>{price > 0 ? `$${price.toFixed(2)}` : '—'}</strong></span>
                      {stock.sharesHeld > 0 && (
                        <span>Cost basis/share: <strong>${(stock.costBasis / stock.sharesHeld).toFixed(2)}</strong></span>
                      )}
                      {canSellCalls && stock.costBasis > 0 && (
                        <span className="div-wheel-min-strike">
                          Min CC strike (floor): <strong>${(stock.costBasis / stock.sharesHeld).toFixed(2)}</strong>
                        </span>
                      )}
                      {isUnderwater && price > 0 && (
                        <div className="div-wheel-underwater-math">
                          <span className="div-wheel-underwater-header">⚠️ UNDERWATER — assignment = realized loss</span>
                          <span>If assigned at ${(price * 1.05).toFixed(0)} + ~${estPremium.toFixed(2)} est. premium = ${(price * 1.05 + estPremium).toFixed(2)} proceeds</span>
                          <span>vs cost basis ${(stock.costBasis / stock.sharesHeld).toFixed(2)} → <strong className="div-wheel-loss">loss of ${((stock.costBasis / stock.sharesHeld) - (price * 1.05 + estPremium)).toFixed(2)}/share</strong></span>
                          <span className="div-wheel-tax-note">💡 May be useful for tax-loss harvesting if you have gains to offset</span>
                          <span className="div-wheel-wash-note">⚠️ Wash sale: don't rebuy within 30 days or loss is disallowed</span>
                          <span className="div-wheel-est-note">Premium est. based on price, IV proxy, 37 DTE — verify in brokerage</span>
                        </div>
                      )}
                      {canSellPuts && price > 0 && (
                        <span>Put strike target: <strong>${(price * 0.92).toFixed(0)} – ${(price * 0.95).toFixed(0)}</strong></span>
                      )}
                      {canSellCalls && price > 0 && price >= (stock.costBasis / Math.max(stock.sharesHeld, 1)) && (
                        <span>Call strike target: <strong>${(price * 1.05).toFixed(0)} – ${(price * 1.10).toFixed(0)}</strong></span>
                      )}
                    </div>
                    <span className="div-wheel-group">Group {stock.calendarGroup} • {stock.priceVs52WeekHigh >= 20 ? '📉 Near 52W low' : stock.priceVs52WeekHigh >= 10 ? 'Good discount' : 'Near highs'}</span>
                  </div>
                );
              })}
          </div>
        </div>

        {/* Rules */}
        <div className="div-wheel-rules">
          <h4>Options Income Rules</h4>
          <div className="div-wheel-rules-list">
            <div className="div-wheel-rule">
              <span className="div-wheel-rule-num">1</span>
              <span>Only sell puts on stocks rated <strong>Buy or Strong Buy</strong> — you must want to own them</span>
            </div>
            <div className="div-wheel-rule">
              <span className="div-wheel-rule-num">2</span>
              <span>Strike 5-10% below current price — get paid to wait for a discount</span>
            </div>
            <div className="div-wheel-rule">
              <span className="div-wheel-rule-num">3</span>
              <span>DTE 30-45 days — sweet spot for theta decay</span>
            </div>
            <div className="div-wheel-rule">
              <span className="div-wheel-rule-num">4</span>
              <span>If assigned, sell covered calls to create extra income (5-10% above cost basis)</span>
            </div>
            <div className="div-wheel-rule">
              <span className="div-wheel-rule-num">5</span>
              <span>Never sell covered calls below your cost basis — don't lock in a loss</span>
            </div>
            <div className="div-wheel-rule">
              <span className="div-wheel-rule-num">6</span>
              <span>⚠️ Hold 60+ days before CC assignment to keep dividends qualified</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

/* ─── Forecast Tab ─────────────────────────────────────────────────────── */

function ForecastTab({ result }: { result: GrowthForecastResult }) {
  return (
    <div className="div-panel">
      <h3>Dividend Growth Forecast</h3>
      <p className="div-panel-desc">
        If you keep doing what you're doing, how much dividend income will you have?
      </p>

      {/* Current stats */}
      <div className="div-smooth-kpis">
        <div className="div-smooth-kpi">
          <span className="div-smooth-kpi-label">Current Annual Income</span>
          <span className="div-smooth-kpi-value">{fmtDec(result.currentIncome)}</span>
        </div>
        <div className="div-smooth-kpi">
          <span className="div-smooth-kpi-label">Portfolio Dividend Growth Rate</span>
          <span className="div-smooth-kpi-value">{result.growthRate.toFixed(2)}%/yr</span>
          <span className="div-smooth-kpi-note">Weighted by income contribution</span>
        </div>
        <div className="div-smooth-kpi">
          <span className="div-smooth-kpi-label">Monthly Contribution</span>
          <span className="div-smooth-kpi-value">{fmt(result.monthlyContribution)}/mo</span>
        </div>
      </div>

      {/* Scenario explanation */}
      <div className="div-forecast-explainer">
        <div className="div-forecast-scenario div-forecast-scenario--primary">
          <span className="div-forecast-scenario-label div-forecast-scenario-label--base">Base Case — Most Likely</span>
          <span className="div-forecast-scenario-desc">Dividends grow at historical rate ({result.growthRate.toFixed(2)}%/yr)</span>
        </div>
        <div className="div-forecast-scenario">
          <span className="div-forecast-scenario-label">Conservative — Worst Case</span>
          <span className="div-forecast-scenario-desc">Growth slows to half ({(result.growthRate * 0.5).toFixed(2)}%/yr)</span>
        </div>
        <div className="div-forecast-scenario">
          <span className="div-forecast-scenario-label">Optimistic — Best Case</span>
          <span className="div-forecast-scenario-desc">Growth accelerates ({(result.growthRate * 1.25).toFixed(2)}%/yr)</span>
        </div>
      </div>

      {/* Projection table */}
      <div className="div-forecast-table-wrap">
        <table className="div-forecast-table">
          <thead>
            <tr>
              <th>Period</th>
              <th className="div-forecast-col--primary" title="Dividends grow at historical rate — most likely outcome">Base Case</th>
              <th title="Dividends grow at 50% of historical rate">Conservative</th>
              <th title="Dividends grow at 125% of historical rate">Optimistic</th>
              <th title="Additional income from new money invested each month">From Contributions</th>
            </tr>
          </thead>
          <tbody>
            {result.forecasts.map((f) => (
              <tr key={f.years}>
                <td className="div-forecast-period">{f.label}</td>
                <td className="div-forecast-base">{fmt(f.base)}</td>
                <td>{fmt(f.conservative)}</td>
                <td>{fmt(f.optimistic)}</td>
                <td className="div-forecast-contrib">+{fmt(f.contributionImpact)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* How to read this */}
      <div className="div-forecast-note">
        <strong>How to read this:</strong> Base Case 10yr shows your projected annual dividend income in 10 years.
        This combines growth from existing holdings + new income from monthly contributions compounding over time.
        The "From Contributions" column shows how much of the total comes specifically from new money you invest.
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
