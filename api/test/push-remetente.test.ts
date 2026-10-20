import { execFileSync } from 'node:child_process';
import crypto from 'node:crypto';
import fs from 'node:fs';
import https from 'node:https';
import os from 'node:os';
import path from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import webpush from 'web-push';
import type { Sql } from '../src/db.js';
import { runTick } from '../src/jobs.js';
import { sendPendingPush } from '../src/push/sender.js';
import { type PushPayload, type PushTransport, webPushTransport } from '../src/push/transport.js';
import { login, makeApp, uniq } from './helpers.js';

let sql: Sql;
let close: () => Promise<void>;
let app: Awaited<ReturnType<typeof makeApp>>['app'];
beforeAll(async () => {
  ({ app, sql, close } = await makeApp());
});
afterAll(async () => {
  await close();
});

type Call = { endpoint: string; payload: PushPayload; ttl: number; topic: string | null };
/** Transporte controlado: registra as chamadas e devolve o status programado por endpoint (padrão 201). */
function fakeTransport(status: Record<string, number> = {}, delayMs = 0) {
  const calls: Call[] = [];
  const transport: PushTransport = {
    async send(sub, payload, opts) {
      calls.push({ endpoint: sub.endpoint, payload, ttl: opts.ttl, topic: opts.topic });
      if (delayMs) await new Promise((r) => setTimeout(r, delayMs));
      return { statusCode: status[sub.endpoint] ?? 201 };
    },
  };
  return { transport, calls };
}

async function newUser() {
  const s = await login(app, uniq('Push'));
  return s.user.id;
}
async function addSub(userId: string, endpoint = `https://fcm.googleapis.com/fcm/send/${uniq('e')}`) {
  await sql`insert into push_subscriptions (user_id, endpoint, p256dh, auth) values (${userId}, ${endpoint}, 'p', 'a')`;
  return endpoint;
}
async function addNotif(userId: string, topic: string | null = 'missao-x') {
  const r = await sql<{ id: string }[]>`
    insert into notifications (user_id, kind, title, body, url, topic)
    values (${userId}, 'nova_evidencia', 'Título', 'Corpo', '/missao/1', ${topic}) returning id`;
  return r[0]!.id;
}
const stateOf = async (id: string) =>
  (
    await sql<
      { pushState: string; pushAttempts: number; pushNextAt: Date }[]
    >`select push_state, push_attempts, push_next_at from notifications where id = ${id}`
  )[0]!;
/** Esvazia a fila (o banco de teste é compartilhado: pode haver pendentes de outros testes). */
async function drain(transport: PushTransport, now?: Date) {
  for (let i = 0; i < 20; i++) if ((await sendPendingPush(sql, transport, now)).processed === 0) return;
}

