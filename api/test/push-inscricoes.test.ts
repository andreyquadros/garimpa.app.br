import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import webpush from 'web-push';
import type { App } from '../src/app.js';
import type { Sql } from '../src/db.js';
import { isAllowedPushEndpoint } from '../src/push/endpoint.js';
import { vapidKeyLines } from '../src/push/keys.js';
import { api, login, makeApp, uniq } from './helpers.js';

let app: App;
let sql: Sql;
let close: () => Promise<void>;
beforeAll(async () => {
  ({ app, sql, close } = await makeApp());
});
afterAll(async () => {
  await close();
});

const keys = { p256dh: 'BPublicKeyFake', auth: 'authFake' };
const novoEndpoint = () => `https://fcm.googleapis.com/fcm/send/${uniq('e')}`;

describe('inscrições de push', () => {
  it('endpoint só de serviços de push conhecidos', () => {
    for (const ok of [
      'https://fcm.googleapis.com/fcm/send/x',
      'https://updates.push.services.mozilla.com/wpush/v2/x',
      'https://web.push.apple.com/x',
      'https://wns2-par02p.notify.windows.com/w/?token=x',
    ])
      expect(isAllowedPushEndpoint(ok), ok).toBe(true);
    for (const ruim of [
      'http://fcm.googleapis.com/x',
      'https://127.0.0.1/x',
      'https://evil.example/x',
      'https://fcm.googleapis.com.evil.example/x',
      'not a url',
    ])
      expect(isAllowedPushEndpoint(ruim), ruim).toBe(false);
  });

  it('POST com endpoint não permitido → 400', async () => {
    const a = await login(app, uniq('Ana'));
    const r = await api(app, 'POST', '/api/push/subscriptions', {
      session: a,
      body: { endpoint: 'https://evil.example/x', keys },
    });
    expect(r.status).toBe(400);
  });

  it('exige login', async () => {
    const r = await api(app, 'POST', '/api/push/subscriptions', { body: { endpoint: novoEndpoint(), keys } });
    expect(r.status).toBe(401);
  });

  it('inscrição criada e idempotente', async () => {
    const a = await login(app, uniq('Beto'));
    const endpoint = novoEndpoint();
    const r1 = await api(app, 'POST', '/api/push/subscriptions', { session: a, body: { endpoint, keys } });
    expect(r1.status).toBe(201);
    expect(r1.json).toEqual({ ok: true });
    const r2 = await api(app, 'POST', '/api/push/subscriptions', { session: a, body: { endpoint, keys } });
    expect(r2.status).toBe(201);
    const rows = await sql`select user_id from push_subscriptions where endpoint = ${endpoint}`;
    expect(rows).toHaveLength(1);
  });

  it('aparelho que troca de conta passa a ser só da conta atual', async () => {
    const a = await login(app, uniq('Caio'));
    const b = await login(app, uniq('Dani'));
    const endpoint = novoEndpoint();
    await api(app, 'POST', '/api/push/subscriptions', { session: a, body: { endpoint, keys } });
    await sql`update push_subscriptions set failures = 3 where endpoint = ${endpoint}`;
    await api(app, 'POST', '/api/push/subscriptions', { session: b, body: { endpoint, keys } });
    const rows = await sql`select user_id, failures from push_subscriptions where endpoint = ${endpoint}`;
    expect(rows).toHaveLength(1);
    expect(rows[0]?.userId).toBe(b.user.id);
    expect(rows[0]?.failures).toBe(0);
    const deA = await sql`select 1 from push_subscriptions where user_id = ${a.user.id}::uuid`;
    expect(deA).toHaveLength(0);
  });

  it('DELETE só remove a inscrição da própria pessoa', async () => {
    const a = await login(app, uniq('Eva'));
    const b = await login(app, uniq('Fabio'));
    const endpoint = novoEndpoint();
    await api(app, 'POST', '/api/push/subscriptions', { session: a, body: { endpoint, keys } });
    const alheio = await api(app, 'DELETE', '/api/push/subscriptions', { session: b, body: { endpoint } });
    expect(alheio.status).toBe(200);
    expect(await sql`select 1 from push_subscriptions where endpoint = ${endpoint}`).toHaveLength(1);
    const proprio = await api(app, 'DELETE', '/api/push/subscriptions', { session: a, body: { endpoint } });
    expect(proprio.json).toEqual({ ok: true });
    expect(await sql`select 1 from push_subscriptions where endpoint = ${endpoint}`).toHaveLength(0);
  });

  it('GET /api/push/key devolve null sem VAPID e a chave com VAPID', async () => {
    const sem = await api(app, 'GET', '/api/push/key');
    expect(sem.json).toEqual({ publicKey: null });
    const { publicKey, privateKey } = webpush.generateVAPIDKeys();
    const com = await makeApp({
      env: { VAPID_PUBLIC_KEY: publicKey, VAPID_PRIVATE_KEY: privateKey, VAPID_SUBJECT: 'mailto:a@b.com' },
    });
    try {
      const r = await api(com.app, 'GET', '/api/push/key');
      expect(r.json).toEqual({ publicKey });
    } finally {
      await com.close();
    }
  });

  it('push:keys gera um par válido', () => {
    const linhas = vapidKeyLines();
    const pub = linhas.find((l) => l.startsWith('VAPID_PUBLIC_KEY='))?.split('=')[1];
    const priv = linhas.find((l) => l.startsWith('VAPID_PRIVATE_KEY='))?.split('=')[1];
    expect(pub).toMatch(/^[A-Za-z0-9_-]+$/);
    expect(priv).toMatch(/^[A-Za-z0-9_-]+$/);
    expect(() => webpush.setVapidDetails('mailto:a@b.com', pub!, priv!)).not.toThrow();
  });
});
