/**
 * Retirement Growth Chart
 *
 * Stacked area: contributions (bottom) + growth (top)
 * Dashed projection lines from current value forward at 6%, 7%, 8%, 9%, 10%
 * Additional 401k projection line (higher contribution limit)
 */

import {
  ComposedChart,
  Area,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
  ReferenceLine,
} from 'recharts';

interface GrowthChartProps {
  totalContributions: number;
  currentValue: number;
  annualContribution: number; // IRA limit ($8,000)
  retirementYear: number;
  currentYear: number;
}

// 2025 401k limits: $23,500 + $7,500 catch-up (age 50+) = $31,000
// Plus employer match assumption
const FOUR01K_ANNUAL = 31000; // catch-up eligible
const FOUR01K_WITH_MATCH = 40000; // assume ~$9k employer match

interface DataPoint {
  year: number;
  contributions: number | null;
  growth: number | null;
  proj6: number | null;
  proj7: number | null;
  proj8: number | null;
  proj9: number | null;
  proj10: number | null;
  proj401k: number | null;
}

export default function GrowthChart({
  totalContributions,
  currentValue,
  annualContribution,
  retirementYear,
  currentYear,
}: GrowthChartProps) {
  const startYear = 2018;
  const yearsInvested = currentYear - startYear;
  const growth = Math.max(0, currentValue - totalContributions);

  const data: DataPoint[] = [];

  // Historical points (startYear to currentYear)
  for (let yr = startYear; yr <= currentYear; yr++) {
    const progress = (yr - startYear) / Math.max(1, yearsInvested);
    const contrib = totalContributions * progress;
    const growthAtYear = growth * progress * progress;
    data.push({
      year: yr,
      contributions: Math.round(contrib),
      growth: Math.round(growthAtYear),
      proj6: null,
      proj7: null,
      proj8: null,
      proj9: null,
      proj10: null,
      proj401k: null,
    });
  }

  // Add a bridge point at current year with projection values starting
  // (overwrite last historical point to also have projection start values)
  if (data.length > 0) {
    const last = data[data.length - 1]!;
    last.proj6 = currentValue;
    last.proj7 = currentValue;
    last.proj8 = currentValue;
    last.proj9 = currentValue;
    last.proj10 = currentValue;
    last.proj401k = currentValue;
  }

  // Future projection points
  for (let yr = currentYear + 1; yr <= retirementYear; yr++) {
    const yearsForward = yr - currentYear;
    const futureContrib = totalContributions + annualContribution * yearsForward;

    // IRA projections at various rates
    const calc = (rate: number) =>
      Math.round(
        currentValue * Math.pow(1 + rate, yearsForward) +
        annualContribution * ((Math.pow(1 + rate, yearsForward) - 1) / rate)
      );

    // 401k projection at 8% with higher contributions
    const proj401k = Math.round(
      currentValue * Math.pow(1.08, yearsForward) +
      FOUR01K_WITH_MATCH * ((Math.pow(1.08, yearsForward) - 1) / 0.08)
    );

    data.push({
      year: yr,
      contributions: Math.round(futureContrib),
      growth: null,
      proj6: calc(0.06),
      proj7: calc(0.07),
      proj8: calc(0.08),
      proj9: calc(0.09),
      proj10: calc(0.10),
      proj401k,
    });
  }

  const formatDollar = (value: number) => {
    if (value >= 1000000) return `$${(value / 1000000).toFixed(1)}M`;
    if (value >= 1000) return `$${(value / 1000).toFixed(0)}k`;
    return `$${value}`;
  };

  return (
    <div className="growth-chart-wrapper">
      <ResponsiveContainer width="100%" height={380}>
        <ComposedChart data={data} margin={{ top: 10, right: 30, left: 20, bottom: 5 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.06)" />
          <XAxis
            dataKey="year"
            tick={{ fontSize: 11, fill: '#aaa' }}
            tickFormatter={(v) => `'${String(v).slice(2)}`}
          />
          <YAxis
            tick={{ fontSize: 11, fill: '#aaa' }}
            tickFormatter={formatDollar}
            width={55}
          />
          <Tooltip
            formatter={(value: number | null, name: string) => {
              if (value === null) return ['—', name];
              return [formatDollar(value), name];
            }}
            labelFormatter={(label) => `${label}`}
            contentStyle={{ backgroundColor: '#1a1a2e', border: '1px solid #444', borderRadius: 6, fontSize: 12 }}
            itemStyle={{ color: '#eee', fontSize: 11 }}
            labelStyle={{ color: '#aaa', fontWeight: 600 }}
            itemSorter={(item) => -(item.value as number ?? 0)}
          />
          <Legend wrapperStyle={{ fontSize: 11, paddingTop: 8 }} />

          {/* Reference line at current year */}
          <ReferenceLine x={currentYear} stroke="#4fc3f7" strokeDasharray="4 4" strokeWidth={1} />

          {/* Stacked areas: contributions + growth (historical only) */}
          <Area
            type="monotone"
            dataKey="contributions"
            stackId="1"
            stroke="#4fc3f7"
            fill="rgba(79, 195, 247, 0.25)"
            name="Contributions"
            connectNulls={false}
          />
          <Area
            type="monotone"
            dataKey="growth"
            stackId="1"
            stroke="#66bb6a"
            fill="rgba(102, 187, 106, 0.25)"
            name="Growth"
            connectNulls={false}
          />

          {/* Projection lines */}
          <Line type="monotone" dataKey="proj6" stroke="#9e9e9e" strokeDasharray="6 3" dot={false} name="6% return" strokeWidth={1.5} connectNulls />
          <Line type="monotone" dataKey="proj7" stroke="#ffca28" strokeDasharray="6 3" dot={false} name="7% return" strokeWidth={1.5} connectNulls />
          <Line type="monotone" dataKey="proj8" stroke="#66bb6a" strokeDasharray="6 3" dot={false} name="8% return" strokeWidth={2} connectNulls />
          <Line type="monotone" dataKey="proj9" stroke="#4fc3f7" strokeDasharray="6 3" dot={false} name="9% return" strokeWidth={1.5} connectNulls />
          <Line type="monotone" dataKey="proj10" stroke="#ce93d8" strokeDasharray="6 3" dot={false} name="10% return" strokeWidth={1.5} connectNulls />
          <Line type="monotone" dataKey="proj401k" stroke="#ff8a65" strokeDasharray="3 2" dot={false} name="401k @8% ($40k/yr)" strokeWidth={2} connectNulls />
        </ComposedChart>
      </ResponsiveContainer>
    </div>
  );
}
