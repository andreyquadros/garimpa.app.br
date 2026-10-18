import { tmpdir } from 'node:os';
import path from 'node:path';
import { defineConfig } from '@playwright/test';
import { E2E_DATABASE_URL } from './e2e/db-url.ts';

// Fotos enviadas nos testes vão para uma pasta temporária fixa (recriada em `e2e/prepare-db.ts`), nunca para a
// `uploads/` de desenvolvimento.
const webDir = import.meta.dirname;
const apiDir = path.resolve(webDir, '../api');
const uploadDir = path.join(tmpdir(), 'garimpa-e2e-uploads');

// Portas próprias (8788/5174) e `reuseExistingServer: false`: um servidor de desenvolvimento aberto (8787/5173, com o
// banco de dev) jamais é reaproveitado pelos testes.
export default defineConfig({
  testDir: 'e2e',
  workers: 1,
  forbidOnly: !!process.env.CI,
  timeout: 60_000,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? [['dot'], ['html', { open: 'never' }]] : 'list',
  use: { baseURL: 'http://localhost:5174', trace: 'retain-on-failure' },
  projects: [{ name: 'chromium', use: { browserName: 'chromium' } }],
  webServer: [
    {
      // Binários locais direto (sem `pnpm` no PATH, como em `npx pnpm@10.28.0 ... test:e2e`).
      command: 'node_modules/.bin/tsx ../web/e2e/prepare-db.ts && node_modules/.bin/tsx src/main.ts',
      cwd: apiDir,
      url: 'http://localhost:8788/api/health',
      env: {
        DATABASE_URL: E2E_DATABASE_URL,
        DATABASE_URL_E2E: E2E_DATABASE_URL,
        UPLOAD_DIR: uploadDir,
        NODE_ENV: 'test',
        PORT: '8788',
        // Com Redis: o fluxo confere o estado final em leituras que agora passam pelo cache, então o e2e também
        // verifica a invalidação. Base 1 do Redis local, separada da 0 (dev) e da 2 (testes da API).
        REDIS_URL: process.env.REDIS_URL_E2E ?? 'redis://127.0.0.1:63799/1',
      },
      reuseExistingServer: false,
    },
    {
      command: 'node_modules/.bin/vite --port 5174 --strictPort',
      cwd: webDir,
      url: 'http://localhost:5174',
      env: { GARIMPA_API_PROXY: 'http://localhost:8788' },
      reuseExistingServer: false,
    },
  ],
});
