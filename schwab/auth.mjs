/**
 * Schwab OAuth2 Authorization Script
 *
 * Run this once to get initial tokens:
 *   node schwab/auth.mjs
 *
 * It will:
 * 1. Open your browser to Schwab login
 * 2. Start a local HTTPS server to catch the callback
 * 3. Exchange the auth code for access + refresh tokens
 * 4. Save tokens to schwab/tokens.json
 *
 * Re-run when refresh token expires (every 7 days).
 */

import https from 'https';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { execSync } from 'child_process';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// Load .env manually (no dotenv dependency needed)
function loadEnv() {
  const envPath = path.join(__dirname, '..', '.env');
  if (!fs.existsSync(envPath)) {
    console.error('ERROR: .env file not found. Create it with VITE_SCHWAB_CLIENT_ID and VITE_SCHWAB_CLIENT_SECRET');
    process.exit(1);
  }
  const lines = fs.readFileSync(envPath, 'utf-8').split('\n');
  const env = {};
  for (const line of lines) {
    const match = line.match(/^([^#=]+)=(.*)$/);
    if (match) env[match[1].trim()] = match[2].trim();
  }
  return env;
}

const env = loadEnv();
const CLIENT_ID = env.VITE_SCHWAB_CLIENT_ID;
const CLIENT_SECRET = env.VITE_SCHWAB_CLIENT_SECRET;
const CALLBACK_URL = env.VITE_SCHWAB_CALLBACK_URL || 'https://127.0.0.1:5173/callback';
const TOKEN_FILE = path.join(__dirname, 'tokens.json');

if (!CLIENT_ID || !CLIENT_SECRET) {
  console.error('ERROR: VITE_SCHWAB_CLIENT_ID and VITE_SCHWAB_CLIENT_SECRET must be set in .env');
  process.exit(1);
}

// Parse callback URL
const callbackUrl = new URL(CALLBACK_URL);
const PORT = parseInt(callbackUrl.port) || 5173;
const CALLBACK_PATH = callbackUrl.pathname;

// Generate self-signed cert for HTTPS (required by Schwab)
function getSelfSignedCert() {
  const certDir = path.join(__dirname, '.certs');
  const keyPath = path.join(certDir, 'key.pem');
  const certPath = path.join(certDir, 'cert.pem');

  if (fs.existsSync(keyPath) && fs.existsSync(certPath)) {
    return { key: fs.readFileSync(keyPath), cert: fs.readFileSync(certPath) };
  }

  if (!fs.existsSync(certDir)) fs.mkdirSync(certDir, { recursive: true });

  console.log('Generating self-signed certificate...');

  // Try openssl from Git for Windows, then system PATH
  const opensslPaths = [
    'C:\\Program Files\\Git\\usr\\bin\\openssl.exe',
    'C:\\Program Files (x86)\\Git\\usr\\bin\\openssl.exe',
    'openssl',
  ];

  let success = false;
  for (const opensslCmd of opensslPaths) {
    try {
      execSync(
        `"${opensslCmd}" req -x509 -newkey rsa:2048 -keyout "${keyPath}" -out "${certPath}" -days 365 -nodes -subj "/CN=localhost"`,
        { stdio: 'pipe' }
      );
      success = true;
      break;
    } catch {
      continue;
    }
  }

  if (!success) {
    console.error('ERROR: Could not generate SSL certificate. OpenSSL not found.');
    console.error('Install Git for Windows (includes OpenSSL) or add openssl to PATH.');
    process.exit(1);
  }

  return { key: fs.readFileSync(keyPath), cert: fs.readFileSync(certPath) };
}

// Build authorization URL
const authUrl = `https://api.schwabapi.com/v1/oauth/authorize?client_id=${CLIENT_ID}&redirect_uri=${encodeURIComponent(CALLBACK_URL)}&response_type=code`;

console.log('\n=== Schwab OAuth2 Authorization ===\n');
console.log('Opening browser to Schwab login...');
console.log('If it does not open, manually go to:\n');
console.log(authUrl);
console.log('');

// Open browser
try {
  execSync(`start "" "${authUrl}"`, { stdio: 'pipe' });
} catch {
  console.log('(Could not auto-open browser — copy the URL above)');
}

// Start HTTPS server to catch callback
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

    // Exchange code for tokens
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

      // Save tokens with timestamp
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
      console.log('\n✅ Tokens saved to schwab/tokens.json');
      console.log(`   Access token expires in ${tokens.expires_in} seconds`);
      console.log('   Refresh token valid for 7 days\n');

      res.writeHead(200, { 'Content-Type': 'text/html' });
      res.end('<h1>✅ Authorization Successful!</h1><p>Tokens saved. You can close this tab.</p>');
    } catch (err) {
      console.error('Error exchanging token:', err);
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
