/**
 * Trading Engine Panel — Portfolio OS v3
 *
 * Unified dashboard layout:
 * 1. Signal Banner (GO/CAUTION/NO_TRADE)
 * 2. Market Cards (Volatility, Correction+Strikes, Trend+MAs, Portfolio Heat)
 * 3. Circuit Breakers
 * 4. Entry Checklist
 * 5. Capital & Performance (merged slot mgmt + efficiency + performance)
 * 6. Monthly P&L bar chart
 */

import { useEffect, useState } from 'react';
import { fetchTradingEngineData, type ExtendedMarketData } from '@/lib/tradingEngine/fetchMarketData';
import {
  evaluateMarketConditions,
  type TradingSignal,
} from '@/lib/tradingEngine/marketSignals';
import { calculatePortfolioHeat, type PortfolioHeatData } from '@/lib/tradingEngine/portfolioHeat';
import { calculateSlotMetrics, type SlotMetrics } from '@/lib/tradingEngine/slotReuse';
import { evaluateCircuitBreakers, type CircuitBreakerStatus } from '@/lib/tradingEngine/circuitBreakers';
import { generateEntryChecklist, type ChecklistItem } from '@/lib/tradingEngine/entryChecklist';
import { evaluateMarketCondition, type MarketCondition } from '@/lib/tradingEngine/marketCondition';
import { classifyVixPattern, estimateWeeksElevated, type VixPattern } from '@/lib/tradingEngine/vixPatterns';
import { evaluateDteLadder, type DteLadderState } from '@/lib/tradingEngine/dteLadder';
import { generatePositionAlerts, type PositionAlert } from '@/lib/tradingEngine/positionAlerts';
import type { OptionsAccountingSummary } from '@/lib/options/optionsAccounting';
import './TradingEnginePanel.css';

interface Props {
  accountValue: number;
  optionsData: OptionsAccountingSummary | null;
}

function fmt(n: number): string {
  return n.toLocaleString('en-US', { style: 'currency', currency: 'USD', minimumFractionDigits: 0, maximumFractionDigits: 0 });
}

