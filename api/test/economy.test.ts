import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { makeApp, login, uniq } from './helpers.js';
import { award, levelFor, takeCap } from '../src/economy.js';
import type { App } from '../src/app.js';
import type { Sql } from '../src/db.js';

let app: App; let sql: Sql; let close: () => Promise<void>;
beforeAll(async () => { ({ app, sql, close } = await makeApp()); });
afterAll(async () => { await close(); });

describe('níveis', () => {
  it('sobe de Peneira a Lenda com progresso entre 0 e 1', () => {
    expect(levelFor(0).name).toBe('Peneira');
    expect(levelFor(150).name).toBe('Bateia');
    expect(levelFor(150).progress).toBeCloseTo(0.25);
    expect(levelFor(99999).name).toBe('Guardião do mapa');
    expect(levelFor(99999).next).toBeNull();
  });
});

describe('livro-razão', () => {
  it('pepitas entram em carência e XP é imediato', async () => {
    const s = await login(app, uniq('eco'));
    await award(sql, s.user.id, 'resposta_aceita', 50, 50, { type: 'resposta', id: s.user.id });
    const u = (await sql`select xp, credits, credits_pending from users where id = ${s.user.id}::uuid`)[0]!;
    expect(u.xp).toBe(50 + 20); // 20 do badge fundador
    expect(u.credits).toBe(0);
    expect(u.creditsPending).toBe(50);
  });
  it('carência vencida libera o saldo (fn_vest_due)', async () => {
    const s = await login(app, uniq('eco'));
    const id = await award(sql, s.user.id, 'resposta_aceita', 0, 30, { type: 'resposta', id: s.user.id });
    await sql`update ledger set vests_at = now() - interval '1 minute' where id = ${id}`;
    await sql`select fn_vest_due()`;
    const u = (await sql`select credits, credits_pending from users where id = ${s.user.id}::uuid`)[0]!;
    expect(u.credits).toBe(30);
    expect(u.creditsPending).toBe(0);
  });
  it('estorno devolve o que foi cunhado e não estorna duas vezes', async () => {
    const s = await login(app, uniq('eco'));
    const id = await award(sql, s.user.id, 'resposta_aceita', 40, 40, { type: 'resposta', id: s.user.id });
    const r1 = await sql`select fn_reverse(${id}::bigint, 'teste') as id`;
    const r2 = await sql`select fn_reverse(${id}::bigint, 'teste') as id`;
    expect(r1[0]!.id).not.toBeNull();
    expect(r2[0]!.id).toBeNull();
    const u = (await sql`select xp, credits_pending from users where id = ${s.user.id}::uuid`)[0]!;
    expect(u.creditsPending).toBe(0);
    expect(u.xp).toBe(20);
  });
  it('sequência diária premia uma vez por dia, não a cada acesso', async () => {
    const s = await login(app, uniq('eco'));
    await sql`update users set last_active_on = (now() at time zone 'America/Porto_Velho')::date - 1, streak_days = 4 where id = ${s.user.id}::uuid`;
    const r1 = await app.request('/api/me', { headers: { cookie: s.cookie } });
    const r2 = await app.request('/api/me', { headers: { cookie: s.cookie } });
    const r3 = await app.request('/api/me', { headers: { cookie: s.cookie } });
    expect([r1.status, r2.status, r3.status]).toEqual([200, 200, 200]);
    const bonus = await sql`select count(*)::int as n, coalesce(sum(xp), 0)::int as xp from ledger where user_id = ${s.user.id}::uuid and kind = 'bonus_streak'`;
    expect(bonus[0]!.n).toBe(1);
    expect(bonus[0]!.xp).toBe(8); // 2 XP × 4 dias anteriores
    const u = (await sql`select streak_days from users where id = ${s.user.id}::uuid`)[0]!;
    expect(u.streakDays).toBe(5);
  });
  it('não deixa transferir mais do que o saldo', async () => {
    const s = await login(app, uniq('eco'));
    await expect(award(sql, s.user.id, 'gorjeta_enviada', 0, -10)).rejects.toThrow(/saldo insuficiente/);
  });
  it('limite diário é atômico e recusa a partir do teto', async () => {
    const s = await login(app, uniq('eco'));
    const results = await Promise.all(Array.from({ length: 5 }, () => takeCap(sql, s.user.id, 'teste', 3)));
    expect(results.filter(Boolean)).toHaveLength(3);
  });
});
