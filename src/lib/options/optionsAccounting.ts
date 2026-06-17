/**
 * Options Accounting Module
 *
 * Parses cash_transactions from Schwab spreads account to reconstruct
 * option trade lifecycle using raw_action and symbol fields:
 *
 *   raw_action: "Sell to Open", "Buy to Open", "Buy to Close", "Sell to Close", "Expired"
 *   symbol: "SPX 07/18/2025 5025.00 P" (Schwab option symbol format)
 *
 * Lifecycle:
 *   - At Open: receive premium, create position, reserve collateral
 *   - While Open: track unrealized P/L, capital efficiency
 *   - At Close/Expiration: realize final gain/loss, release collateral
 */

import pb from '@/lib/pocketbase';
import type { CashTransactionRecord } from '@/types/database';

/* ─── Types ────────────────────────────────────────────────────────────── */

export interface OptionLeg {
  id: string;
  date: string;
  action: 'sell_to_open' | 'buy_to_open' | 'buy_to_close' | 'sell_to_close' | 'expired';
  contracts: number;
  underlying: string;
  expiration: string; // ISO date YYYY-MM-DD
  strike: number;
  optionType: 'P' | 'C';
  amount: number; // raw total_amount from Schwab (positive = credit, negative = debit)
  symbol: string; // full symbol string for matching
}

export interface SpreadTrade {
  id: string;
  openDate: string;
  closeDate: string | null;
  expirationDate: string;
  underlying: string;
  shortStrike: number;
  longStrike: number;
  optionType: 'P' | 'C';
  contracts: number;
  spreadWidth: number;
  premiumReceived: number; // net credit at open (positive)
  premiumPaidToClose: number; // net cost to close (positive = cost paid)
  maxLoss: number; // spread_width * 100 * contracts
  collateral: number;
  realizedPnL: number | null; // null if still open
  status: 'open' | 'closed' | 'expired' | 'assigned';
  daysHeld: number | null;
  capitalEfficiency: number | null; // annualized return on collateral
  slotNumber: number | null; // which $500 slot this trade occupies (1-based)
}

export interface OptionsAccountingSummary {
  openPositions: SpreadTrade[];
  closedPositions: SpreadTrade[];
  expiredPositions: SpreadTrade[];

  totalPremiumReceived: number;
  totalRealizedPnL: number;
  totalUnrealizedPnL: number;
  maxLossExposure: number;
  collateralInUse: number;

  monthlyPnL: { month: string; realized: number; premiumReceived: number; tradesOpened: number; tradesClosed: number; wins: number; losses: number }[];

  winRate: number;
  avgDaysHeld: number;
  avgCapitalEfficiency: number;
  totalTrades: number;
}

/* ─── Symbol Parsing ───────────────────────────────────────────────────── */

/**
 * Parses a Schwab option symbol like "SPX 07/18/2025 5025.00 P"
 * into its components.
 */
function parseSymbol(symbol: string): { underlying: string; expiration: string; strike: number; optionType: 'P' | 'C' } | null {
  const match = symbol.trim().match(/^(\S+)\s+(\d{2})\/(\d{2})\/(\d{4})\s+([\d.]+)\s+([CP])$/i);
  if (!match) return null;

  const [, underlying, mm, dd, yyyy, strikeStr, type] = match;
  return {
    underlying: underlying!,
    expiration: `${yyyy}-${mm}-${dd}`,
    strike: parseFloat(strikeStr!),
    optionType: type!.toUpperCase() as 'P' | 'C',
  };
}

/**
 * Maps raw_action string to our canonical action type.
 */
function mapAction(rawAction: string): OptionLeg['action'] | null {
  const normalized = rawAction.trim().toLowerCase();
  switch (normalized) {
    case 'sell to open': return 'sell_to_open';
    case 'buy to open': return 'buy_to_open';
    case 'buy to close': return 'buy_to_close';
    case 'sell to close': return 'sell_to_close';
    case 'expired': return 'expired';
    default: return null;
  }
}

/* ─── Transaction → Leg Conversion ─────────────────────────────────────── */

function transactionToLeg(tx: CashTransactionRecord): OptionLeg | null {
  const action = mapAction(tx.raw_action ?? '');
  if (!action) return null;

  const symbolStr = tx.symbol ?? '';
  if (!symbolStr) return null;

  const parsed = parseSymbol(symbolStr);
  if (!parsed) return null;

  return {
    id: tx.id,
    date: tx.transaction_date,
    action,
    contracts: 1, // Schwab lists each contract as separate transaction rows; we group later
    underlying: parsed.underlying,
    expiration: parsed.expiration,
    strike: parsed.strike,
    optionType: parsed.optionType,
    amount: parseFloat(String(tx.total_amount)) || 0,
    symbol: symbolStr.trim(),
  };
}

