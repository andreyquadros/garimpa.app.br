import { Hono } from 'hono';
import { HTTPException } from 'hono/http-exception';
import { ZodError } from 'zod';
import type { Config } from './config.js';
import type { Sql } from './db.js';
import { type AppEnv, withUser } from './auth.js';
import { authRoutes } from './routes/auth.js';
import { miscRoutes } from './routes/misc.js';
import { questionRoutes } from './routes/questions.js';
import { answerRoutes } from './routes/answers.js';
import { placeRoutes } from './routes/places.js';
import { serveUpload, serveWeb } from './static.js';

export function createApp(deps: { sql: Sql; config: Config }) {
  const app = new Hono<AppEnv>();
  app.use('*', async (c, next) => {
    c.set('sql', deps.sql);
    c.set('config', deps.config);
    await next();
  });
  app.use('/api/*', withUser);

  app.onError((err, c) => {
    if (err instanceof HTTPException) return c.json({ error: 'http', message: err.message }, err.status);
    if (err instanceof ZodError) {
      const first = err.issues[0];
      return c.json({ error: 'validacao', message: first ? `${first.path.join('.') || 'dados'}: ${first.message}` : 'Dados inválidos.', issues: err.issues }, 400);
    }
    const code = (err as { code?: string }).code;
    if (code === 'P0001') return c.json({ error: 'saldo', message: err.message.replace(/^.*?:\s*/, '') || 'Saldo insuficiente.' }, 400);
    console.error(err);
    return c.json({ error: 'interno', message: 'Algo deu errado do nosso lado. Tente de novo.' }, 500);
  });
  app.notFound((c) => c.json({ error: 'nao_encontrado', message: 'Rota não encontrada.' }, 404));

  app.get('/api/health', async (c) => {
    const r = await deps.sql`select 1 as ok`;
    return c.json({ ok: r[0]?.ok === 1, time: new Date().toISOString() });
  });
  app.route('/api/auth', authRoutes);
  app.route('/api', miscRoutes);
  app.route('/api', questionRoutes);
  app.route('/api', answerRoutes);
  app.route('/api', placeRoutes);

  app.get('/u/*', (c) => serveUpload(c, deps.config.UPLOAD_DIR, c.req.path.slice(3)));

  if (deps.config.SERVE_WEB_DIR) {
    const dir = deps.config.SERVE_WEB_DIR;
    app.get('*', (c) => serveWeb(c, dir, c.req.path));
  }
  return app;
}
export type App = ReturnType<typeof createApp>;
