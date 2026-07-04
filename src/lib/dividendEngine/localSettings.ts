/**
 * Local Settings for Dividend Portfolio OS
 *
 * Persists user-configurable values in localStorage so they
 * survive page reloads and work without PocketBase.
 */

const STORAGE_KEY = 'swan_dividend_settings';

export interface DividendLocalSettings {
  monthlyContribution: number;
  annualExpenses: number;
  averageYield: number;
  targetPositions: number;
  maxSinglePosition: number;
  /** Schwab spreads account value — used for portfolio heat, slot calc */
  spreadsAccountValue: number;
}

const DEFAULTS: DividendLocalSettings = {
  monthlyContribution: 500,
  annualExpenses: 60000,
  averageYield: 3.2,
  targetPositions: 15,
  maxSinglePosition: 15,
  spreadsAccountValue: 2800,
};

/**
 * Load settings from localStorage, falling back to defaults.
 */
export function loadLocalSettings(): DividendLocalSettings {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return { ...DEFAULTS };
    const parsed = JSON.parse(raw);
    return { ...DEFAULTS, ...parsed };
  } catch {
    return { ...DEFAULTS };
  }
}

/**
 * Save a single setting value.
 */
export function saveLocalSetting<K extends keyof DividendLocalSettings>(
  key: K,
  value: DividendLocalSettings[K],
): void {
  const current = loadLocalSettings();
  current[key] = value;
  localStorage.setItem(STORAGE_KEY, JSON.stringify(current));
}

/**
 * Save all settings at once.
 */
export function saveLocalSettings(settings: Partial<DividendLocalSettings>): void {
  const current = loadLocalSettings();
  const merged = { ...current, ...settings };
  localStorage.setItem(STORAGE_KEY, JSON.stringify(merged));
}
