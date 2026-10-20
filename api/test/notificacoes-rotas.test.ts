import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { App } from '../src/app.js';
import type { Sql } from '../src/db.js';
import { runTick } from '../src/jobs.js';
import { api, login, makeApp, type Session, uniq } from './helpers.js';

let app: App;
let sql: Sql;
let close: () => Promise<void>;
beforeAll(async () => {
  ({ app, sql, close } = await makeApp());
});
afterAll(async () => {
  await close();
});

// Cada linha ganha um created_at distinto (um minuto de diferença): a paginação usa created_at como cursor.
async function semear(userId: string, n: number, base = new Date()) {
  for (let i = 0; i < n; i++) {
    const quando = new Date(base.getTime() - i * 60_000);
    await sql`insert into notifications (user_id, kind, title, body, url, created_at)
      values (${userId}::uuid, 'gorjeta_recebida', ${`t${i}`}, 'corpo', '/missoes/x', ${quando})`;
  }
}

describe('rotas de notificações', () => {
  it('lista pagina de 30 em 30 e conta não lidas', async () => {
    const a = await login(app, uniq('Ana'));
    await semear(a.user.id, 35);
    const p1 = await api(app, 'GET', '/api/notifications', { session: a });
    expect(p1.status).toBe(200);
    expect(p1.json.items).toHaveLength(30);
    expect(p1.json.unread).toBe(35);
    expect(p1.json.items[0].title).toBe('t0');
    expect(Object.keys(p1.json.items[0]).sort()).toEqual(
      ['body', 'createdAt', 'id', 'kind', 'readAt', 'title', 'url'].sort(),
    );
    expect(p1.json.nextBefore).toBe(p1.json.items[29].createdAt);
    const p2 = await api(app, 'GET', `/api/notifications?before=${encodeURIComponent(p1.json.nextBefore)}`, {
      session: a,
    });
    expect(p2.json.items).toHaveLength(5);
    expect(p2.json.nextBefore).toBeNull();
    expect(p2.json.unread).toBe(35);
  });

  it('marcar lidas por id e todas', async () => {
    const a = await login(app, uniq('Beto'));
    await semear(a.user.id, 4);
    const lista = await api(app, 'GET', '/api/notifications', { session: a });
    const ids = lista.json.items.slice(0, 2).map((i: { id: string }) => i.id);
    const r1 = await api(app, 'POST', '/api/notifications/read', { session: a, body: { ids } });
    expect(r1.json).toEqual({ unread: 2 });
    const lidas = await sql`select id from notifications where user_id = ${a.user.id}::uuid and read_at is not null`;
    expect(lidas).toHaveLength(2);
    const r2 = await api(app, 'POST', '/api/notifications/read', { session: a, body: {} });
    expect(r2.json).toEqual({ unread: 0 });
    const sem = await sql`select id from notifications where user_id = ${a.user.id}::uuid and read_at is null`;
    expect(sem).toHaveLength(0);
    const ruim = await api(app, 'POST', '/api/notifications/read', { session: a, body: { ids: ['x'] } });
    expect(ruim.status).toBe(400);
  });

  it('não marca nem lista notificações de outra pessoa', async () => {
    const a: Session = await login(app, uniq('Caio'));
    const b: Session = await login(app, uniq('Duda'));
    await semear(b.user.id, 2);
    const idsB = (await sql<{ id: string }[]>`select id from notifications where user_id = ${b.user.id}::uuid`).map(
      (r) => r.id,
    );
    const r = await api(app, 'POST', '/api/notifications/read', { session: a, body: { ids: idsB } });
    expect(r.json).toEqual({ unread: 0 });
    const lista = await api(app, 'GET', '/api/notifications', { session: a });
    expect(lista.json.items).toHaveLength(0);
    const bLista = await api(app, 'GET', '/api/notifications', { session: b });
    expect(bLista.json.unread).toBe(2);
  });

  it('exige login', async () => {
    expect((await api(app, 'GET', '/api/notifications')).status).toBe(401);
    expect((await api(app, 'POST', '/api/notifications/read', { body: {} })).status).toBe(401);
  });

  it('excluir a conta apaga notificações e inscrições', async () => {
    const a = await login(app, uniq('Edu'));
    await semear(a.user.id, 2);
    await sql`insert into push_subscriptions (user_id, endpoint, p256dh, auth)
      values (${a.user.id}::uuid, ${uniq('https://push.example/')}, 'k', 'a')`;
    const r = await api(app, 'DELETE', '/api/auth/account', { session: a });
    expect(r.status).toBe(200);
    const n = await sql`select 1 from notifications where user_id = ${a.user.id}::uuid`;
    const s = await sql`select 1 from push_subscriptions where user_id = ${a.user.id}::uuid`;
    expect(n).toHaveLength(0);
    expect(s).toHaveLength(0);
  });

  it('runTick apaga notificações com mais de 90 dias', async () => {
    const a = await login(app, uniq('Fabi'));
    const dia = 86_400_000;
    await sql`insert into notifications (user_id, kind, title, body, url, created_at) values
      (${a.user.id}::uuid, 'gorjeta_recebida', 'velha', 'c', '/', ${new Date(Date.now() - 91 * dia)}),
      (${a.user.id}::uuid, 'gorjeta_recebida', 'nova', 'c', '/', ${new Date(Date.now() - 89 * dia)})`;
    await runTick(sql);
    const resto = await sql<{ title: string }[]>`select title from notifications where user_id = ${a.user.id}::uuid`;
    expect(resto.map((r) => r.title)).toEqual(['nova']);
  });
});
