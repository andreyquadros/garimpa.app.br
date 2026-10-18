import { mkdirSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { createCache } from '../../api/src/cache.ts';
import resetDb from './reset-db.ts';

// O Playwright sobe os `webServer` antes do `globalSetup`, e a API migra o banco ao iniciar: o banco precisa existir
// antes dela. Por isso o comando da API roda este preparo primeiro (ver playwright.config.ts).
await resetDb();

// Banco recriado, mas o Redis do e2e guarda o cache da execução anterior: subir a versão dos grupos globais impede
// que uma leitura responda HIT com dados que já não existem (grupos por id usam ids novos e já nascem limpos).
if (process.env.REDIS_URL) {
  const cache = createCache(process.env.REDIS_URL, { commandTimeoutMs: 2000 });
  try {
    await cache.bump(['config', 'missoes', 'achados', 'lugares', 'ranking']);
  } finally {
    await cache.close();
  }
}

// Fotos dos testes vão para uma pasta fixa e temporária, nunca para a `uploads/` de desenvolvimento; recriada vazia.
const uploadDir = path.join(tmpdir(), 'garimpa-e2e-uploads');
rmSync(uploadDir, { recursive: true, force: true });
mkdirSync(uploadDir, { recursive: true });
