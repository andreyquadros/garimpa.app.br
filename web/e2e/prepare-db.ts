import { mkdirSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { bumpViaUrl } from '../../api/src/cache-bump.ts';
import resetDb from './reset-db.ts';

// O Playwright sobe os `webServer` antes do `globalSetup`, e a API migra o banco ao iniciar: o banco precisa existir
// antes dela. Por isso o comando da API roda este preparo primeiro (ver playwright.config.ts).
await resetDb();

// Banco recriado, mas o Redis do e2e guarda o cache da execução anterior: subir a versão dos grupos globais impede
// que uma leitura responda HIT com dados que já não existem (grupos por id usam ids novos e já nascem limpos).
// Falha alto se o Redis não responder: o cache é fail-open e, sem este erro, o e2e passaria "verde" sem cache nenhum.
if (process.env.REDIS_URL) {
  const r = await bumpViaUrl(process.env.REDIS_URL, ['config', 'missoes', 'achados', 'lugares', 'ranking']);
  if (!r.ok) throw new Error(`REDIS_URL definida, mas o Redis não respondeu: ${r.error}`);
}

// Fotos dos testes vão para uma pasta fixa e temporária, nunca para a `uploads/` de desenvolvimento; recriada vazia.
const uploadDir = path.join(tmpdir(), 'garimpa-e2e-uploads');
rmSync(uploadDir, { recursive: true, force: true });
mkdirSync(uploadDir, { recursive: true });