function fmtDec(n: number): string {
  return n.toLocaleString('en-US', { style: 'currency', currency: 'USD', minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function fmtPrice(n: number): string {
  return n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

export default function TradingEnginePanel({ accountValue, optionsData }: Props) {
  const [signal, setSignal] = useState<TradingSignal | null>(null);
  const [data, setData] = useState<ExtendedMarketData | null>(null);
  const [heat, setHeat] = useState<PortfolioHeatData | null>(null);
  const [breakers, setBreakers] = useState<CircuitBreakerStatus | null>(null);
  const [checklist, setChecklist] = useState<ChecklistItem[]>([]);
  const [slotMetrics, setSlotMetrics] = useState<SlotMetrics | null>(null);
  const [marketCondition, setMarketCondition] = useState<MarketCondition | null>(null);
  const [vixPattern, setVixPattern] = useState<VixPattern | null>(null);
  const [dteLadder, setDteLadder] = useState<DteLadderState | null>(null);
  const [positionAlerts, setPositionAlerts] = useState<PositionAlert[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function load() {
      setLoading(true);
      const mktData = await fetchTradingEngineData();
      if (mktData) {
        setData(mktData);
        const sig = evaluateMarketConditions(mktData);
        setSignal(sig);

        // Market Condition (Green/Yellow/Red/Black from spec)
        const condition = evaluateMarketCondition(mktData.vixLevel);
        setMarketCondition(condition);

        // VIX Pattern (1-4 from spec)
        const weeksElev = estimateWeeksElevated(mktData.allVixCloses);
        const pattern = classifyVixPattern({
          currentVix: mktData.vixLevel,
          vix20DayAvg: mktData.vix20DayAvg,
          recentVixValues: mktData.recentVixCloses,
          weeksElevated: weeksElev,
        });
        setVixPattern(pattern);

        const openPositions = optionsData?.openPositions ?? [];
        const heatData = calculatePortfolioHeat(accountValue, openPositions);
        setHeat(heatData);

        const breakerData = evaluateCircuitBreakers({
          accountValue,
          peakAccountValue: accountValue,
          vixLevel: mktData.vixLevel,
          vix20DayAgo: mktData.vix20DayAgo,
          spxPrice: mktData.spxPrice,
          spx20DayAgo: mktData.spx20DayAgo,
          openPositionsCount: openPositions.length,
          threatenedPositionsCount: 0,
          spx200DMA: mktData.spx200DMA,
          portfolioHeatPct: heatData.heatPct,
        });
        setBreakers(breakerData);
        setChecklist(generateEntryChecklist(sig, heatData, breakerData));

        // DTE Ladder
        const openDTEs = openPositions.map((p) => {
          const exp = new Date(p.expirationDate + 'T16:00:00');
          return Math.round((exp.getTime() - Date.now()) / (1000 * 60 * 60 * 24));
        });
        const slotsAvail = heatData.slotsTotal - heatData.slotsOpen;
        const ladder = evaluateDteLadder(condition.level, mktData.vixLevel, slotsAvail, openDTEs);
        setDteLadder(ladder);

        // Position Alerts
        const alerts = generatePositionAlerts({
          openPositions,
          currentSpxPrice: mktData.spxPrice,
          marketCondition: condition.level,
        });
        setPositionAlerts(alerts);

        const completed = [...(optionsData?.closedPositions ?? []), ...(optionsData?.expiredPositions ?? [])];
        const metrics = calculateSlotMetrics(completed, accountValue);
        metrics.activeSlots = openPositions.length;
        setSlotMetrics(metrics);
      }
      setLoading(false);
    }
    load();
  }, [accountValue, optionsData]);

  if (loading) {
    return <div className="engine-card"><p className="engine-loading">Loading trading engine…</p></div>;
  }
  if (!signal || !data) {
    return <div className="engine-card"><p className="engine-error">Unable to fetch market data.</p></div>;
  }

  const passedCount = checklist.filter((c) => c.passed).length;
  const monthlyPnL = optionsData?.monthlyPnL ?? [];

  return (
    <div className="engine-panel">
      {/* ─── Market Condition Banner (Spec Section 2) ─── */}
      {marketCondition && (
        <div className="engine-condition" style={{ borderColor: marketCondition.color }}>
          <div className="engine-condition-indicator" style={{ backgroundColor: marketCondition.color }} />
          <div className="engine-condition-info">
            <div className="engine-condition-level" style={{ color: marketCondition.color }}>
              {marketCondition.level}
            </div>
            <div className="engine-condition-meaning">{marketCondition.meaning}</div>
            <div className="engine-condition-sizing">{marketCondition.sizingNote}</div>
          </div>
          {vixPattern && (
            <div className="engine-vix-pattern">
              <div className="engine-vix-pattern-num" style={{ color: vixPattern.color }}>
                Pattern {vixPattern.pattern}
              </div>
              <div className="engine-vix-pattern-label">{vixPattern.label}</div>
              <div className="engine-vix-pattern-signal" style={{ color: vixPattern.canEnter ? '#66bb6a' : '#ef5350' }}>
                {vixPattern.signal}
              </div>
            </div>
          )}
        </div>
      )}

      {/* ─── Signal Banner ─── */}
      <div className={`engine-signal engine-signal--${signal.level.toLowerCase()}`}>
        <div className="engine-signal-level">{signal.level.replace('_', ' ')}</div>
        <div className="engine-signal-sizing">Sizing: <strong>{signal.suggestedSizing}%</strong></div>
        <div className="engine-signal-reasons">
          {signal.reasons.map((r, i) => <span key={i} className="engine-reason">{r}</span>)}
        </div>
      </div>

      {/* ─── Position Alerts (Spec Section 11.3) ─── */}
      {positionAlerts.length > 0 && (
        <div className="engine-alerts">
          <h4>Position Alerts</h4>
          <div className="engine-alerts-list">
            {positionAlerts.map((alert, i) => (
              <div key={i} className={`engine-alert engine-alert--${alert.severity}`}>
                <div className="engine-alert-header">
                  <span className="engine-alert-severity">{alert.severity.toUpperCase()}</span>
                  <span className="engine-alert-title">{alert.title}</span>
                </div>
                <div className="engine-alert-position">{alert.positionLabel}</div>
                <div className="engine-alert-message">{alert.message}</div>
                <div className="engine-alert-action" style={{ color: alert.color }}>{alert.action}</div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ─── Market Cards ─── */}
      <div className="engine-grid">
        {/* Volatility Card */}
        <div className="engine-card">
          <h4>VIX / Volatility</h4>
          <div className="engine-metric">
            <span className="engine-metric-label">Current</span>
            <span className="engine-metric-value" style={{ color: signal.volatility.color }}>
              {data.vixLevel.toFixed(2)}
            </span>
          </div>
          <div className="engine-badge" style={{ backgroundColor: signal.volatility.color + '22', color: signal.volatility.color }}>
            {signal.volatility.label}
          </div>
          <div className="engine-range-row">
            <span>30-Day:</span>
            <span>{data.vix30DayLow?.toFixed(1) ?? '—'} — {data.vix30DayHigh?.toFixed(1) ?? '—'}</span>
          </div>
          <div className="engine-range-row">
            <span>52-Week:</span>
            <span>{data.vix52WeekLow?.toFixed(1) ?? '—'} — {data.vix52WeekHigh?.toFixed(1) ?? '—'}</span>
          </div>
          {signal.vixExpansion.pct5Day !== null && (
            <div className="engine-range-row">
              <span>5-Day Δ:</span>
              <span className={signal.vixExpansion.isRapid ? 'engine-warn' : ''}>
                {signal.vixExpansion.pct5Day > 0 ? '+' : ''}{signal.vixExpansion.pct5Day.toFixed(1)}%
              </span>
            </div>
          )}
          <p className="engine-desc">{signal.volatility.description}</p>
        </div>

        {/* Correction + Strike Targets Card */}
        <div className="engine-card engine-card--wide">
          <h4>SPX Correction & Strike Targets</h4>
          <div className="engine-correction-header">
            <div className="engine-spx-stack">
              <div className="engine-spx-row">
                <span>52W High</span>
                <span className="engine-spx-price">${fmtPrice(data.spx52WeekHigh)}</span>
              </div>
              <div className="engine-spx-row engine-spx-row--current">
                <span>Current</span>
                <span className="engine-spx-price engine-spx-price--current">${fmtPrice(data.spxPrice)}</span>
              </div>
              <div className="engine-spx-row">
                <span>52W Low</span>
                <span className="engine-spx-price">${fmtPrice(data.spx52WeekLow)}</span>
              </div>
            </div>
            <div className="engine-correction-badge">
              <div className="engine-badge" style={{ backgroundColor: signal.correction.color + '22', color: signal.correction.color }}>
                {signal.correction.label}
              </div>
              <span className="engine-correction-pct" style={{ color: signal.correction.color }}>
                -{signal.correction.pctFromHigh.toFixed(1)}% from high
              </span>
              <p className="engine-desc">{signal.correction.sizingNote}</p>
            </div>
          </div>
          {/* Strike target table */}
          <table className="engine-strike-table">
            <thead>
              <tr><th>% Below</th><th>Strike</th><th>% Below</th><th>Strike</th></tr>
            </thead>
            <tbody>
              <tr>
                <td>8%</td><td>${fmtPrice(data.spxPrice * 0.92)}</td>
                <td>12%</td><td>${fmtPrice(data.spxPrice * 0.88)}</td>
              </tr>
              <tr>
                <td>9%</td><td>${fmtPrice(data.spxPrice * 0.91)}</td>
                <td>13%</td><td>${fmtPrice(data.spxPrice * 0.87)}</td>
              </tr>
              <tr>
                <td>10%</td><td>${fmtPrice(data.spxPrice * 0.90)}</td>
                <td>14%</td><td>${fmtPrice(data.spxPrice * 0.86)}</td>
              </tr>
              <tr>
                <td>11%</td><td>${fmtPrice(data.spxPrice * 0.89)}</td>
                <td>15%</td><td>${fmtPrice(data.spxPrice * 0.85)}</td>
              </tr>
            </tbody>
          </table>
        </div>

        {/* Trend Card (50 + 200 DMA) */}
        <div className="engine-card">
          <h4>Trend (Moving Averages)</h4>
          <div className="engine-badge" style={{ backgroundColor: signal.trend.color + '22', color: signal.trend.color }}>
            {signal.trend.label}
          </div>
          <div className="engine-ma-rows">
            <div className="engine-ma-row">
              <span>SPX Price</span>
              <span className="engine-ma-val">${fmtPrice(data.spxPrice)}</span>
            </div>
            <div className="engine-ma-row">
              <span>50 DMA</span>
              <span className="engine-ma-val">{data.spx50DMA ? `$${fmtPrice(data.spx50DMA)}` : '—'}</span>
            </div>
            <div className="engine-ma-row">
              <span>200 DMA</span>
              <span className="engine-ma-val">{data.spx200DMA ? `$${fmtPrice(data.spx200DMA)}` : '—'}</span>
            </div>
            {signal.trend.pctFrom200DMA !== null && (
              <div className="engine-ma-row">
                <span>vs 200 DMA</span>
                <span className="engine-ma-val" style={{ color: signal.trend.color }}>
                  {signal.trend.pctFrom200DMA > 0 ? '+' : ''}{signal.trend.pctFrom200DMA.toFixed(1)}%
                </span>
              </div>
            )}
            {data.spx50DMA && (
              <div className="engine-ma-row">
                <span>vs 50 DMA</span>
                <span className="engine-ma-val">
                  {((data.spxPrice - data.spx50DMA) / data.spx50DMA * 100) > 0 ? '+' : ''}
                  {((data.spxPrice - data.spx50DMA) / data.spx50DMA * 100).toFixed(1)}%
                </span>
              </div>
            )}
          </div>
        </div>

        {/* Portfolio Heat */}
        {heat && (
          <div className="engine-card">
            <h4>Portfolio Heat</h4>
            <div className="engine-metric">
              <span className="engine-metric-label">Heat</span>
              <span className="engine-metric-value" style={{ color: heat.heatColor }}>
                {heat.heatPct.toFixed(1)}%
              </span>
            </div>
            <div className="engine-badge" style={{ backgroundColor: heat.heatColor + '22', color: heat.heatColor }}>
              {heat.heatLevel} (target 20-30%)
            </div>
            <div className="engine-range-row">
              <span>Open Risk</span><span>{fmt(heat.totalOpenRisk)}</span>
            </div>
            <div className="engine-range-row">
              <span>Available</span><span>{fmt(heat.availableNewRisk)}</span>
            </div>
            <div className="engine-range-row">
              <span>Slots</span><span>{heat.slotsOpen} / {heat.slotsTotal}</span>
            </div>
          </div>
        )}
      </div>

      {/* ─── Circuit Breakers ─── */}
      {breakers && (
        <div className={`engine-breakers ${breakers.anyActive ? 'engine-breakers--active' : ''}`}>
          <h4>Circuit Breakers {breakers.isBlackSwan && '⚠️'}</h4>
          <div className="engine-breaker-status" style={{ color: breakers.statusColor }}>
            {breakers.statusLabel}
          </div>
          {breakers.blackSwanTriggers.length > 0 && (
            <ul className="engine-triggers">
              {breakers.blackSwanTriggers.map((t, i) => <li key={i}>{t}</li>)}
            </ul>
          )}
        </div>
      )}

      {/* ─── Entry Checklist ─── */}
      <div className="engine-checklist">
        <h4>Entry Checklist <span className={`engine-checklist-count ${passedCount === checklist.length ? 'engine-checklist-count--all' : ''}`}>{passedCount}/{checklist.length}</span></h4>
        <div className="engine-checklist-items">
          {checklist.map((item, i) => (
            <div key={i} className={`engine-check-item ${item.passed ? 'engine-check-item--pass' : 'engine-check-item--fail'}`}>
              <span className="engine-check-icon">{item.passed ? '✓' : '✗'}</span>
              <span className="engine-check-label">{item.label}</span>
              <span className="engine-check-detail">{item.detail}</span>
            </div>
          ))}
        </div>
      </div>

      {/* ─── DTE Ladder (Spec Section 5 / 11.5) ─── */}
      {dteLadder && (
        <div className="engine-card engine-dte-ladder">
          <h4>DTE Ladder <span className="engine-dte-fill-order">{dteLadder.fillOrder}</span></h4>
          <div className="engine-dte-rungs">
            {dteLadder.rungs.map((rung) => (
              <div key={rung.priority} className={`engine-dte-rung ${rung.available ? 'engine-dte-rung--available' : 'engine-dte-rung--disabled'} ${rung.occupied ? 'engine-dte-rung--occupied' : ''}`}>
                <div className="engine-dte-rung-header">
                  <span className="engine-dte-priority">P{rung.priority}</span>
                  <span className="engine-dte-label">{rung.label}</span>
                  <span className={`engine-dte-theta engine-dte-theta--${rung.thetaBehavior}`}>{rung.thetaBehavior}</span>
                  {rung.occupied && <span className="engine-dte-occupied-badge">OCCUPIED</span>}
                  {!rung.available && <span className="engine-dte-disabled-badge">UNAVAILABLE</span>}
                </div>
                <div className="engine-dte-rung-details">
                  <span className="engine-dte-range">{rung.dteRange} days</span>
                  <span className="engine-dte-theta-desc">{rung.thetaDescription}</span>
                </div>
                {rung.disabledReason && (
                  <div className="engine-dte-disabled-reason">{rung.disabledReason}</div>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ─── 7 Non-Negotiable Rules (Spec Section 10) ─── */}
      <div className="engine-rules">
        <h4>7 Non-Negotiable Rules</h4>
        <div className="engine-rules-list">
          <div className="engine-rule"><span className="engine-rule-num">1</span><span>Close at 50% profit. Do not hold for more.</span></div>
          <div className="engine-rule"><span className="engine-rule-num">2</span><span>Close at 21 DTE regardless of profit/loss.</span></div>
          <div className="engine-rule"><span className="engine-rule-num">3</span><span>Enter on dips only. Never in a calm, rising market.</span></div>
          <div className="engine-rule"><span className="engine-rule-num">4</span><span>90 DTE first. Always fill P1 before any other rung.</span></div>
          <div className="engine-rule"><span className="engine-rule-num">5</span><span>No 60-day spreads in Yellow. Time buffer insufficient.</span></div>
          <div className="engine-rule"><span className="engine-rule-num">6</span><span>Half size in Yellow. Elevated risk is real.</span></div>
          <div className="engine-rule"><span className="engine-rule-num">7</span><span>Black means close everything. No analysis required.</span></div>
        </div>
      </div>

      {/* ─── Capital & Performance (merged) ─── */}
      {slotMetrics && (
        <div className="engine-card">
          <h4>Capital Efficiency & Performance</h4>
          <div className="engine-efficiency-grid">
            <div className="engine-eff-item">
              <span className="engine-eff-label">Total Trades</span>
              <span className="engine-eff-value">{optionsData?.totalTrades ?? 0}</span>
            </div>
            <div className="engine-eff-item">
              <span className="engine-eff-label">Win Rate</span>
              <span className="engine-eff-value">{optionsData && optionsData.winRate > 0 ? `${optionsData.winRate.toFixed(0)}%` : '—'}</span>
            </div>
            <div className="engine-eff-item">
              <span className="engine-eff-label">Avg Days Held</span>
              <span className="engine-eff-value">{slotMetrics.avgDaysCapitalCommitted > 0 ? `${slotMetrics.avgDaysCapitalCommitted.toFixed(0)}` : '—'}</span>
            </div>
            <div className="engine-eff-item">
              <span className="engine-eff-label">Slot Turnover</span>
              <span className="engine-eff-value">{slotMetrics.avgSlotTurnover > 0 ? `${slotMetrics.avgSlotTurnover.toFixed(1)}x/yr` : '—'}</span>
            </div>
            <div className="engine-eff-item">
              <span className="engine-eff-label">Return/Slot/Year</span>
              <span className="engine-eff-value">{slotMetrics.avgAnnualSlotYield !== 0 ? `${slotMetrics.avgAnnualSlotYield.toFixed(1)}%` : '—'}</span>
            </div>
            <div className="engine-eff-item">
              <span className="engine-eff-label">12M Profit</span>
              <span className="engine-eff-value engine-eff-value--green">{fmtDec(slotMetrics.trailing12mProfit)}</span>
            </div>
          </div>
        </div>
      )}

      {/* ─── Monthly P&L Vertical Bar Chart (grouped by month, colored by year) ─── */}
      {monthlyPnL.length > 0 && (
        <div className="engine-card">
          <h4>Monthly Realized P&L</h4>
          {(() => {
            // Group by month (1-12) with year data
            const monthGroups = new Map<number, { year: string; realized: number }[]>();
            const years = new Set<string>();

            for (const m of monthlyPnL) {
              const [yr, mo] = m.month.split('-');
              const monthNum = parseInt(mo!, 10);
              years.add(yr!);
              if (!monthGroups.has(monthNum)) monthGroups.set(monthNum, []);
              monthGroups.get(monthNum)!.push({ year: yr!, realized: m.realized });
            }

            const sortedYears = [...years].sort();
            const yearColors: Record<string, string> = {};
            const palette = ['#4fc3f7', '#66bb6a', '#ffca28', '#ce93d8', '#ff8a65'];
            sortedYears.forEach((y, i) => { yearColors[y] = palette[i % palette.length]!; });

            const maxVal = Math.max(...monthlyPnL.map((m) => Math.abs(m.realized)), 1);
            const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

            return (
              <>
                <div className="engine-vbar-legend">
                  {sortedYears.map((y) => (
                    <span key={y} className="engine-vbar-legend-item">
                      <span className="engine-vbar-legend-swatch" style={{ backgroundColor: yearColors[y] }} />
                      {y}
                    </span>
                  ))}
                </div>
                <div className="engine-vbar-chart">
                  <div className="engine-vbar-bars">
                    {months.map((monthLabel, monthIdx) => {
                      const monthNum = monthIdx + 1;
                      const data = monthGroups.get(monthNum) ?? [];
                      return (
                        <div key={monthNum} className="engine-vbar-group">
                          <div className="engine-vbar-group-bars">
                            {sortedYears.map((yr) => {
                              const entry = data.find((d) => d.year === yr);
                              if (!entry) return <div key={yr} className="engine-vbar-spacer" />;
                              const barPct = (Math.abs(entry.realized) / maxVal) * 90;
                              const isPos = entry.realized >= 0;
                              return (
                                <div key={yr} className="engine-vbar-col">
                                  <div className="engine-vbar-container">
                                    {isPos ? (
                                      <>
                                        <div className="engine-vbar-top">
                                          <div className="engine-vbar-fill" style={{ height: `${barPct}%`, backgroundColor: yearColors[yr] }} />
                                        </div>
                                        <div className="engine-vbar-bottom" />
                                      </>
                                    ) : (
                                      <>
                                        <div className="engine-vbar-top" />
                                        <div className="engine-vbar-bottom">
                                          <div className="engine-vbar-fill engine-vbar-fill--neg" style={{ height: `${barPct}%`, backgroundColor: `${yearColors[yr]}88` }} />
                                        </div>
                                      </>
                                    )}
                                  </div>
                                </div>
                              );
                            })}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
                {/* Data table below chart */}
                <table className="engine-monthly-table">
                  <thead>
                    <tr>
                      <th></th>
                      {months.map((m) => <th key={m}>{m}</th>)}
                      <th>Total</th>
                    </tr>
                  </thead>
                  <tbody>
                    {sortedYears.map((yr) => {
                      let yearTotal = 0;
                      return (
                        <tr key={yr}>
                          <td className="engine-monthly-year" style={{ color: yearColors[yr] }}>{yr}</td>
                          {months.map((_, monthIdx) => {
                            const monthNum = monthIdx + 1;
                            const entry = (monthGroups.get(monthNum) ?? []).find((d) => d.year === yr);
                            if (entry) yearTotal += entry.realized;
                            return (
                              <td key={monthIdx} className={entry ? (entry.realized >= 0 ? 'engine-monthly-pos' : 'engine-monthly-neg') : ''}>
                                {entry ? `$${Math.round(entry.realized)}` : ''}
                              </td>
                            );
                          })}
                          <td className={yearTotal >= 0 ? 'engine-monthly-pos engine-monthly-total' : 'engine-monthly-neg engine-monthly-total'}>
                            ${Math.round(yearTotal)}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </>
            );
          })()}
        </div>
      )}
    </div>
  );
}
