/**
 * Portfolio Heat Calculator
 *
 * Portfolio Heat = Maximum Open Risk / Account Value
 * Target: 20-30%
 * Never exceed: 35%
 * Max new risk per week: 5%
 */

import type { SpreadTrade } from '@/lib/options/optionsAccounting';

export interface PortfolioHeatData {
  accountValue: number;
  totalOpenRisk: number; // sum of maxLoss on all open positions
  heatPct: number; // totalOpenRisk / accountValue * 100
  heatLevel: 'LOW' | 'NORMAL' | 'HIGH' | 'CRITICAL';
  heatColor: string;
  canAddNewTrade: boolean;
  maxNewRiskPerWeek: number; // 5% of account value
  availableNewRisk: number; // how much more risk can be added
  slotsOpen: number;
  slotsTotal: number;
}

export function calculatePortfolioHeat(
  accountValue: number,
  openPositions: SpreadTrade[],
  spreadWidth: number = 500,
): PortfolioHeatData {
  const totalOpenRisk = openPositions.reduce((sum, p) => sum + p.maxLoss, 0);
  const heatPct = accountValue > 0 ? (totalOpenRisk / accountValue) * 100 : 0;
  const maxNewRiskPerWeek = accountValue * 0.05;

  let heatLevel: PortfolioHeatData['heatLevel'];
  let heatColor: string;

  if (heatPct <= 20) {
    heatLevel = 'LOW';
    heatColor = '#66bb6a';
  } else if (heatPct <= 30) {
    heatLevel = 'NORMAL';
    heatColor = '#4fc3f7';
  } else if (heatPct <= 35) {
    heatLevel = 'HIGH';
    heatColor = '#ffca28';
  } else {
    heatLevel = 'CRITICAL';
    heatColor = '#ef5350';
  }

  // Can add new trade if heat < 30% and not exceeding weekly limit
  const canAddNewTrade = heatPct < 30;
  const availableNewRisk = Math.max(0, (accountValue * 0.30) - totalOpenRisk);

  const slotsTotal = Math.floor(accountValue / spreadWidth);
  const slotsOpen = openPositions.length;

  return {
    accountValue,
    totalOpenRisk,
    heatPct,
    heatLevel,
    heatColor,
    canAddNewTrade,
    maxNewRiskPerWeek,
    availableNewRisk,
    slotsOpen,
    slotsTotal,
  };
}
