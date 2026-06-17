import { useState, useEffect, useCallback } from 'react';
import { usePageTitle } from '@/hooks/usePageTitle';
import {
  fetchConcentrationRisk,
  calculateMaxDrawdown,
  type RiskDashboardData,
  type MaxDrawdownResult,
} from '@/lib/dashboards/risk';
import './RiskPage.css';

/** Format a number as a percentage string */
function formatPct(value: number): string {
  return `${value.toFixed(1)}%`;
}

/** Format a number as USD currency string */
function formatCurrency(value: number): string {
  return value.toLocaleString('en-US', {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  });
}

function RiskPage() {
  usePageTitle('Risk Dashboard');

  const [data, setData] = useState<RiskDashboardData | null>(null);
  const [drawdown, setDrawdown] = useState<MaxDrawdownResult | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const loadData = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);

      const riskData = await fetchConcentrationRisk();
      setData(riskData);

      // Calculate drawdown from position values (simulated historical snapshot)
      const values = riskData.concentration.map((entry) => entry.value);
      if (values.length >= 2) {
        setDrawdown(calculateMaxDrawdown(values));
      } else {
        setDrawdown({ maxDrawdown: 0, peakIndex: 0, troughIndex: 0 });
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load risk data');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadData();
  }, [loadData]);

  if (loading) {
    return (
      <div className="page risk-page">
        <h2>Risk Dashboard</h2>
        <div className="risk-loading">Loading risk data…</div>
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="page risk-page">
        <h2>Risk Dashboard</h2>
        <div className="risk-error">
          <p>{error ?? 'Unable to load risk data.'}</p>
          <button className="risk-retry-btn" onClick={() => loadData()}>
            Retry
          </button>
        </div>
      </div>
    );
  }

  const flaggedPositions = data.concentration.filter((entry) => entry.flagged);

  return (
    <div className="page risk-page">
      <h2>Risk Dashboard</h2>
      <p>Concentration risk, portfolio drawdown, and flagged positions.</p>

      {/* Max Drawdown Card */}
      <div className="risk-drawdown-card">
        <span className="risk-drawdown-label">Max Drawdown</span>
        <span className="risk-drawdown-value">
          {drawdown ? formatPct(drawdown.maxDrawdown) : '0.0%'}
        </span>
      </div>

      {/* Concentration Chart */}
      <div className="risk-concentration">
        <h3 className="risk-section-title">
          Position Concentration (threshold: {formatPct(data.threshold_pct)})
        </h3>
        <div className="risk-concentration-bars">
          {data.concentration.map((entry) => (
            <div
              className={`risk-bar-row ${entry.flagged ? 'risk-bar-row--flagged' : ''}`}
              key={entry.symbol}
            >
              <div className="risk-bar-header">
                <span className="risk-bar-label">
                  {entry.symbol}
                  {entry.flagged && <span className="risk-flag-badge">⚠</span>}
                </span>
                <span className="risk-bar-amount">
                  {formatCurrency(entry.value)} ({formatPct(entry.percentage)})
                </span>
              </div>
              <div className="risk-bar-track">
                <div
                  className={`risk-bar-fill ${entry.flagged ? 'risk-bar-fill--flagged' : ''}`}
                  style={{ width: `${Math.min(entry.percentage, 100)}%` }}
                  role="progressbar"
                  aria-valuenow={entry.percentage}
                  aria-valuemin={0}
                  aria-valuemax={100}
                  aria-label={`${entry.symbol}: ${formatPct(entry.percentage)} of portfolio`}
                />
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Flagged Positions */}
      {flaggedPositions.length > 0 && (
        <div className="risk-flagged">
          <h3 className="risk-section-title">Flagged Positions</h3>
          <ul className="risk-flagged-list">
            {flaggedPositions.map((entry) => (
              <li key={entry.symbol} className="risk-flagged-item">
                <span className="risk-flagged-symbol">{entry.symbol}</span>
                <span className="risk-flagged-pct">{formatPct(entry.percentage)}</span>
                <span className="risk-flagged-note">
                  Exceeds {formatPct(data.threshold_pct)} threshold
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}

export default RiskPage;
