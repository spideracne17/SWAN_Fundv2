/// <reference types="vitest" />
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'path';
import fs from 'fs';

// Serve schwab/tokens.json as /schwab-tokens.json in dev mode
// Also handles token refresh when access token is expired
function schwabTokensPlugin() {
  return {
    name: 'serve-schwab-tokens',
    configureServer(server: { middlewares: { use: (fn: (req: { url?: string }, res: { setHeader: (k: string, v: string) => void; end: (data: string) => void; statusCode: number }, next: () => void) => void) => void } }) {
      server.middlewares.use(async (req, res, next) => {
        const envPath = path.resolve(__dirname, '.env');
        const envContent = fs.existsSync(envPath) ? fs.readFileSync(envPath, 'utf-8') : '';

        if (req.url === '/schwab-tokens.json') {
          await serveTokenFile(
            path.resolve(__dirname, 'schwab/tokens.json'),
            'VITE_SCHWAB_MARKET_CLIENT_ID',
            'VITE_SCHWAB_MARKET_CLIENT_SECRET',
            envContent,
            res
          );
          return;
        }

        if (req.url === '/schwab-trading-tokens.json') {
          await serveTokenFile(
            path.resolve(__dirname, 'schwab/tokens-trading.json'),
            'VITE_SCHWAB_TRADING_CLIENT_ID',
            'VITE_SCHWAB_TRADING_CLIENT_SECRET',
            envContent,
            res
          );
          return;
        }

        next();
      });
    },
  };
}

async function serveTokenFile(
  tokensPath: string,
  clientIdKey: string,
  clientSecretKey: string,
  envContent: string,
  res: { setHeader: (k: string, v: string) => void; end: (data: string) => void; statusCode: number }
) {
  if (!fs.existsSync(tokensPath)) {
    res.statusCode = 404;
    res.end('{}');
    return;
  }

  let tokens = JSON.parse(fs.readFileSync(tokensPath, 'utf-8'));

  if (Date.now() >= tokens.expires_at - 60000) {
    const clientId = envContent.match(new RegExp(clientIdKey + '=(.+)'))?.[1]?.trim();
    const clientSecret = envContent.match(new RegExp(clientSecretKey + '=(.+)'))?.[1]?.trim();

    if (clientId && clientSecret && tokens.refresh_token) {
      try {
        const resp = await fetch('https://api.schwabapi.com/v1/oauth/token', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/x-www-form-urlencoded',
            'Authorization': 'Basic ' + Buffer.from(`${clientId}:${clientSecret}`).toString('base64'),
          },
          body: new URLSearchParams({ grant_type: 'refresh_token', refresh_token: tokens.refresh_token }),
        });
        if (resp.ok) {
          const data = await resp.json();
          tokens = { access_token: data.access_token, refresh_token: data.refresh_token ?? tokens.refresh_token, token_type: data.token_type, expires_in: data.expires_in, scope: data.scope ?? tokens.scope, obtained_at: Date.now(), expires_at: Date.now() + (data.expires_in * 1000) };
          fs.writeFileSync(tokensPath, JSON.stringify(tokens, null, 2));
          console.log(`[schwab] Token refreshed for ${path.basename(tokensPath)}`);
        }
      } catch (err) { console.warn('[schwab] Refresh error:', err); }
    }
  }

  res.setHeader('Content-Type', 'application/json');
  res.end(JSON.stringify(tokens));
}

export default defineConfig({
  plugins: [react(), schwabTokensPlugin()],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
  server: {
    watch: {
      ignored: ['**/pocketbase/**'],
    },
    proxy: {
      '/schwab-api': {
        target: 'https://api.schwabapi.com',
        changeOrigin: true,
        rewrite: (path: string) => path.replace(/^\/schwab-api/, ''),
        secure: true,
      },
    },
  },
  test: {
    globals: true,
    environment: 'jsdom',
    setupFiles: './src/test/setup.ts',
  },
});
