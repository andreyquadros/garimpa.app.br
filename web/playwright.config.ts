import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { defineConfig } from '@playwright/test';
import { E2E_DATABASE_URL } from './e2e/db-url.ts';

// Fotos enviadas nos testes vão para uma pasta temporária, nunca para a `uploads/` de desenvolvimento.
const webDir = import.meta.dirname;
const apiDir = path.resolve(webDir, '../api');
const uploadDir = mkdtempSync(path.join(tmpdir(), 'garimpa-e2e-'));

// Portas próprias (8788/5174) e `reuseExistingServer: false`: um servidor de desenvolvimento aberto (8787/5173, com o
// banco de dev) jamais é reaproveitado pelos testes.
export default defineConfig({
  testDir: 'e2e',
  workers: 1,
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
      },
      reuseExistingServer: false,
    },
    {
      command: 'node_modules/.bin/vite --port 5174 --strictPort',
      cwd: webDir,
      url: 'http://localhost:5174',
      env: { VITE_API_PROXY: 'http://localhost:8788' },
      reuseExistingServer: false,
    },
  ],
});
