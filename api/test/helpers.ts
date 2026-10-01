import os from 'node:os';
import path from 'node:path';
import fs from 'node:fs/promises';
import sharp from 'sharp';
import { loadConfig } from '../src/config.js';
import { createDb } from '../src/db.js';
import { createApp, type App } from '../src/app.js';

export const TEST_DB = process.env.DATABASE_URL_TEST ?? 'postgres://postgres@127.0.0.1:54329/garimpa_test';

export async function makeApp() {
  const uploadDir = await fs.mkdtemp(path.join(os.tmpdir(), 'garimpa-uploads-'));
  const config = loadConfig({
    NODE_ENV: 'test', DATABASE_URL: TEST_DB, ALLOW_DEV_LOGIN: 'true',
    SESSION_SECRET: 'segredo-de-teste-com-mais-de-dezesseis-chars', UPLOAD_DIR: uploadDir, PUBLIC_URL: 'http://localhost',
  });
  const sql = createDb(TEST_DB);
  const app = createApp({ sql, config });
  return { app, sql, config, close: () => sql.end() };
}

export type Session = { cookie: string; device: string; user: { id: string; name: string; handle: string } };

export async function login(app: App, name: string, device = `dev-${name}`): Promise<Session> {
  const res = await app.request('/api/auth/dev', {
    method: 'POST', headers: { 'content-type': 'application/json', 'x-garimpa-device': device }, body: JSON.stringify({ name }),
  });
  if (res.status !== 200) throw new Error(`login falhou: ${res.status} ${await res.text()}`);
  const cookie = (res.headers.get('set-cookie') ?? '').split(';')[0]!;
  const body = (await res.json()) as { user: Session['user'] };
  return { cookie, device, user: body.user };
}

export async function api(app: App, method: string, url: string, opts: { body?: unknown; session?: Session; form?: FormData } = {}) {
  // O cliente web manda x-garimpa-device em toda chamada; sem ele as escritas são recusadas (anti-CSRF).
  const headers: Record<string, string> = { 'x-garimpa-device': opts.session?.device ?? 'dev-anonimo' };
  if (opts.session) headers['cookie'] = opts.session.cookie;
  let body: BodyInit | undefined;
  if (opts.form) body = opts.form;
  else if (opts.body !== undefined) { headers['content-type'] = 'application/json'; body = JSON.stringify(opts.body); }
  const res = await app.request(url, { method, headers, body });
  const text = await res.text();
  let json: any = null;
  try { json = JSON.parse(text); } catch { json = { raw: text }; }
  return { status: res.status, json };
}

/** Imagem de teste com ruído determinístico por semente: duas sementes diferentes dão hashes bem distintos. */
export async function testImage(seed: number, size = 256): Promise<Buffer> {
  const px = Buffer.alloc(size * size * 3);
  const fx = 0.02 + (seed % 7) * 0.03;
  const fy = 0.02 + ((seed * 3) % 5) * 0.04;
  let s = seed * 2654435761 + 12345;
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      s = (s * 1103515245 + 12345) & 0x7fffffff;
      const noise = ((s >> 8) & 0xff) * 0.15;
      const wave = 128 + 110 * Math.sin(x * fx + seed) * Math.cos(y * fy - seed * 0.7);
      const v = Math.max(0, Math.min(255, wave * 0.85 + noise));
      const i = (y * size + x) * 3;
      px[i] = v; px[i + 1] = (v * 0.6 + seed * 9) % 256; px[i + 2] = (255 - v + seed * 17) % 256;
    }
  }
  return sharp(px, { raw: { width: size, height: size, channels: 3 } }).png().toBuffer();
}

export async function upload(app: App, session: Session, img: Buffer, extra: Record<string, string> = {}) {
  const form = new FormData();
  form.set('file', new Blob([new Uint8Array(img)], { type: 'image/png' }), 'prova.png');
  for (const [k, v] of Object.entries(extra)) form.set(k, v);
  return api(app, 'POST', '/api/uploads', { session, form });
}

export const uniq = (p: string) => `${p}-${Math.random().toString(36).slice(2, 8)}`;
