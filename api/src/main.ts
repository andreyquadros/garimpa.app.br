import { serve } from '@hono/node-server';
import { loadConfig } from './config.js';
import { createDb, migrate, ensureCity } from './db.js';
import { createApp } from './app.js';
import { runTick } from './jobs.js';

const config = loadConfig();
const sql = createDb(config.DATABASE_URL);
const applied = await migrate(sql);
await ensureCity(sql);
if (applied.length) console.log(`migrações aplicadas: ${applied.join(', ')}`);
if (!config.GOOGLE_CLIENT_ID) console.warn('GOOGLE_CLIENT_ID ausente: login com Google desligado' + (config.allowDevLogin ? ' (login de desenvolvimento ativo)' : ''));
if (config.SESSION_SECRET.startsWith('garimpa-dev-secret')) console.warn('SESSION_SECRET padrão: troque em produção');

const app = createApp({ sql, config });
serve({ fetch: app.fetch, port: config.PORT, hostname: '0.0.0.0' }, (info) => {
  console.log(`garimpa-api em http://localhost:${info.port} (${config.NODE_ENV})`);
});
const tick = () => runTick(sql).catch((e) => console.error('tick falhou', e));
setTimeout(tick, 5000);
setInterval(tick, 10 * 60 * 1000);