describe('remetente de push', () => {
  it('entrega em um aparelho marca enviado', async () => {
    const u = await newUser();
    const ep = await addSub(u);
    const id = await addNotif(u, 'missao-abc');
    const { transport, calls } = fakeTransport();
    await drain(transport);
    expect((await stateOf(id)).pushState).toBe('enviado');
    const sub = (
      await sql<{ lastSuccessAt: Date | null }[]>`select last_success_at from push_subscriptions where endpoint = ${ep}`
    )[0]!;
    expect(sub.lastSuccessAt).not.toBeNull();
    const call = calls.find((c) => c.payload.id === id)!;
    expect(call.payload).toMatchObject({ url: '/missao/1', topic: 'missao-abc', title: 'Título', body: 'Corpo' });
    expect(call.ttl).toBe(86400);
    expect(call.topic).toBe('missao-abc');
  });

  it('sem inscrição marca sem_assinatura', async () => {
    const u = await newUser();
    const id = await addNotif(u);
    await drain(fakeTransport().transport);
    expect((await stateOf(id)).pushState).toBe('sem_assinatura');
  });

  it('410 e 404 apagam a inscrição', async () => {
    const u = await newUser();
    const morta = await addSub(u);
    const morta2 = await addSub(u);
    const viva = await addSub(u);
    const id = await addNotif(u);
    await drain(fakeTransport({ [morta]: 410, [morta2]: 404 }).transport);
    expect((await stateOf(id)).pushState).toBe('enviado');
    const left = await sql<{ endpoint: string }[]>`select endpoint from push_subscriptions where user_id = ${u}`;
    expect(left.map((r) => r.endpoint)).toEqual([viva]);
  });

  it('só inscrições mortas viram sem_assinatura', async () => {
    const u = await newUser();
    const morta = await addSub(u);
    const id = await addNotif(u);
    await drain(fakeTransport({ [morta]: 410 }).transport);
    expect((await stateOf(id)).pushState).toBe('sem_assinatura');
  });

  it('erro agenda nova tentativa com espera crescente', async () => {
    const u = await newUser();
    const ep = await addSub(u);
    const id = await addNotif(u);
    const { transport } = fakeTransport({ [ep]: 500 });
    let now = new Date(Date.now() + 60_000);
    for (const [i, min] of [1, 5, 30, 120].entries()) {
      await drain(transport, now);
      const s = await stateOf(id);
      expect(s.pushState).toBe('pendente');
      expect(s.pushAttempts).toBe(i + 1);
      expect(Math.abs(s.pushNextAt.getTime() - (now.getTime() + min * 60_000))).toBeLessThan(1000);
      now = new Date(s.pushNextAt.getTime() + 1000);
    }
    await drain(transport, now);
    const last = await stateOf(id);
    expect(last.pushState).toBe('falhou');
    expect(last.pushAttempts).toBe(5);
    const sub = (await sql<{ failures: number }[]>`select failures from push_subscriptions where endpoint = ${ep}`)[0]!;
    expect(sub.failures).toBe(5);
  });

  it('notificação de conta removida não é enviada', async () => {
    const u = await newUser();
    await addSub(u);
    const id = await addNotif(u);
    await sql`update users set banned_at = now() where id = ${u}`;
    const { transport, calls } = fakeTransport();
    await drain(transport);
    expect(calls.find((c) => c.payload.id === id)).toBeUndefined();
    expect((await stateOf(id)).pushState).toBe('sem_assinatura');
  });

  it('dois remetentes simultâneos não enviam a mesma notificação', async () => {
    const u = await newUser();
    await addSub(u);
    const ids: string[] = [];
    for (let i = 0; i < 60; i++) ids.push(await addNotif(u));
    const { transport, calls } = fakeTransport({}, 20);
    await Promise.all([sendPendingPush(sql, transport), sendPendingPush(sql, transport)]);
    await drain(transport);
    for (const id of ids) expect(calls.filter((c) => c.payload.id === id)).toHaveLength(1);
  });

  it('um aparelho entrega e outro falha: enviado, sem nova tentativa', async () => {
    const u = await newUser();
    const ok = await addSub(u);
    const ruim = await addSub(u);
    const id = await addNotif(u);
    await drain(fakeTransport({ [ruim]: 500 }).transport);
    const s = await stateOf(id);
    expect(s.pushState).toBe('enviado');
    expect(s.pushAttempts).toBe(0);
    const f = async (e: string) =>
      (await sql<{ failures: number }[]>`select failures from push_subscriptions where endpoint = ${e}`)[0]!.failures;
    expect(await f(ruim)).toBe(1);
    expect(await f(ok)).toBe(0);
  });

  it('não segura bloqueio no banco enquanto envia', async () => {
    const u = await newUser();
    await addSub(u);
    const id = await addNotif(u);
    let release!: () => void;
    const gate = new Promise<void>((r) => {
      release = r;
    });
    let entered!: () => void;
    const inside = new Promise<void>((r) => {
      entered = r;
    });
    const transport: PushTransport = {
      async send(_s, payload) {
        if (payload.id === id) {
          entered();
          await gate;
        }
        return { statusCode: 201 };
      },
    };
    const run = drain(transport);
    await inside;
    const t0 = Date.now();
    await sql`update notifications set read_at = now() where id = ${id}`;
    expect(Date.now() - t0).toBeLessThan(500);
    release();
    await run;
    expect((await stateOf(id)).pushState).toBe('enviado');
  });

  it('sem VAPID as pendentes viram desativado', async () => {
    const u = await newUser();
    await addSub(u);
    const id = await addNotif(u);
    await runTick(sql, { pushEnabled: false });
    expect((await stateOf(id)).pushState).toBe('desativado');
  });

  it('web-push real criptografa e manda os cabeçalhos', async () => {
    // O web-push só fala https: servidor local com certificado autoexplicado, aceito só neste teste.
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'push-tls-'));
    execFileSync(
      'openssl',
      [
        'req',
        '-x509',
        '-newkey',
        'rsa:2048',
        '-nodes',
        '-days',
        '1',
        '-subj',
        '/CN=localhost',
        '-keyout',
        path.join(dir, 'k.pem'),
        '-out',
        path.join(dir, 'c.pem'),
      ],
      { stdio: 'ignore' },
    );
    const seen: { headers: Record<string, string | string[] | undefined>; size: number }[] = [];
    const server = https.createServer(
      { key: fs.readFileSync(path.join(dir, 'k.pem')), cert: fs.readFileSync(path.join(dir, 'c.pem')) },
      (req, res) => {
        let size = 0;
        req.on('data', (c) => {
          size += c.length;
        });
        req.on('end', () => {
          seen.push({ headers: req.headers, size });
          res.statusCode = 201;
          res.end();
        });
      },
    );
    await new Promise<void>((r) => server.listen(0, '127.0.0.1', r));
    const port = (server.address() as { port: number }).port;
    const agentOpts = https.globalAgent.options as { rejectUnauthorized?: boolean };
    const before = agentOpts.rejectUnauthorized;
    agentOpts.rejectUnauthorized = false;
    try {
      const vapid = webpush.generateVAPIDKeys();
      const transport = webPushTransport({ ...vapid, subject: 'mailto:teste@example.com' });
      const ecdh = crypto.createECDH('prime256v1');
      ecdh.generateKeys();
      const res = await transport.send(
        {
          endpoint: `https://127.0.0.1:${port}/push/x`,
          p256dh: ecdh.getPublicKey().toString('base64url'),
          auth: crypto.randomBytes(16).toString('base64url'),
        },
        { id: 'n1', title: 't', body: 'b', url: '/u', topic: 'missao-123e4567-e89b-12d3-a456-426614174000' },
        { ttl: 86400, topic: 'missao-123e4567-e89b-12d3-a456-426614174000' },
      );
      expect(res.statusCode).toBe(201);
      expect(seen).toHaveLength(1);
      const h = seen[0]!.headers;
      expect(h.ttl).toBe('86400');
      expect(h.topic).toBe('123e4567e89b12d3a456426614174000');
      expect(h.urgency).toBe('normal');
      expect(String(h.topic)).toMatch(/^[A-Za-z0-9_-]{1,32}$/);
      expect(h['content-encoding']).toBe('aes128gcm');
      expect(String(h.authorization).startsWith('vapid ')).toBe(true);
      expect(seen[0]!.size).toBeGreaterThan(0);
      // Falha de rede vira statusCode 0.
      const net = await transport.send(
        {
          endpoint: 'https://127.0.0.1:1/x',
          p256dh: ecdh.getPublicKey().toString('base64url'),
          auth: crypto.randomBytes(16).toString('base64url'),
        },
        { id: 'n2', title: 't', body: 'b', url: '/u', topic: null },
        { ttl: 86400, topic: null },
      );
      expect(net.statusCode).toBe(0);
    } finally {
      agentOpts.rejectUnauthorized = before;
      await new Promise<void>((r) => {
        server.close(() => r());
        server.closeAllConnections();
      });
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });
});
