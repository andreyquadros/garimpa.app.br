import { serve } from '@hono/node-server';
import { createApp } from './app.js';
import { createCache } from './cache.js';
import { bumpOnStartup } from './cache-bump.js';
import { loadConfig } from './config.js';
import { createDb, ensureCity, migrate } from './db.js';
import { runTick } from './jobs.js';

const config = loadConfig();
const sql = createDb(config.DATABASE_URL);
const applied = await migrate(sql);
await ensureCity(sql);
if (applied.length) console.log(`migrações aplicadas: ${applied.join(', ')}`);
if (!config.GOOGLE_CLIENT_ID)
  console.warn(
    'GOOGLE_CLIENT_ID ausente: login com Google desligado' +
      (config.allowDevLogin ? ' (login de desenvolvimento ativo)' : ''),
  );
if (config.SESSION_SECRET.startsWith('garimpa-dev-secret')) console.warn('SESSION_SECRET padrão: troque em produção');

const cache = createCache(config.REDIS_URL);
// Depois da migração: o banco já está no formato novo e o cache não pode devolver o que veio antes do deploy.
await bumpOnStartup(cache);
const app = createApp({ sql, config, cache });
const server = serve({ fetch: app.fetch, port: config.PORT, hostname: '0.0.0.0' }, (info) => {
  console.log(`garimpa-api em http://localhost:${info.port} (${config.NODE_ENV})`);
});
const tick = () => runTick(sql).catch((e) => console.error('tick falhou', e));
setTimeout(tick, 5000);
setInterval(tick, 10 * 60 * 1000);

// Encerramento limpo: para de aceitar conexões, depois fecha o Redis e o Postgres (o orquestrador manda SIGTERM).
let stopping = false;
const shutdown = () => {
  if (stopping) return;
  stopping = true;
  server.close(async () => {
    await cache.close().catch(() => {});
    await sql.end().catch(() => {});
    process.exit(0);
  });
  // Conexões keep-alive podem segurar o close; não vale esperar além disso.
  setTimeout(() => process.exit(0), 10_000).unref();
};
process.on('SIGTERM', shutdown);
process.on('SIGINT', shutdown);
