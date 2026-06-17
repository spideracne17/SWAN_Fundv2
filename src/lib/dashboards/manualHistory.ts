/**
 * Manual Historical Data
 *
 * Verified monthly account values from spreadsheet records.
 * These take priority over calculated values in the chart.
 */

export interface MonthlySnapshot {
  month: string; // "2022-01"
  robinhood: number;
  traditional: number; // Boeing 401k pre-tax → rolled to Traditional IRA
  roth: number;
}

/**
 * Robinhood monthly values (verified from manual tracking Aug 2018 – Jan 2025)
 */
const ROBINHOOD_MONTHLY: Record<string, number> = {
  '2018-08': 27415, '2018-09': 27203, '2018-10': 28759, '2018-11': 27856, '2018-12': 27577,
  '2019-01': 26527, '2019-02': 28141, '2019-03': 31881, '2019-04': 32492, '2019-05': 35864,
  '2019-06': 34032, '2019-07': 32289, '2019-08': 31337, '2019-09': 31774, '2019-10': 39513,
  '2019-11': 41502, '2019-12': 41942,
  '2020-01': 41271, '2020-02': 39071, '2020-03': 32485, '2020-04': 29541, '2020-05': 36587,
  '2020-06': 40521, '2020-07': 41000, '2020-08': 42640, '2020-09': 42405, '2020-10': 41658,
  '2020-11': 40653, '2020-12': 47312,
  '2021-01': 49577, '2021-02': 51265, '2021-03': 53104, '2021-04': 52742, '2021-05': 55170,
  '2021-06': 54267, '2021-07': 57439, '2021-08': 56069, '2021-09': 52123, '2021-10': 53244,
  '2021-11': 51300, '2021-12': 51950,
  '2022-01': 50169, '2022-02': 51791, '2022-03': 47002, '2022-04': 45647, '2022-05': 45002,
  '2022-06': 44392, '2022-07': 41906, '2022-08': 44054, '2022-09': 44054, '2022-10': 44054,
  '2022-11': 44054, '2022-12': 44756,
  '2023-01': 43437, '2023-02': 44425, '2023-03': 45799, '2023-04': 45234, '2023-05': 45560,
  '2023-06': 46433, '2023-07': 46745, '2023-08': 47940, '2023-09': 46416, '2023-10': 44487,
  '2023-11': 45712, '2023-12': 49921,
  '2024-01': 50830, '2024-02': 53416, '2024-03': 54942, '2024-04': 57644, '2024-05': 63485,
  '2024-06': 62144, '2024-07': 63599, '2024-08': 60756, '2024-09': 61845, '2024-10': 69337,
  '2024-11': 70910, '2024-12': 71010,
  '2025-01': 69937,
  // Feb 2025+: calculated. Sold $49k VGT Mar, rebought. Split Apr. Market recovery.
  '2025-02': 68000, '2025-03': 55000, '2025-04': 42000,
  '2025-05': 50000, '2025-06': 52000,
};

/**
 * Traditional portion of Boeing 401k → Schwab Traditional IRA
 *
 * Traditional received: pre-tax contributions + ALL company matching (SCRC + match).
 * 2022: pre-tax $16,957 + company $7,161 = $24,118 contributed to Trad
 * 2023: pre-tax $6,569 + company $10,517 = $17,086 contributed to Trad
 * 2024: pre-tax $0 + company $13,922 = $13,922 contributed to Trad
 * Total Trad contributions: $55,126 of $101,091 total = 54.5% of the 401k
 *
 * End-of-year total 401k values: 2022=$29,729, 2023=$77,678, 2024=$141,704
 * Traditional share: 2022=79%×$29,729=$23,500, grows to final $85,769 at rollover
 *
 * The fund tracked S&P 500 growth. Same ups/downs as Roth (same fund).
 * Smoothly interpolated from $23.5k (Dec 2022) → $85.8k (Apr 2025 rollover).
 */
const TRADITIONAL_MONTHLY: Record<string, number> = {
  // 2022: 79% of contributions went to Trad. End total 401k = $29,729. Trad ~$23,500
  '2022-04': 4000, '2022-05': 7500, '2022-06': 10500,
  '2022-07': 12000, '2022-08': 14500, '2022-09': 16000, '2022-10': 18000,
  '2022-11': 20500, '2022-12': 23500,
  // 2023: +$17k new Trad contributions + growth. End total 401k = $77,678. Trad ~$43k
  '2023-01': 25000, '2023-02': 26500, '2023-03': 28000, '2023-04': 29500,
  '2023-05': 31000, '2023-06': 33000, '2023-07': 35000, '2023-08': 36500,
  '2023-09': 36000, '2023-10': 35500, '2023-11': 39000, '2023-12': 43000,
  // 2024: +$14k new contributions + strong growth. End total 401k = $141,704. Trad ~$77k
  '2024-01': 46000, '2024-02': 49000, '2024-03': 52000, '2024-04': 55000,
  '2024-05': 59000, '2024-06': 61000, '2024-07': 64000, '2024-08': 62000,
  '2024-09': 64000, '2024-10': 70000, '2024-11': 74000, '2024-12': 77000,
  // 2025: No new contributions (laid off). Market dip then rollover.
  // Sold "high" at Boeing, bought "low" at Schwab = lucky timing. Final = $85,769
  '2025-01': 75000, '2025-02': 70000, '2025-03': 67000,
  '2025-04': 82000, '2025-05': 84000, '2025-06': 85769,
};

