/**
 * Historical Portfolio Value Chart
 *
 * Uses VERIFIED manual monthly data (from spreadsheets) for accuracy.
 * Stacked area chart: Contributions → Traditional → Roth → Robinhood
 */

import { useMemo } from 'react';
import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
} from 'recharts';
import { getManualHistory, getMonthlyContributions } from '@/lib/dashboards/manualHistory';

interface DataPoint {
  month: string;
  label: string;
  contributions: number;
  traditional: number;
  roth: number;
  robinhood: number;
}

interface Props {
  liveRobinhood?: number;
  liveTraditional?: number;
  liveRoth?: number;
}

export default function HistoricalValueChart({ liveRobinhood, liveTraditional, liveRoth }: Props) {
  const data = useMemo(() => {
    const history = getManualHistory();
    const contributions = getMonthlyContributions();

    const chartData: DataPoint[] = [];
    for (const snap of history) {
      const total = snap.robinhood + snap.traditional + snap.roth;
      if (total < 100) continue;

      const [yr, mo] = snap.month.split('-');
      const label = new Date(parseInt(yr!), parseInt(mo!) - 1, 1)
        .toLocaleDateString('en-US', { month: 'short', year: '2-digit' });

      chartData.push({
        month: snap.month,
        label,
        contributions: contributions[snap.month] ?? 0,
        traditional: snap.traditional,
        roth: snap.roth,
        robinhood: snap.robinhood,
      });
    }

    // Don't add empty months — use right margin padding instead

    // Override the last data point with live values if available
    if (chartData.length > 0 && (liveRobinhood || liveTraditional || liveRoth)) {
      const last = chartData[chartData.length - 1]!;
      if (liveRobinhood) last.robinhood = Math.round(liveRobinhood);
      if (liveTraditional) last.traditional = Math.round(liveTraditional);
      if (liveRoth) last.roth = Math.round(liveRoth);
    }

    return chartData;
  }, [liveRobinhood, liveTraditional, liveRoth]);

  if (data.length === 0) return null;

  const formatDollar = (value: number) => {
    if (value >= 1000000) return `$${(value / 1000000).toFixed(1)}M`;
    if (value >= 1000) return `$${(value / 1000).toFixed(0)}k`;
    return `$${value}`;
  };

  return (
    <div className="historical-chart-section">
      <h3 className="accounting-section-title">Portfolio Value Over Time</h3>
      <ResponsiveContainer width="100%" height={380}>
        <AreaChart data={data} margin={{ top: 10, right: 60, left: 20, bottom: 5 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" />
          <XAxis
            dataKey="label"
            tick={{ fontSize: 10, fill: '#aaa' }}
            interval={Math.max(0, Math.floor(data.length / 12))}
          />
          <YAxis
            tick={{ fontSize: 11, fill: '#aaa' }}
            tickFormatter={formatDollar}
            width={55}
          />
          <Tooltip
            content={({ payload, label }) => {
              if (!payload || payload.length === 0) return null;
              const total = payload.filter(p => p.dataKey !== 'contributions').reduce((s, p) => s + ((p.value as number) ?? 0), 0);
              return (
                <div style={{ backgroundColor: '#1a1a2e', border: '1px solid #444', borderRadius: 6, padding: '8px 12px', fontSize: 11 }}>
                  <div style={{ color: '#aaa', fontWeight: 600, marginBottom: 4 }}>{label}</div>
                  {payload.map((p, i) => (
                    <div key={i} style={{ color: p.color, padding: '1px 0' }}>
                      {p.name}: {formatDollar((p.value as number) ?? 0)}
                    </div>
                  ))}
                  <div style={{ color: '#fff', fontWeight: 700, borderTop: '1px solid #555', paddingTop: 4, marginTop: 4 }}>
                    Total Portfolio: {formatDollar(total)}
                  </div>
                </div>
              );
            }}
          />
          <Legend wrapperStyle={{ fontSize: 11 }} />
          <Area type="monotone" dataKey="contributions" stroke="#aaa" fill="rgba(150,150,150,0.12)" strokeDasharray="6 3" strokeWidth={2} name="Contributions" />
          <Area type="monotone" dataKey="traditional" stackId="1" stroke="#ce93d8" fill="rgba(206,147,216,0.45)" strokeWidth={2} name="Traditional IRA" />
          <Area type="monotone" dataKey="roth" stackId="1" stroke="#42a5f5" fill="rgba(66,165,245,0.4)" strokeWidth={2} name="Roth IRA" />
          <Area type="monotone" dataKey="robinhood" stackId="1" stroke="#66bb6a" fill="rgba(102,187,106,0.4)" strokeWidth={2} name="Robinhood" />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
}
