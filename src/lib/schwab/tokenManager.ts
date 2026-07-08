/**
 * Schwab Token Manager
 *
 * Handles loading, refreshing, and storing OAuth2 tokens.
 * Access tokens expire every 30 minutes — auto-refreshes using the refresh token.
 * Refresh tokens expire every 7 days — re-run schwab/auth.mjs when that happens.
 *
 * For local development: reads initial tokens from schwab/tokens.json,
 * then stores refreshed tokens in localStorage for the browser session.
 */

const STORAGE_KEY = 'schwab_tokens';
const REFRESH_BUFFER_MS = 60_000; // Refresh 1 minute before expiry

export interface SchwabTokens {
  access_token: string;
  refresh_token: string;
  token_type: string;
  expires_in: number;
  scope: string;
  obtained_at: number;
  expires_at: number;
}

/**
 * Load tokens from localStorage.
 */
export function loadTokens(): SchwabTokens | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

/**
 * Save tokens to localStorage.
 */
export function saveTokens(tokens: SchwabTokens): void {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(tokens));
}

/**
 * Check if the access token is expired (or about to expire).
 */
export function isTokenExpired(tokens: SchwabTokens): boolean {
  return Date.now() >= tokens.expires_at - REFRESH_BUFFER_MS;
}

/**
 * Check if the refresh token is likely expired (7 days from obtained_at).
 */
export function isRefreshTokenExpired(tokens: SchwabTokens): boolean {
  const sevenDaysMs = 7 * 24 * 60 * 60 * 1000;
  return Date.now() >= tokens.obtained_at + sevenDaysMs;
}

/**
 * Refresh the access token using the refresh token.
 * Returns new tokens or null if refresh failed.
 */
export async function refreshAccessToken(tokens: SchwabTokens): Promise<SchwabTokens | null> {
  const clientId = import.meta.env.VITE_SCHWAB_CLIENT_ID as string;
  const clientSecret = import.meta.env.VITE_SCHWAB_CLIENT_SECRET as string;

  if (!clientId || !clientSecret) {
    console.error('Schwab credentials not configured in .env');
    return null;
  }

  try {
    const response = await fetch('https://api.schwabapi.com/v1/oauth/token', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        'Authorization': 'Basic ' + btoa(`${clientId}:${clientSecret}`),
      },
      body: new URLSearchParams({
        grant_type: 'refresh_token',
        refresh_token: tokens.refresh_token,
      }),
    });

    if (!response.ok) {
      console.error('Token refresh failed:', response.status);
      return null;
    }

    const data = await response.json();

    const newTokens: SchwabTokens = {
      access_token: data.access_token,
      refresh_token: data.refresh_token ?? tokens.refresh_token,
      token_type: data.token_type,
      expires_in: data.expires_in,
      scope: data.scope ?? tokens.scope,
      obtained_at: Date.now(),
      expires_at: Date.now() + (data.expires_in * 1000),
    };

    saveTokens(newTokens);
    return newTokens;
  } catch (err) {
    console.error('Token refresh error:', err);
    return null;
  }
}

/**
 * Get a valid access token. Refreshes if expired.
 * Returns null if no tokens available or refresh failed.
 */
export async function getValidToken(): Promise<string | null> {
  let tokens = loadTokens();

  if (!tokens) {
    console.warn('No Schwab tokens found. Run: node schwab/auth.mjs');
    return null;
  }

  if (isRefreshTokenExpired(tokens)) {
    console.warn('Schwab refresh token expired. Re-run: node schwab/auth.mjs');
    return null;
  }

  if (isTokenExpired(tokens)) {
    const refreshed = await refreshAccessToken(tokens);
    if (!refreshed) return null;
    tokens = refreshed;
  }

  return tokens.access_token;
}

/**
 * Initialize tokens from the file-based tokens (schwab/tokens.json).
 * Call this once on app startup to seed localStorage from the auth script output.
 */
export async function initializeTokensFromFile(): Promise<boolean> {
  try {
    // In development, fetch the tokens file from the public server
    const response = await fetch('/schwab-tokens.json');
    if (!response.ok) return false;

    const tokens: SchwabTokens = await response.json();
    saveTokens(tokens);
    return true;
  } catch {
    return false;
  }
}
