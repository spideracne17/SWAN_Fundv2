import { useEffect, useState } from 'react';
import { usePageTitle } from '@/hooks/usePageTitle';
import pb from '@/lib/pocketbase';
import { fetchStockPrices } from '@/lib/market/fetchStockPrices';
import GrowthChart from '@/components/retirement/GrowthChart';
import './RetirementPage.css';

const ROTH_ACCOUNT_ID = 'vlubeg30nl05mm9';
const TRAD_ACCOUNT_ID = 'ncyrg5kkqts2e0r';
const RETIREMENT_YEAR = 2041;
const IRA_LIMIT = 8000;

interface TaxLot {
  id: string;
  account_id: string;
  ticker: string;
  remaining_shares: string;
  total_cost_basis: string;
}

interface CashTransaction {
  id: string;
  account_id: string;
  transaction_type: string;
  transaction_date: string;
  total_amount: string;
  description: string;
}

interface AccountData {
  shares: number;
  costBasis: number;
  marketValue: number | null;
}

interface ContributionData {
  ytdDeposited: number;
  remaining: number;
  monthlyTarget: number;
  adjustedMonthly: number;
  monthsRemaining: number;
  deposits: { date: string; amount: number }[];
}

function formatCurrency(value: number): string {
  return value.toLocaleString('en-US', {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

function RetirementPage() {
  usePageTitle('Retirement Dashboard');

  const [roth, setRoth] = useState<AccountData | null>(null);
  const [trad, setTrad] = useState<AccountData | null>(null);
  const [vgtPrice, setVgtPrice] = useState<number | null>(null);
  const [contributions, setContributions] = useState<ContributionData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    async function loadData() {
      try {
        setLoading(true);
        setError(null);

        // Fetch tax lots, cash transactions, and VGT price in parallel
        const [lots, txns, prices] = await Promise.all([
          pb.collection('tax_lots').getFullList<TaxLot>({ requestKey: null }),
          pb.collection('cash_transactions').getFullList<CashTransaction>({ requestKey: null }),
          fetchStockPrices(['VGT']),
        ]);

        const price = prices.get('VGT') ?? null;
        setVgtPrice(price);

        // Aggregate positions by account
        const aggregate = (accountId: string): AccountData => {
          const accountLots = lots.filter((l) => l.account_id === accountId);
          const shares = accountLots.reduce((sum, l) => sum + parseFloat(l.remaining_shares || '0'), 0);
          const costBasis = accountLots.reduce((sum, l) => sum + parseFloat(l.total_cost_basis || '0'), 0);
          const marketValue = price ? shares * price : null;
          return { shares, costBasis, marketValue };
        };

        setRoth(aggregate(ROTH_ACCOUNT_ID));
        setTrad(aggregate(TRAD_ACCOUNT_ID));

        // Calculate YTD contributions (transfers into IRA accounts this year)
        const currentYear = new Date().getFullYear();
        const yearStart = `${currentYear}-01-01`;
        const currentMonth = new Date().getMonth(); // 0-indexed

        const iraTransfers = txns.filter(
          (t) =>
            (t.account_id === ROTH_ACCOUNT_ID || t.account_id === TRAD_ACCOUNT_ID) &&
            t.transaction_type === 'transfer' &&
            t.transaction_date >= yearStart &&
            parseFloat(t.total_amount || '0') > 0
        );

        const ytdDeposited = iraTransfers.reduce(
          (sum, t) => sum + parseFloat(t.total_amount || '0'),
          0
        );
        const remaining = Math.max(0, IRA_LIMIT - ytdDeposited);
        const monthsRemaining = Math.max(1, 12 - currentMonth);
        const monthlyTarget = IRA_LIMIT / 12;
        const adjustedMonthly = remaining / monthsRemaining;

        const deposits = iraTransfers
          .map((t) => ({ date: t.transaction_date, amount: parseFloat(t.total_amount || '0') }))
          .sort((a, b) => a.date.localeCompare(b.date));

        setContributions({ ytdDeposited, remaining, monthlyTarget, adjustedMonthly, monthsRemaining, deposits });
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to load retirement data');
      } finally {
        setLoading(false);
      }
    }

    loadData();
  }, []);

  const yearsToRetirement = RETIREMENT_YEAR - new Date().getFullYear();

  if (loading) {
    return (
      <div className="page retirement-page">
        <h2>Retirement Dashboard</h2>
        <div className="retirement-loading">Loading retirement data…</div>
      </div>
    );
  }

  if (error && !roth && !trad) {
    return (
      <div className="page retirement-page">
        <h2>Retirement Dashboard</h2>
        <div className="retirement-error">
          <p>{error}</p>
        </div>
      </div>
    );
  }

  const totalShares = (roth?.shares ?? 0) + (trad?.shares ?? 0);
  const totalCostBasis = (roth?.costBasis ?? 0) + (trad?.costBasis ?? 0);
  const totalMarketValue =
    roth?.marketValue != null && trad?.marketValue != null
      ? roth.marketValue + trad.marketValue
      : null;

  return (
    <div className="page retirement-page">
      <h2>Retirement Dashboard</h2>

      {/* Summary Header */}
      <div className="retirement-summary-header">
        <div className="retirement-summary-stat">
          <span className="retirement-summary-stat-label">Years to Retirement</span>
          <span className="retirement-summary-stat-value">{yearsToRetirement}</span>
          <span className="retirement-summary-stat-note">
            Retire {RETIREMENT_YEAR} • Shift conservative in {yearsToRetirement - 5} yrs (by {RETIREMENT_YEAR - 5})
          </span>
        </div>
        <div className="retirement-summary-stat">
          <span className="retirement-summary-stat-label">IRA Contribution Limit</span>
          <span className="retirement-summary-stat-value">{formatCurrency(IRA_LIMIT)}</span>
          <span className="retirement-summary-stat-note">(catch-up eligible, age 50+)</span>
        </div>
        {vgtPrice && (
          <div className="retirement-summary-stat">
            <span className="retirement-summary-stat-label">VGT Price</span>
            <span className="retirement-summary-stat-value">{formatCurrency(vgtPrice)}</span>
          </div>
        )}
      </div>

      {/* Contribution Tracking */}
      {contributions && (
        <div className="retirement-contributions">
          <h3 className="retirement-section-title">IRA Contributions ({new Date().getFullYear()})</h3>
          <div className="retirement-contrib-grid">
            <div className="retirement-contrib-item">
              <span className="retirement-contrib-label">Deposited YTD</span>
              <span className="retirement-contrib-value">{formatCurrency(contributions.ytdDeposited)}</span>
            </div>
            <div className="retirement-contrib-item">
              <span className="retirement-contrib-label">Remaining to Limit</span>
              <span className="retirement-contrib-value retirement-contrib-value--highlight">
                {formatCurrency(contributions.remaining)}
              </span>
            </div>
            <div className="retirement-contrib-item">
              <span className="retirement-contrib-label">Monthly Target (÷12)</span>
              <span className="retirement-contrib-value">{formatCurrency(contributions.monthlyTarget)}</span>
            </div>
            <div className="retirement-contrib-item">
              <span className="retirement-contrib-label">
                Adjusted Monthly ({contributions.monthsRemaining} mo left)
              </span>
              <span className="retirement-contrib-value retirement-contrib-value--action">
                {formatCurrency(contributions.adjustedMonthly)}
              </span>
            </div>
          </div>
          {contributions.remaining > 0 && contributions.remaining < IRA_LIMIT && (
            <p className="retirement-contrib-note">
              💡 To max out by Dec: deposit <strong>{formatCurrency(contributions.adjustedMonthly)}</strong>/month
              for the next {contributions.monthsRemaining} months
              (or one lump sum of {formatCurrency(contributions.remaining)})
            </p>
          )}

          {/* 401k Reference */}
          <div className="retirement-401k-section">
            <h4>401(k) Contribution Limits ({new Date().getFullYear()})</h4>
            <div className="retirement-contrib-grid">
              <div className="retirement-contrib-item">
                <span className="retirement-contrib-label">Employee Limit</span>
                <span className="retirement-contrib-value">{formatCurrency(23500)}</span>
              </div>
              <div className="retirement-contrib-item">
                <span className="retirement-contrib-label">Catch-Up (50+)</span>
                <span className="retirement-contrib-value">{formatCurrency(7500)}</span>
              </div>
              <div className="retirement-contrib-item">
                <span className="retirement-contrib-label">Total Employee</span>
                <span className="retirement-contrib-value retirement-contrib-value--highlight">{formatCurrency(31000)}</span>
              </div>
              <div className="retirement-contrib-item">
                <span className="retirement-contrib-label">+ Employer Match (est.)</span>
                <span className="retirement-contrib-value retirement-contrib-value--action">{formatCurrency(40000)}</span>
              </div>
            </div>
            <p className="retirement-contrib-note">
              📊 IRA max: $8,000/yr vs 401k max: $31,000/yr (+ match). See projection chart below for impact over time.
            </p>
          </div>
        </div>
      )}

      {/* Account Cards */}
      <div className="retirement-accounts-grid">
        {roth && (
          <div className="retirement-account-card retirement-account-card--roth">
            <h3 className="retirement-account-title">Schwab Roth IRA</h3>
            <span className="retirement-account-tag">Tax-free growth</span>
            <div className="retirement-account-summary">
              <div className="retirement-summary-row">
                <span className="retirement-summary-label">Account Value</span>
                <span className="retirement-summary-value">
                  {roth.marketValue != null ? formatCurrency(roth.marketValue) : formatCurrency(roth.costBasis)}
                </span>
              </div>
              <div className="retirement-summary-row">
                <span className="retirement-summary-label">VGT Shares</span>
                <span className="retirement-summary-value">{roth.shares.toFixed(4)}</span>
              </div>
              <div className="retirement-summary-row">
                <span className="retirement-summary-label">Cost Basis</span>
                <span className="retirement-summary-value">{formatCurrency(roth.costBasis)}</span>
              </div>
            </div>
          </div>
        )}

        {trad && (
          <div className="retirement-account-card retirement-account-card--trad">
            <h3 className="retirement-account-title">Schwab Traditional IRA</h3>
            <span className="retirement-account-tag">Tax-deferred growth</span>
            <div className="retirement-account-summary">
              <div className="retirement-summary-row">
                <span className="retirement-summary-label">Account Value</span>
                <span className="retirement-summary-value">
                  {trad.marketValue != null ? formatCurrency(trad.marketValue) : formatCurrency(trad.costBasis)}
                </span>
              </div>
              <div className="retirement-summary-row">
                <span className="retirement-summary-label">VGT Shares</span>
                <span className="retirement-summary-value">{trad.shares.toFixed(4)}</span>
              </div>
              <div className="retirement-summary-row">
                <span className="retirement-summary-label">Cost Basis</span>
                <span className="retirement-summary-value">{formatCurrency(trad.costBasis)}</span>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Combined Totals */}
      <div className="retirement-totals">
        <h3 className="retirement-totals-title">Combined Totals</h3>
        <div className="retirement-totals-grid">
          <div className="retirement-totals-item">
            <span className="retirement-totals-label">Total VGT Shares</span>
            <span className="retirement-totals-value">{totalShares.toFixed(4)}</span>
          </div>
          <div className="retirement-totals-item">
            <span className="retirement-totals-label">Total Cost Basis</span>
            <span className="retirement-totals-value">{formatCurrency(totalCostBasis)}</span>
          </div>
          <div className="retirement-totals-item">
            <span className="retirement-totals-label">Total Market Value</span>
            <span className="retirement-totals-value retirement-totals-value--highlight">
              {totalMarketValue != null ? formatCurrency(totalMarketValue) : 'N/A'}
            </span>
          </div>
        </div>
      </div>

      {/* Growth Projection Chart (at bottom) */}
      {totalMarketValue !== null && (
        <div className="retirement-chart-section">
          <h3 className="retirement-section-title">Portfolio Growth & Projections</h3>
          <GrowthChart
            totalContributions={totalCostBasis}
            currentValue={totalMarketValue}
            annualContribution={IRA_LIMIT}
            retirementYear={RETIREMENT_YEAR}
            currentYear={new Date().getFullYear()}
          />
        </div>
      )}
    </div>
  );
}

export default RetirementPage;