/* ─── Spread Pairing ───────────────────────────────────────────────────── */

function pairIntoSpreads(legs: OptionLeg[]): SpreadTrade[] {
  const spreads: SpreadTrade[] = [];

  // Group by action type
  const sellToOpen = legs.filter((l) => l.action === 'sell_to_open');
  const buyToOpen = legs.filter((l) => l.action === 'buy_to_open');
  const buyToClose = legs.filter((l) => l.action === 'buy_to_close');
  const sellToClose = legs.filter((l) => l.action === 'sell_to_close');
  const expired = legs.filter((l) => l.action === 'expired');

  // Match Sell to Open + Buy to Open on same date + expiration + option type
  const matchedSTO = new Set<string>();
  const matchedBTO = new Set<string>();

  for (const sto of sellToOpen) {
    if (matchedSTO.has(sto.id)) continue;

    // Find matching buy_to_open (protective leg) on same date, same expiration, same type
    const bto = buyToOpen.find(
      (b) =>
        !matchedBTO.has(b.id) &&
        b.date === sto.date &&
        b.expiration === sto.expiration &&
        b.optionType === sto.optionType &&
        b.underlying === sto.underlying
    );

    if (bto) {
      // It's a credit spread
      // For puts: short leg = higher strike, long leg = lower strike
      const shortStrike = Math.max(sto.strike, bto.strike);
      const longStrike = Math.min(sto.strike, bto.strike);
      const spreadWidth = shortStrike - longStrike;

      // Net credit = STO amount (positive) + BTO amount (negative)
      const netCredit = sto.amount + bto.amount;
      const maxLoss = spreadWidth * 100; // 1 contract, $100 multiplier

      spreads.push({
        id: `${sto.id}_${bto.id}`,
        openDate: sto.date,
        closeDate: null,
        expirationDate: sto.expiration,
        underlying: sto.underlying,
        shortStrike,
        longStrike,
        optionType: sto.optionType,
        contracts: 1,
        spreadWidth,
        premiumReceived: netCredit, // already net (positive = credit received)
        premiumPaidToClose: 0,
        maxLoss,
        collateral: maxLoss,
        realizedPnL: null,
        status: 'open',
        daysHeld: null,
        capitalEfficiency: null,
        slotNumber: null,
      });

      matchedSTO.add(sto.id);
      matchedBTO.add(bto.id);
    }
  }

  // Now process closures: Buy to Close + Sell to Close
  // Group BTC/STC by date + expiration to find spread close pairs
  const matchedBTC = new Set<string>();
  const matchedSTC = new Set<string>();

  for (const spread of spreads) {
    // Find Buy to Close matching the SHORT leg (same strike, same expiration)
    const btc = buyToClose.find(
      (b) =>
        !matchedBTC.has(b.id) &&
        b.expiration === spread.expirationDate &&
        b.strike === spread.shortStrike &&
        b.optionType === spread.optionType &&
        b.date >= spread.openDate
    );

    // Find Sell to Close matching the LONG leg
    const stc = sellToClose.find(
      (s) =>
        !matchedSTC.has(s.id) &&
        s.expiration === spread.expirationDate &&
        s.strike === spread.longStrike &&
        s.optionType === spread.optionType &&
        s.date >= spread.openDate
    );

    if (btc && stc) {
      // Both legs closed
      const closeDate = btc.date; // BTC and STC should be same date
      // Cost to close = BTC debit (negative) + STC credit (positive)
      const closeCost = -(btc.amount + stc.amount); // flip sign: positive = cost to us
      const daysHeld = daysBetween(spread.openDate, closeDate);
      const realizedPnL = spread.premiumReceived - closeCost;

      // Detect assignment: if net cost to close >= 90% of max loss, it's assignment
      const isAssigned = closeCost >= spread.maxLoss * 0.9;

      spread.closeDate = closeDate;
      spread.premiumPaidToClose = closeCost;
      spread.realizedPnL = realizedPnL;
      spread.status = isAssigned ? 'assigned' : 'closed';
      spread.daysHeld = daysHeld;

      if (daysHeld > 0 && spread.collateral > 0) {
        spread.capitalEfficiency = (realizedPnL / spread.collateral) * (365 / daysHeld) * 100;
      }

      matchedBTC.add(btc.id);
      matchedSTC.add(stc.id);
    } else {
      // Check if expired — find expired legs matching this spread
      const expShort = expired.find(
        (e) =>
          e.expiration === spread.expirationDate &&
          e.strike === spread.shortStrike &&
          e.optionType === spread.optionType
      );
      const expLong = expired.find(
        (e) =>
          e.expiration === spread.expirationDate &&
          e.strike === spread.longStrike &&
          e.optionType === spread.optionType
      );

      if (expShort && expLong) {
        // Both legs expired OTM — full premium kept
        const daysHeld = daysBetween(spread.openDate, spread.expirationDate);
        spread.closeDate = spread.expirationDate;
        spread.realizedPnL = spread.premiumReceived;
        spread.status = 'expired';
        spread.daysHeld = daysHeld;
        spread.premiumPaidToClose = 0;

        if (daysHeld > 0 && spread.collateral > 0) {
          spread.capitalEfficiency = (spread.premiumReceived / spread.collateral) * (365 / daysHeld) * 100;
        }
      } else {
        // Check if expiration date has passed (might not have "Expired" records yet)
        const today = new Date();
        const expDate = new Date(spread.expirationDate + 'T16:00:00');
        if (expDate < today) {
          const daysHeld = daysBetween(spread.openDate, spread.expirationDate);
          spread.closeDate = spread.expirationDate;
          spread.realizedPnL = spread.premiumReceived;
          spread.status = 'expired';
          spread.daysHeld = daysHeld;
          spread.premiumPaidToClose = 0;

          if (daysHeld > 0 && spread.collateral > 0) {
            spread.capitalEfficiency = (spread.premiumReceived / spread.collateral) * (365 / daysHeld) * 100;
          }
        }
      }
    }
  }

  return spreads;
}

