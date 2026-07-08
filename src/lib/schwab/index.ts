/**
 * Schwab API Integration
 *
 * Usage:
 * 1. Run `node schwab/auth.mjs` to get initial tokens
 * 2. Copy schwab/tokens.json content to browser localStorage (auto on app load)
 * 3. App auto-refreshes access tokens every 30 minutes
 * 4. Re-run auth.mjs every 7 days when refresh token expires
 */

export {
  getAccounts,
  getAllAccountsWithPositions,
  getAccountDetails,
  getQuotes,
  getOptionChain,
  getPriceHistory,
  type SchwabAccount,
  type SchwabAccountDetails,
  type SchwabPosition,
  type SchwabQuote,
  type SchwabOptionChain,
  type SchwabOptionContract,
  SchwabApiError,
} from './client';

export {
  loadTokens,
  saveTokens,
  getValidToken,
  isTokenExpired,
  isRefreshTokenExpired,
  initializeTokensFromFile,
  type SchwabTokens,
} from './tokenManager';
