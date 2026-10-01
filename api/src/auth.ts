import { SignJWT, jwtVerify, createRemoteJWKSet } from 'jose';
import { createHash } from 'node:crypto';
import type { Context, MiddlewareHandler } from 'hono';
import { getCookie, setCookie, deleteCookie } from 'hono/cookie';
import { HTTPException } from 'hono/http-exception';
import { getConnInfo } from '@hono/node-server/conninfo';
import type { Config } from './config.js';
import type { Sql, Tx } from './db.js';
import { slugify } from './text.js';

export const COOKIE = 'garimpa_s';

export type User = {
  id: string;
  name: string;
  handle: string;
  email: string | null;
  avatarUrl: string | null;
  cityId: string | null;
  xp: number;
  credits: number;
  creditsPending: number;
  trust: string | number;
  streakDays: number;
  role: 'user' | 'moderator' | 'admin';
  bannedAt: string | null;
  createdAt: string;
};

export type AppEnv = {
  Variables: { user: User | null; sql: Sql; config: Config };
};

const secretKey = (c: Config) => new TextEncoder().encode(c.SESSION_SECRET);

export async function signSession(config: Config, userId: string): Promise<string> {
  return new SignJWT({})
    .setProtectedHeader({ alg: 'HS256' })
    .setSubject(userId)
    .setIssuedAt()
    .setExpirationTime('30d')
    .sign(secretKey(config));
}

export async function readSession(config: Config, token: string): Promise<string | null> {
  try {
    const { payload } = await jwtVerify(token, secretKey(config));
    return payload.sub ?? null;
  } catch {
    return null;
  }
}

export function setSessionCookie(c: Context<AppEnv>, token: string) {
  const cfg = c.get('config');
  setCookie(c, COOKIE, token, {
    httpOnly: true,
    sameSite: 'Lax',
    secure: cfg.secure,
    path: '/',
    maxAge: 60 * 60 * 24 * 30,
  });
}

export function clearSessionCookie(c: Context<AppEnv>) {
  deleteCookie(c, COOKIE, { path: '/' });
}

let jwks: ReturnType<typeof createRemoteJWKSet> | null = null;

export type GoogleProfile = { sub: string; email: string | null; name: string; picture: string | null };

/** Verifica o ID token do "Entrar com Google" (Google Identity Services) contra as chaves públicas do Google. */
export async function verifyGoogleIdToken(config: Config, idToken: string): Promise<GoogleProfile> {
  if (!config.GOOGLE_CLIENT_ID) throw new HTTPException(503, { message: 'Login com Google não configurado (GOOGLE_CLIENT_ID).' });
  jwks ??= createRemoteJWKSet(new URL('https://www.googleapis.com/oauth2/v3/certs'));
  const { payload } = await jwtVerify(idToken, jwks, {
    issuer: ['https://accounts.google.com', 'accounts.google.com'],
    audience: config.GOOGLE_CLIENT_ID,
  });
  if (!payload.sub) throw new HTTPException(401, { message: 'Token do Google sem identificador.' });
  return {
    sub: payload.sub,
    // Só um e-mail confirmado pelo Google serve para reconhecer uma conta já existente.
    email: payload.email_verified === true && typeof payload.email === 'string' ? payload.email : null,
    name: typeof payload.name === 'string' && payload.name ? payload.name : 'Garimpeiro',
    picture: typeof payload.picture === 'string' ? payload.picture : null,
  };
}

export async function uniqueHandle(db: Sql | Tx, name: string): Promise<string> {
  const base = slugify(name);
  for (let i = 0; i < 50; i++) {
    const candidate = i === 0 ? base : `${base}-${Math.floor(100 + Math.random() * 900)}`;
    const taken = await db`select 1 from users where handle = ${candidate}`;
    if (taken.length === 0) return candidate;
  }
  return `${base}-${Date.now().toString(36)}`;
}

export async function loadUser(sql: Sql, id: string): Promise<User | null> {
  const rows = await sql<User[]>`
    select id, name, handle, email, avatar_url, city_id, xp, credits, credits_pending, trust, streak_days, role, banned_at, created_at
    from users where id = ${id}::uuid`;
  const u = rows[0];
  if (!u || u.bannedAt) return null;
  return u;
}

/** Lê o cookie de sessão e carrega o usuário (ou null). Nunca bloqueia. */
export const withUser: MiddlewareHandler<AppEnv> = async (c, next) => {
  c.set('user', null);
  const token = getCookie(c, COOKIE);
  if (token) {
    const id = await readSession(c.get('config'), token);
    if (id) c.set('user', await loadUser(c.get('sql'), id));
  }
  await next();
};

export function requireUser(c: Context<AppEnv>): User {
  const u = c.get('user');
  if (!u) throw new HTTPException(401, { message: 'Entre para continuar.' });
  return u;
}

export function requireRole(c: Context<AppEnv>, roles: Array<User['role']>): User {
  const u = requireUser(c);
  if (!roles.includes(u.role)) throw new HTTPException(403, { message: 'Sem permissão.' });
  return u;
}

/** Hash de IP e de dispositivo (id aleatório gerado pelo navegador), usados só para detectar conluio. */
export function signalsOf(c: Context<AppEnv>): { ipHash: string; deviceHash: string } {
  const cfg = c.get('config');
  let ip = '';
  if (cfg.trustProxy) ip = (c.req.header('x-forwarded-for') ?? '').split(',')[0]!.trim();
  if (!ip) {
    try { ip = getConnInfo(c).remote.address ?? ''; } catch { ip = ''; }
  }
  const device = c.req.header('x-garimpa-device') ?? '';
  // Sem IP ou sem id de dispositivo fica vazio: vazio nunca casa com vazio na detecção de conluio.
  const h = (v: string) => (v ? createHash('sha256').update(cfg.SESSION_SECRET + '|' + v).digest('hex').slice(0, 32) : '');
  return { ipHash: h(ip), deviceHash: h(device) };
}

export async function recordSignal(c: Context<AppEnv>, userId: string) {
  const { ipHash, deviceHash } = signalsOf(c);
  await c.get('sql')`
    insert into user_signals(user_id, ip_hash, device_hash) values (${userId}::uuid, ${ipHash}, ${deviceHash})
    on conflict (user_id, ip_hash, device_hash) do update set last_seen = now(), hits = user_signals.hits + 1`;
}

export type Collusion = { strong: boolean; weak: boolean };

/** Conluio: mesmo dispositivo (forte: não cunha pepitas) ou mesmo IP nas últimas 24 h (fraco: carência de 14 dias). */
export async function collusionBetween(db: Sql | Tx, a: string, b: string): Promise<Collusion> {
  if (a === b) return { strong: true, weak: true };
  const rows = await db<{ strong: boolean; weak: boolean }[]>`
    select
      exists (select 1 from user_signals x join user_signals y on x.device_hash = y.device_hash
              where x.user_id = ${a}::uuid and y.user_id = ${b}::uuid and x.device_hash <> '') as strong,
      exists (select 1 from user_signals x join user_signals y on x.ip_hash = y.ip_hash
              where x.user_id = ${a}::uuid and y.user_id = ${b}::uuid and x.ip_hash <> ''
                and x.last_seen > now() - interval '24 hours' and y.last_seen > now() - interval '24 hours') as weak`;
  return rows[0] ?? { strong: false, weak: false };
}