/* ─── Utility ──────────────────────────────────────────────────────────── */

function daysBetween(dateA: string, dateB: string): number {
  const a = new Date(dateA);
  const b = new Date(dateB);
  return Math.round(Math.abs(b.getTime() - a.getTime()) / (1000 * 60 * 60 * 24));
}

/* ─── Slot Assignment ───────────────────────────────────────────────────── */

/**
 * Assigns slot numbers to trades chronologically, simulating real capital usage.
 * A slot becomes available when its current trade closes/expires.
 *
 * Algorithm:
 * - Sort all trades by open date
 * - Maintain an array of "slot availability dates" (initially all available)
 * - For each trade, find the first slot whose availability date <= trade open date
 * - Assign that slot, update its availability to the trade's close date
 */
function assignSlotNumbers(spreads: SpreadTrade[], totalSlots: number): void {
  // Sort by open date
  const sorted = [...spreads].sort((a, b) => a.openDate.localeCompare(b.openDate));

  // Track when each slot becomes available (initially all available from the start)
  const slotAvailableDate: string[] = Array(totalSlots).fill('1900-01-01');

  for (const trade of sorted) {
    // Find first available slot (availability date <= trade open date)
    let assignedSlot = -1;
    for (let i = 0; i < totalSlots; i++) {
      if (slotAvailableDate[i]! <= trade.openDate) {
        assignedSlot = i;
        break;
      }
    }

    // If no slot available (overcommitted), assign to the slot that frees soonest
    if (assignedSlot === -1) {
      let earliestDate = slotAvailableDate[0]!;
      assignedSlot = 0;
      for (let i = 1; i < totalSlots; i++) {
        if (slotAvailableDate[i]! < earliestDate) {
          earliestDate = slotAvailableDate[i]!;
          assignedSlot = i;
        }
      }
    }

    // Assign slot (1-based for display)
    trade.slotNumber = assignedSlot + 1;

    // Update slot availability to when this trade frees up
    const freeDate = trade.closeDate ?? trade.expirationDate;
    slotAvailableDate[assignedSlot] = freeDate;
  }
}

/* ─── Main Entry Point ─────────────────────────────────────────────────── */

/**
 * Fetches all option-related transactions from the spreads account,
 * parses them into option legs, pairs into spreads, and computes P&L.
 */
