/**
 * Schwab OAuth2 — Accounts & Trading App
 *
 * Run: node schwab/auth-trading.mjs
 *
 * Authenticates with the "SwanFund_Accounts_Trading_Production" app.
 * Saves tokens to schwab/tokens-trading.json
 */

import https from 'https';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { execSync } from 'child_process';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

function loadEnv() {
  const envPath = path.join(__dirname, '..', '.env');
  const lines = fs.readFileSync(envPath, 'utf-8').split(/\r?\n/);
  const env = {};
  for (const line of lines) {
    const match = line.match(/^([^#=]+)=(.+)$/);
    if (match) env[match[1].trim()] = match[2].trim();
  }
  return env;
}

const env = loadEnv();
const CLIENT_ID = env.VITE_SCHWAB_TRADING_CLIENT_ID;
const CLIENT_SECRET = env.VITE_SCHWAB_TRADING_CLIENT_SECRET;
const CALLBACK_URL = env.VITE_SCHWAB_TRADING_CALLBACK_URL || 'https://127.0.0.1:3000/callback';
const TOKEN_FILE = path.join(__dirname, 'tokens-trading.json');

if (!CLIENT_ID || !CLIENT_SECRET) {
  console.error('ERROR: VITE_SCHWAB_TRADING_CLIENT_ID and VITE_SCHWAB_TRADING_CLIENT_SECRET must be set in .env');
  process.exit(1);
}

const callbackUrl = new URL(CALLBACK_URL);
const PORT = parseInt(callbackUrl.port) || 3000;
const CALLBACK_PATH = callbackUrl.pathname;

function getSelfSignedCert() {
  const certDir = path.join(__dirname, '.certs');
  const keyPath = path.join(certDir, 'key.pem');
  const certPath = path.join(certDir, 'cert.pem');
  if (fs.existsSync(keyPath) && fs.existsSync(certPath)) {
    return { key: fs.readFileSync(keyPath), cert: fs.readFileSync(certPath) };
  }
  if (!fs.existsSync(certDir)) fs.mkdirSync(certDir, { recursive: true });
  console.log('Generating self-signed certificate...');
  const opensslPaths = [
    'C:\\Program Files\\Git\\usr\\bin\\openssl.exe',
    'C:\\Program Files (x86)\\Git\\usr\\bin\\openssl.exe',
    'openssl',
  ];
  for (const opensslCmd of opensslPaths) {
    try {
      execSync(`"${opensslCmd}" req -x509 -newkey rsa:2048 -keyout "${keyPath}" -out "${certPath}" -days 365 -nodes -subj "/CN=localhost"`, { stdio: 'pipe' });
      return { key: fs.readFileSync(keyPath), cert: fs.readFileSync(certPath) };
    } catch { continue; }
  }
  console.error('ERROR: OpenSSL not found.');
  process.exit(1);
}

const authUrl = `https://api.schwabapi.com/v1/oauth/authorize?client_id=${CLIENT_ID}&redirect_uri=${encodeURIComponent(CALLBACK_URL)}&response_type=code`;

console.log('\n=== Schwab OAuth2 — Accounts & Trading ===\n');
console.log('Opening browser to Schwab login...');
console.log('If it does not open, manually go to:\n');
console.log(authUrl);
console.log('');

try { execSync(`start "" "${authUrl}"`, { stdio: 'pipe' }); } catch { console.log('(Copy the URL above into your browser)'); }

const cert = getSelfSignedCert();

const server = https.createServer(cert, async (req, res) => {
  const url = new URL(req.url, `https://127.0.0.1:${PORT}`);
  if (url.pathname === CALLBACK_PATH) {
    const code = url.searchParams.get('code');
    if (!code) {
      res.writeHead(400, { 'Content-Type': 'text/html' });
      res.end('<h1>Error: No authorization code received</h1>');
      return;
    }
    console.log('\nReceived authorization code. Exchanging for tokens...');
    try {
      const tokenResponse = await fetch('https://api.schwabapi.com/v1/oauth/token', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
          'Authorization': 'Basic ' + Buffer.from(`${CLIENT_ID}:${CLIENT_SECRET}`).toString('base64'),
        },
        body: new URLSearchParams({
          grant_type: 'authorization_code',
          code: code,
          redirect_uri: CALLBACK_URL,
        }),
      });
      if (!tokenResponse.ok) {
        const err = await tokenResponse.text();
        console.error('Token exchange failed:', tokenResponse.status, err);
        res.writeHead(500, { 'Content-Type': 'text/html' });
        res.end(`<h1>Token exchange failed</h1><pre>${err}</pre>`);
        server.close();
        return;
      }
      const tokens = await tokenResponse.json();
      const tokenData = {
        access_token: tokens.access_token,
        refresh_token: tokens.refresh_token,
        token_type: tokens.token_type,
        expires_in: tokens.expires_in,
        scope: tokens.scope,
        obtained_at: Date.now(),
        expires_at: Date.now() + (tokens.expires_in * 1000),
      };
      fs.writeFileSync(TOKEN_FILE, JSON.stringify(tokenData, null, 2));
      console.log('\n✅ Trading tokens saved to schwab/tokens-trading.json');
      console.log(`   Access token expires in ${tokens.expires_in} seconds`);
      console.log('   Refresh token valid for 7 days\n');
      res.writeHead(200, { 'Content-Type': 'text/html' });
      res.end('<h1>✅ Accounts & Trading Authorization Successful!</h1><p>Tokens saved. You can close this tab.</p>');
    } catch (err) {
      console.error('Error:', err);
      res.writeHead(500, { 'Content-Type': 'text/html' });
      res.end(`<h1>Error</h1><pre>${err.message}</pre>`);
    }
    setTimeout(() => { server.close(); process.exit(0); }, 1000);
  } else {
    res.writeHead(404);
    res.end('Not found');
  }
});

server.listen(PORT, '127.0.0.1', () => {
  console.log(`Waiting for callback on https://127.0.0.1:${PORT}${CALLBACK_PATH} ...\n`);
});