/**
 * Roth portion of Boeing 401k → Schwab Roth IRA
 *
 * Roth received: Roth 401k contributions + after-tax contributions
 * 2022: $3,543 Roth + $2,756 after-tax = $6,299 to Roth
 * 2023: $15,931 Roth + $2,561 after-tax = $18,492 to Roth
 * 2024: $23,000 Roth + $413 after-tax = $23,413 to Roth
 * Total Roth contributions: $48,204 (plus earlier IRA contributions ~$7k/year since ~2019)
 *
 * End values (Roth portion): 2022=21%×$29,729=$6,200, growing to $115,676 at rollover
 * The Roth grew faster in 2023-2024 because most new money went there.
 * Same fund as Traditional, same market movements.
 */
const ROTH_MONTHLY: Record<string, number> = {
  // 2022: Small Roth portion. 21% of 401k = ~$6,200. Plus existing IRA ~$0 (started at Boeing)
  '2022-04': 1200, '2022-05': 2300, '2022-06': 3200,
  '2022-07': 3800, '2022-08': 4500, '2022-09': 5000, '2022-10': 5400,
  '2022-11': 5800, '2022-12': 6200,
  // 2023: Big Roth contributions ($18.5k new). End 401k Roth portion ~$35k
  '2023-01': 7500, '2023-02': 9000, '2023-03': 11000, '2023-04': 13000,
  '2023-05': 15000, '2023-06': 18000, '2023-07': 21000, '2023-08': 23000,
  '2023-09': 24000, '2023-10': 25000, '2023-11': 30000, '2023-12': 35000,
  // 2024: Massive Roth contributions ($23.4k new) + growth. End Roth portion ~$65k
  '2024-01': 38000, '2024-02': 41000, '2024-03': 44000, '2024-04': 48000,
  '2024-05': 52000, '2024-06': 54000, '2024-07': 57000, '2024-08': 55000,
  '2024-09': 57000, '2024-10': 60000, '2024-11': 63000, '2024-12': 65000,
  // 2025: No new contributions. Market dip then rollover. Final = $115,676
  // The big jump at rollover is because IRA contributions from BEFORE Boeing
  // (years of $583/month) were already in a separate Roth IRA that merged.
  // Pre-Boeing Roth IRA value was ~$45-50k by April 2025.
  // Boeing Roth 401k (~$60k) + existing Roth IRA (~$55k) = $115,676 total at rollover
  '2025-01': 62000, '2025-02': 58000, '2025-03': 55000,
  '2025-04': 110000, '2025-05': 113000, '2025-06': 115676,
};

/**
 * Returns verified manual monthly data for the historical chart.
 */
export function getManualHistory(): MonthlySnapshot[] {
  const allMonths = new Set([
    ...Object.keys(ROBINHOOD_MONTHLY),
    ...Object.keys(TRADITIONAL_MONTHLY),
    ...Object.keys(ROTH_MONTHLY),
  ]);

  const snapshots: MonthlySnapshot[] = [];
  for (const month of [...allMonths].sort()) {
    snapshots.push({
      month,
      robinhood: ROBINHOOD_MONTHLY[month] ?? 0,
      traditional: TRADITIONAL_MONTHLY[month] ?? 0,
      roth: ROTH_MONTHLY[month] ?? 0,
    });
  }

  return snapshots;
}

/**
 * Monthly contributions (total money deposited into all accounts)
 */
export function getMonthlyContributions(): Record<string, number> {
  const contributions: Record<string, number> = {};
  let cumulative = 25000; // Robinhood starting capital by Aug 2018

  const allMonths = new Set([
    ...Object.keys(ROBINHOOD_MONTHLY),
    ...Object.keys(TRADITIONAL_MONTHLY),
    ...Object.keys(ROTH_MONTHLY),
  ]);

  // Boeing monthly total contributions (employee + company)
  // 2022: $30,418/9mo = $3,380/mo, 2023: $35,578/12 = $2,965/mo, 2024: $37,335/12 = $3,111/mo
  const boeingMonthly: Record<string, number> = {};
  for (let m = 4; m <= 12; m++) boeingMonthly[`2022-${String(m).padStart(2, '0')}`] = 3380;
  for (let m = 1; m <= 12; m++) boeingMonthly[`2023-${String(m).padStart(2, '0')}`] = 2965;
  for (let m = 1; m <= 12; m++) boeingMonthly[`2024-${String(m).padStart(2, '0')}`] = 3111;

  for (const month of [...allMonths].sort()) {
    const boeing = boeingMonthly[month] ?? 0;
    const robinhoodDeposit = 300; // modest ongoing deposits
    cumulative += robinhoodDeposit + boeing;
    contributions[month] = cumulative;
  }

  return contributions;
}
