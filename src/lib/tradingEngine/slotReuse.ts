/**
 * Slot Reuse / Capital Efficiency Engine
 *
 * Tracks how many times each $500 risk slot is "reused" per year.
 * A slot that turns over 4x at $55/trade = $220 annual yield = 44% on that $500.
 *
 * Metrics:
 * - Slot Turnover: completed trades per year per slot
 * - Annual Slot Yield: total profit / slot risk
 * - Capital Velocity: total credits / total heat
 * - Average Days Capital Committed
 * - Annualized Risk Yield
 */

import type { SpreadTrade } from '@/lib/options/optionsAccounting';

export interface SlotHistory {
  slotId: number; // sequential slot number
  trades: {
    openDate: string;
    closeDate: string;
    daysHeld: number;
    credit: number;
    profit: number;
  }[];
  totalProfit: number;
  totalCredits: number;
  turnover: number; // number of completed trades
  annualYield: number; // totalProfit / slotRisk * (365/avgDays) %
  avgDaysHeld: number;
}

export interface SlotMetrics {
  slotRisk: number; // $500 per slot
  totalSlots: number;
  activeSlots: number;
  completedTrades: number;

  // Aggregate metrics
  avgSlotTurnover: number; // avg trades per slot per year
  avgAnnualSlotYield: number; // %
  capitalVelocity: number; // total credits / avg portfolio heat
  avgDaysCapitalCommitted: number;
  annualizedRiskYield: number; // annual profit / average risk deployed %

  // Per-slot breakdown
  slots: SlotHistory[];

  // Trailing 12-month
  trailing12mProfit: number;
  trailing12mTrades: number;
  trailing12mTurnoverPerSlot: number;
}

/**
 * Calculates slot reuse metrics from completed spread trades.
 * Uses the slotNumber assigned to each trade for real per-slot tracking.
 */
export function calculateSlotMetrics(
  completedTrades: SpreadTrade[],
  accountValue: number,
  slotRisk: number = 500,
): SlotMetrics {
  const totalSlots = Math.floor(accountValue / slotRisk);

  if (completedTrades.length === 0) {
    return {
      slotRisk,
      totalSlots,
      activeSlots: 0,
      completedTrades: 0,
      avgSlotTurnover: 0,
      avgAnnualSlotYield: 0,
      capitalVelocity: 0,
      avgDaysCapitalCommitted: 0,
      annualizedRiskYield: 0,
      slots: [],
      trailing12mProfit: 0,
      trailing12mTrades: 0,
      trailing12mTurnoverPerSlot: 0,
    };
  }

  // Group trades by slot number
  const slotMap = new Map<number, SlotHistory>();
  for (let i = 1; i <= totalSlots; i++) {
    slotMap.set(i, {
      slotId: i,
      trades: [],
      totalProfit: 0,
      totalCredits: 0,
      turnover: 0,
      annualYield: 0,
      avgDaysHeld: 0,
    });
  }

  for (const trade of completedTrades) {
    const slotNum = trade.slotNumber ?? 1;
    const slot = slotMap.get(slotNum) ?? slotMap.get(1)!;

    slot.trades.push({
      openDate: trade.openDate,
      closeDate: trade.closeDate ?? trade.expirationDate,
      daysHeld: trade.daysHeld ?? 0,
      credit: trade.premiumReceived,
      profit: trade.realizedPnL ?? 0,
    });

    slot.totalProfit += trade.realizedPnL ?? 0;
    slot.totalCredits += trade.premiumReceived;
    slot.turnover += 1;
  }

  // Calculate per-slot metrics
  const slots: SlotHistory[] = [];
  for (const slot of slotMap.values()) {
    if (slot.trades.length > 0) {
      const totalDays = slot.trades.reduce((s, t) => s + t.daysHeld, 0);
      slot.avgDaysHeld = totalDays / slot.trades.length;

      // Real yield = total profit / slot risk (NOT annualized — real return)
      slot.annualYield = (slot.totalProfit / slotRisk) * 100;
    }
    slots.push(slot);
  }

  // Aggregate metrics
  const totalProfit = completedTrades.reduce((s, t) => s + (t.realizedPnL ?? 0), 0);
  const totalDaysAll = completedTrades.reduce((s, t) => s + (t.daysHeld ?? 0), 0);
  const avgDaysCapitalCommitted = totalDaysAll / completedTrades.length;

  // Time span for turnover calculation
  const sorted = [...completedTrades].sort((a, b) => a.openDate.localeCompare(b.openDate));
  const firstDate = new Date(sorted[0]!.openDate);
  const lastDate = new Date(sorted[sorted.length - 1]!.closeDate ?? sorted[sorted.length - 1]!.expirationDate);
  const spanDays = Math.max(1, (lastDate.getTime() - firstDate.getTime()) / (1000 * 60 * 60 * 24));
  const spanYears = spanDays / 365;

  // Avg slot turnover = trades per slot per year
  const avgSlotTurnover = spanYears > 0 ? completedTrades.length / totalSlots / spanYears : 0;

  // Real average annual yield per slot (total profit across all slots / total risk / years)
  const avgAnnualSlotYield = spanYears > 0 ? (totalProfit / (totalSlots * slotRisk)) / spanYears * 100 : 0;

  // Capital velocity = total premium collected / average capital deployed
  const avgDeployed = totalSlots * slotRisk; // max possible deployed
  const capitalVelocity = avgDeployed > 0 ? (completedTrades.reduce((s, t) => s + t.premiumReceived, 0)) / avgDeployed : 0;

  // Annualized risk yield = annual profit / total risk capital
  const annualizedRiskYield = avgAnnualSlotYield;

  // Trailing 12 months
  const oneYearAgo = new Date();
  oneYearAgo.setFullYear(oneYearAgo.getFullYear() - 1);
  const trailing12m = completedTrades.filter((t) => new Date(t.closeDate ?? t.expirationDate) >= oneYearAgo);
  const trailing12mProfit = trailing12m.reduce((s, t) => s + (t.realizedPnL ?? 0), 0);
  const trailing12mTurnoverPerSlot = totalSlots > 0 ? trailing12m.length / totalSlots : 0;

  return {
    slotRisk,
    totalSlots,
    activeSlots: 0, // caller sets from open positions
    completedTrades: completedTrades.length,
    avgSlotTurnover,
    avgAnnualSlotYield,
    capitalVelocity,
    avgDaysCapitalCommitted,
    annualizedRiskYield,
    slots,
    trailing12mProfit,
    trailing12mTrades: trailing12m.length,
    trailing12mTurnoverPerSlot,
  };
}
