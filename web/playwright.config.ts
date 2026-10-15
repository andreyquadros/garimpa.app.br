import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { defineConfig } from '@playwright/test';
import { E2E_DATABASE_URL } from './e2e/db-url.ts';

// Fotos enviadas nos testes vão para uma pasta temporária, nunca para a `uploads/` de desenvolvimento.
const uploadDir = mkdtempSync(path.join(tmpdir(), 'garimpa-e2e-'));

export default defineConfig({
  testDir: 'e2e',
  workers: 1,
  use: { baseURL: 'http://localhost:5173', trace: 'retain-on-failure' },
  projects: [{ name: 'chromium', use: { browserName: 'chromium' } }],
  webServer: [
    {
      command:
        'pnpm --filter garimpa-api exec tsx ../web/e2e/prepare-db.ts && pnpm --filter garimpa-api exec tsx src/main.ts',
      url: 'http://localhost:8787/api/health',
      env: {
        DATABASE_URL: E2E_DATABASE_URL,
        DATABASE_URL_E2E: E2E_DATABASE_URL,
        UPLOAD_DIR: uploadDir,
        NODE_ENV: 'test',
      },
      reuseExistingServer: !process.env.CI,
    },
    {
      command: 'pnpm --filter garimpa-web dev',
      url: 'http://localhost:5173',
      reuseExistingServer: !process.env.CI,
    },
  ],
});
