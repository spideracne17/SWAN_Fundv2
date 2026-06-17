import { useEffect, useState, useCallback } from 'react';
import { usePageTitle } from '@/hooks/usePageTitle';
import { fetchTaxData, detectTLHOpportunities, type TaxDashboardData, type TLHOpportunity } from '@/lib/dashboards/tax';
import { detectWashSales, type WashSaleEntry } from '@/lib/dashboards/washSale';
import { fetchAccountingData } from '@/lib/dashboards/accounting';
import pb from '@/lib/pocketbase';
import type { DispositionRecord, TaxLotRecord } from '@/types/database';
import './TaxPage.css';

/** Format a number as USD currency string */
function formatCurrency(value: number): string {
  return value.toLocaleString('en-US', {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

/** Return CSS class for positive/negative values */
function gainLossClass(value: number): string {
  if (value > 0) return 'positive';
  if (value < 0) return 'negative';
  return '';
}

/** Generate year options from 2020 to current year */
function getYearOptions(): number[] {
  const currentYear = new Date().getFullYear();
  const years: number[] = [];
  for (let y = currentYear; y >= 2020; y--) {
    years.push(y);
  }
  return years;
}

function TaxPage() {
  usePageTitle('Tax Dashboard');

  const currentYear = new Date().getFullYear();
  const [taxYear, setTaxYear] = useState<number>(currentYear);
  const [taxData, setTaxData] = useState<TaxDashboardData | null>(null);
  const [washSales, setWashSales] = useState<WashSaleEntry[]>([]);
  const [tlhOpportunities, setTlhOpportunities] = useState<TLHOpportunity[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const loadData = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);

      // Fetch tax data (gains + dividends)
      const data = await fetchTaxData(taxYear);
      setTaxData(data);

      // Fetch dispositions and lots for wash sale detection
      const startDate = `${taxYear}-01-01`;
      const endDate = `${taxYear}-12-31`;

      const [dispositions, lots] = await Promise.all([
        pb.collection('dispositions').getFullList<DispositionRecord>({
          filter: `disposition_date >= "${startDate}" && disposition_date <= "${endDate}"`,
        }),
        pb.collection('tax_lots').getFullList<TaxLotRecord>(),
      ]);

      // Detect wash sales
      const detectedWashSales = detectWashSales(dispositions, lots);
      setWashSales(detectedWashSales);

      // Fetch positions for TLH detection
      const accountingData = await fetchAccountingData();
      const washSaleSymbols = detectedWashSales.map((ws) => ws.symbol);
      const opportunities = detectTLHOpportunities(accountingData.positions, washSaleSymbols);
      setTlhOpportunities(opportunities);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load tax data');
    } finally {
      setLoading(false);
    }
  }, [taxYear]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  if (loading) {
    return (
      <div className="page tax-page">
        <h2>Tax Dashboard</h2>
        <div className="tax-loading">Loading tax data…</div>
      </div>
    );
  }

  if (error && !taxData) {
    return (
      <div className="page tax-page">
        <h2>Tax Dashboard</h2>
        <div className="tax-error">
          <p>{error}</p>
          <button className="tax-retry-btn" onClick={loadData}>
            Retry
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="page tax-page">
      <h2>Tax Dashboard</h2>
      <p>Short/long-term gains, dividends, wash sales, and tax-loss harvest opportunities.</p>

      {/* Tax Year Selector */}
      <div className="tax-year-selector">
        <label htmlFor="tax-year-select">Tax Year:</label>
        <select
          id="tax-year-select"
          value={taxYear}
          onChange={(e) => setTaxYear(Number(e.target.value))}
        >
          {getYearOptions().map((year) => (
            <option key={year} value={year}>
              {year}
            </option>
          ))}
        </select>
      </div>

      {/* Gains Breakdown */}
      <h3 className="tax-section-title">Gains Breakdown</h3>
      <div className="tax-cards">
        <div className="tax-card">
          <p className="tax-card-label">Short-Term Gains</p>
          <p className={`tax-card-value ${gainLossClass(taxData?.short_term_gains ?? 0)}`}>
            {taxData ? formatCurrency(taxData.short_term_gains) : '$0.00'}
          </p>
        </div>

        <div className="tax-card">
          <p className="tax-card-label">Long-Term Gains</p>
          <p className={`tax-card-value ${gainLossClass(taxData?.long_term_gains ?? 0)}`}>
            {taxData ? formatCurrency(taxData.long_term_gains) : '$0.00'}
          </p>
        </div>

        <div className="tax-card">
          <p className="tax-card-label">Total Gains</p>
          <p className={`tax-card-value ${gainLossClass(taxData?.total_gains ?? 0)}`}>
            {taxData ? formatCurrency(taxData.total_gains) : '$0.00'}
          </p>
        </div>
      </div>

      {/* Dividend Classification */}
      <div className="tax-dividends">
        <h3 className="tax-section-title">Dividend Classification</h3>
        <div className="tax-dividends-grid">
          <div className="tax-dividends-item">
            <span className="tax-dividends-label">Qualified Dividends</span>
            <span className="tax-dividends-value">
              {taxData ? formatCurrency(taxData.qualified_dividends) : '$0.00'}
            </span>
          </div>
          <div className="tax-dividends-item">
            <span className="tax-dividends-label">Ordinary Dividends</span>
            <span className="tax-dividends-value">
              {taxData ? formatCurrency(taxData.ordinary_dividends) : '$0.00'}
            </span>
          </div>
          <div className="tax-dividends-item">
            <span className="tax-dividends-label">Total Dividends</span>
            <span className="tax-dividends-value total">
              {taxData
                ? formatCurrency(taxData.qualified_dividends + taxData.ordinary_dividends)
                : '$0.00'}
            </span>
          </div>
        </div>
      </div>

      {/* Wash Sales */}
      <div className="tax-wash-sales">
        <h3 className="tax-section-title">Wash Sales</h3>
        {washSales.length > 0 ? (
          <div className="tax-table-wrapper">
            <table className="tax-table">
              <thead>
                <tr>
                  <th>Symbol</th>
                  <th>Sale Date</th>
                  <th>Repurchase Date</th>
                  <th className="numeric">Disallowed Loss</th>
                </tr>
              </thead>
              <tbody>
                {washSales.map((ws, index) => (
                  <tr key={`${ws.disposition_id}-${index}`}>
                    <td className="symbol">{ws.symbol}</td>
                    <td>{ws.sale_date}</td>
                    <td>{ws.purchase_date}</td>
                    <td className="numeric negative">
                      {formatCurrency(-ws.disallowed_loss)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <p className="tax-no-data">No wash sales detected for {taxYear}.</p>
        )}
      </div>

      {/* TLH Opportunities */}
      <div className="tax-tlh">
        <h3 className="tax-section-title">Tax-Loss Harvesting Opportunities</h3>
        <p className="tax-tlh-description">
          Positions with unrealized losses exceeding $1,000 that are not wash-sale restricted.
        </p>
        {tlhOpportunities.length > 0 ? (
          <div className="tax-table-wrapper">
            <table className="tax-table">
              <thead>
                <tr>
                  <th>Symbol</th>
                  <th className="numeric">Cost Basis</th>
                  <th className="numeric">Market Value</th>
                  <th className="numeric">Unrealized Loss</th>
                </tr>
              </thead>
              <tbody>
                {tlhOpportunities.map((opp) => (
                  <tr key={opp.symbol}>
                    <td className="symbol">{opp.symbol}</td>
                    <td className="numeric">{formatCurrency(opp.cost_basis)}</td>
                    <td className="numeric">{formatCurrency(opp.market_value)}</td>
                    <td className="numeric negative">
                      {formatCurrency(-opp.unrealized_loss)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <p className="tax-no-data">No tax-loss harvesting opportunities found.</p>
        )}
      </div>
    </div>
  );
}

export default TaxPage;
