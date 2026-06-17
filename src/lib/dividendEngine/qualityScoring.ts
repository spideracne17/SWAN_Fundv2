/**
 * Dividend Quality Scoring Engine (Dividend OS V1)
 *
 * Scoring Factors:
 *   Chowder Rule: 25%
 *   Yield vs Historical Yield: 25%
 *   Dividend Growth Rate: 20%
 *   P/E Valuation: 15%
 *   52 Week Position: 10%
 *   Payout Ratio: 5%
 *
 * Maximum Score = 100
 */

export interface DividendStockData {
  symbol: string;
  name: string;
  currentYield: number;        // Current dividend yield (%)
  fiveYearAvgYield: number;    // 5-year average yield (%)
  dividendGrowthRate: number;  // 5-year dividend growth rate (%)
  peRatio: number;             // Current P/E ratio
  priceVs52WeekHigh: number;   // % below 52-week high (0-100)
  payoutRatio: number;         // Payout ratio (%)
  isDividendKing: boolean;
  isDividendAristocrat: boolean;
  paymentMonth: number;        // Primary payment month (1-12)
  calendarGroup: 'A' | 'B' | 'C';
  annualDividendPerShare: number;
  sharesHeld: number;
  costBasis: number;
}

export interface QualityScore {
  symbol: string;
  totalScore: number;
  rating: 'Strong Buy' | 'Buy' | 'Watch' | 'Pass';
  ratingColor: string;
  chowderScore: number;
  chowderNumber: number;
  yieldValuationScore: number;
  relativeYield: number;
  growthScore: number;
  peScore: number;
  positionScore: number;
  payoutScore: number;
}

/**
 * Chowder Rule: Current Yield + 5-Year Growth Rate
 * Score based on yield range targets.
 */
function scoreChowder(currentYield: number, growthRate: number): { score: number; chowderNumber: number } {
  const chowderNumber = currentYield + growthRate;

  let target: number;
  if (currentYield < 3) target = 15;
  else if (currentYield <= 5) target = 12;
  else target = 8;

  // Score: 100 if meets target, scales down linearly
  const ratio = chowderNumber / target;
  const score = Math.min(100, Math.max(0, ratio * 100));

  return { score, chowderNumber };
}

/**
 * Yield Valuation: Current Yield / 5-Year Average Yield
 */
function scoreYieldValuation(currentYield: number, avgYield: number): { score: number; relativeYield: number } {
  if (avgYield <= 0) return { score: 50, relativeYield: 100 };

  const relativeYield = (currentYield / avgYield) * 100;

  let score: number;
  if (relativeYield > 125) score = 100;
  else if (relativeYield >= 110) score = 80;
  else if (relativeYield >= 100) score = 60;
  else score = 40;

  return { score, relativeYield };
}

/**
 * Dividend Growth Rate score
 */
function scoreGrowth(growthRate: number): number {
  if (growthRate >= 15) return 100;
  if (growthRate >= 10) return 85;
  if (growthRate >= 7) return 70;
  if (growthRate >= 5) return 55;
  if (growthRate >= 3) return 40;
  if (growthRate > 0) return 25;
  return 0;
}

/**
 * P/E Valuation score (lower is better for value)
 */
function scorePE(peRatio: number): number {
  if (peRatio <= 0) return 50; // Can't score negative earnings
  if (peRatio <= 12) return 100;
  if (peRatio <= 15) return 85;
  if (peRatio <= 18) return 70;
  if (peRatio <= 22) return 55;
  if (peRatio <= 28) return 40;
  return 20;
}

/**
 * 52-Week Position score (further below high = better value)
 */
function scorePosition(pctBelow52WeekHigh: number): number {
  if (pctBelow52WeekHigh >= 20) return 100;
  if (pctBelow52WeekHigh >= 15) return 85;
  if (pctBelow52WeekHigh >= 10) return 70;
  if (pctBelow52WeekHigh >= 5) return 50;
  return 30;
}

/**
 * Payout Ratio score (moderate is best)
 */
function scorePayout(payoutRatio: number): number {
  if (payoutRatio <= 0) return 30;
  if (payoutRatio <= 40) return 100;
  if (payoutRatio <= 60) return 85;
  if (payoutRatio <= 75) return 60;
  if (payoutRatio <= 90) return 35;
  return 10;
}

/**
 * Quality rating from total score.
 */
function getRating(score: number): { rating: QualityScore['rating']; color: string } {
  if (score >= 90) return { rating: 'Strong Buy', color: '#00C087' };
  if (score >= 80) return { rating: 'Buy', color: '#66bb6a' };
  if (score >= 70) return { rating: 'Watch', color: '#FFB800' };
  return { rating: 'Pass', color: '#ef5350' };
}

/**
 * Calculate the complete quality score for a dividend stock.
 */
export function calculateQualityScore(stock: DividendStockData): QualityScore {
  const { score: chowderScore, chowderNumber } = scoreChowder(stock.currentYield, stock.dividendGrowthRate);
  const { score: yieldValuationScore, relativeYield } = scoreYieldValuation(stock.currentYield, stock.fiveYearAvgYield);
  const growthScore = scoreGrowth(stock.dividendGrowthRate);
  const peScore = scorePE(stock.peRatio);
  const positionScore = scorePosition(stock.priceVs52WeekHigh);
  const payoutScore = scorePayout(stock.payoutRatio);

  // Weighted total
  const totalScore =
    chowderScore * 0.25 +
    yieldValuationScore * 0.25 +
    growthScore * 0.20 +
    peScore * 0.15 +
    positionScore * 0.10 +
    payoutScore * 0.05;

  const { rating, color: ratingColor } = getRating(totalScore);

  return {
    symbol: stock.symbol,
    totalScore,
    rating,
    ratingColor,
    chowderScore,
    chowderNumber,
    yieldValuationScore,
    relativeYield,
    growthScore,
    peScore,
    positionScore,
    payoutScore,
  };
}