export async function loadOptionsAccounting(
  accountId: string
): Promise<OptionsAccountingSummary> {
  let transactions: CashTransactionRecord[] = [];
  try {
    transactions = await pb.collection('cash_transactions').getFullList<CashTransactionRecord>({
      filter: `account_id = "${accountId}"`,
      sort: 'transaction_date',
      requestKey: 'options-accounting',
    });
  } catch (err) {
    console.warn('Failed to load cash transactions for options accounting:', err);
    return emptyAccountingSummary();
  }

  // Convert transactions to option legs
  const legs: OptionLeg[] = [];
  for (const tx of transactions) {
    const leg = transactionToLeg(tx);
    if (leg) {
      legs.push(leg);
    }
  }

  if (legs.length === 0) {
    return emptyAccountingSummary();
  }

  // Pair into spreads and compute P&L
  const spreads = pairIntoSpreads(legs);

  // Assign slot numbers: simulate real slot usage chronologically
  // Each slot is freed when its trade closes, then available for next trade
  assignSlotNumbers(spreads, 5); // 5 slots for $2800 account / $500 per slot

  // Categorize
  const openPositions = spreads.filter((s) => s.status === 'open');
  const closedPositions = spreads.filter((s) => s.status === 'closed' || s.status === 'assigned');
  const expiredPositions = spreads.filter((s) => s.status === 'expired');

  // Aggregates
  const totalPremiumReceived = spreads.reduce((sum, s) => sum + s.premiumReceived, 0);
  const realizedTrades = [...closedPositions, ...expiredPositions];
  const totalRealizedPnL = realizedTrades.reduce((sum, s) => sum + (s.realizedPnL ?? 0), 0);
  const totalUnrealizedPnL = openPositions.reduce((sum, s) => sum + s.premiumReceived, 0);
  const maxLossExposure = openPositions.reduce((sum, s) => sum + s.maxLoss, 0);
  const collateralInUse = openPositions.reduce((sum, s) => sum + s.collateral, 0);

  // Win rate
  const winCount = realizedTrades.filter((s) => (s.realizedPnL ?? 0) > 0).length;
  const winRate = realizedTrades.length > 0 ? (winCount / realizedTrades.length) * 100 : 0;

  // Avg days held
  const daysHeldAll = realizedTrades.filter((s) => s.daysHeld !== null).map((s) => s.daysHeld!);
  const avgDaysHeld = daysHeldAll.length > 0
    ? daysHeldAll.reduce((a, b) => a + b, 0) / daysHeldAll.length
    : 0;

  // Avg capital efficiency
  const efficiencies = realizedTrades
    .filter((s) => s.capitalEfficiency !== null)
    .map((s) => s.capitalEfficiency!);
  const avgCapitalEfficiency = efficiencies.length > 0
    ? efficiencies.reduce((a, b) => a + b, 0) / efficiencies.length
    : 0;

  // Monthly P&L — use close date for realized, open date for premium
  const monthlyMap = new Map<string, { realized: number; premiumReceived: number; tradesOpened: number; tradesClosed: number; wins: number; losses: number }>();

  for (const spread of spreads) {
    // Premium received in the month it was opened
    const openMonth = spread.openDate.slice(0, 7);
    const openEntry = monthlyMap.get(openMonth) ?? { realized: 0, premiumReceived: 0, tradesOpened: 0, tradesClosed: 0, wins: 0, losses: 0 };
    openEntry.premiumReceived += spread.premiumReceived;
    openEntry.tradesOpened += 1;
    monthlyMap.set(openMonth, openEntry);

    // Realized P&L in the month it was closed
    if (spread.realizedPnL !== null && spread.closeDate) {
      const closeMonth = spread.closeDate.slice(0, 7);
      const closeEntry = monthlyMap.get(closeMonth) ?? { realized: 0, premiumReceived: 0, tradesOpened: 0, tradesClosed: 0, wins: 0, losses: 0 };
      closeEntry.realized += spread.realizedPnL;
      closeEntry.tradesClosed += 1;
      if (spread.realizedPnL > 0) {
        closeEntry.wins += 1;
      } else {
        closeEntry.losses += 1;
      }
      monthlyMap.set(closeMonth, closeEntry);
    }
  }

  const monthlyPnL = [...monthlyMap.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([month, data]) => ({ month, ...data }));

  return {
    openPositions,
    closedPositions,
    expiredPositions,
    totalPremiumReceived,
    totalRealizedPnL,
    totalUnrealizedPnL,
    maxLossExposure,
    collateralInUse,
    monthlyPnL,
    winRate,
    avgDaysHeld,
    avgCapitalEfficiency,
    totalTrades: spreads.length,
  };
}

function emptyAccountingSummary(): OptionsAccountingSummary {
  return {
    openPositions: [],
    closedPositions: [],
    expiredPositions: [],
    totalPremiumReceived: 0,
    totalRealizedPnL: 0,
    totalUnrealizedPnL: 0,
    maxLossExposure: 0,
    collateralInUse: 0,
    monthlyPnL: [],
    winRate: 0,
    avgDaysHeld: 0,
    avgCapitalEfficiency: 0,
    totalTrades: 0,
  };
}
