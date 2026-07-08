/// <reference types="vitest" />
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'path';
import fs from 'fs';

// Serve schwab/tokens.json as /schwab-tokens.json in dev mode
function schwabTokensPlugin() {
  return {
    name: 'serve-schwab-tokens',
    configureServer(server: { middlewares: { use: (fn: (req: { url?: string }, res: { setHeader: (k: string, v: string) => void; end: (data: string) => void; statusCode: number }, next: () => void) => void) => void } }) {
      server.middlewares.use((req, res, next) => {
        if (req.url === '/schwab-tokens.json') {
          const tokensPath = path.resolve(__dirname, 'schwab/tokens.json');
          if (fs.existsSync(tokensPath)) {
            res.setHeader('Content-Type', 'application/json');
            res.end(fs.readFileSync(tokensPath, 'utf-8'));
          } else {
            res.statusCode = 404;
            res.end('{}');
          }
          return;
        }
        next();
      });
    },
  };
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
  },
  test: {
    globals: true,
    environment: 'jsdom',
    setupFiles: './src/test/setup.ts',
  },
});
