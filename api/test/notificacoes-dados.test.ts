import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { App } from '../src/app.js';
import type { Sql } from '../src/db.js';
import { award } from '../src/economy.js';
import { notify } from '../src/notifications/store.js';
import * as texts from '../src/notifications/texts.js';
import { login, makeApp, uniq } from './helpers.js';

let app: App;
let sql: Sql;
let close: () => Promise<void>;
beforeAll(async () => {
  ({ app, sql, close } = await makeApp());
});
afterAll(async () => {
  await close();
});

describe('textos', () => {
  it('textos têm os modelos da spec', () => {
    expect(texts.novaEvidencia('Garrafa térmica azul', 'Loja X')).toEqual({
      title: 'Nova pista para Garrafa térmica azul',
      body: 'Loja X',
    });
    expect(texts.evidenciaConfirmada('Loja X')).toEqual({ title: 'Sua pista foi confirmada', body: 'Loja X' });
    expect(texts.evidenciaAceita('Loja X', 60)).toEqual({
      title: 'Foi aqui que encontrei!',
      body: 'Sua pista em Loja X foi escolhida (+60 pepitas)',
    });
    expect(texts.evidenciaAceita('Loja X', 0).body).toBe('Sua pista em Loja X foi escolhida');
    expect(texts.gorjetaRecebida('Marina', 20)).toEqual({
      title: 'Agradecimento',
      body: 'Marina agradeceu com 20 pepitas',
    });
    expect(texts.pepitasLiberadas(120)).toEqual({
      title: 'Pepitas liberadas',
      body: '120 pepitas liberadas na sua carteira',
    });
  });

  it('textos longos são truncados', () => {
    const t = texts.novaEvidencia('M'.repeat(300), 'L'.repeat(300));
    expect(t.title.length).toBe(80);
    expect(t.title.endsWith('…')).toBe(true);
    expect(t.body.length).toBe(160);
    expect(t.body.endsWith('…')).toBe(true);
  });
});

describe('notify', () => {
  it('notify grava em lote e ignora contas removidas', async () => {
    const a = await login(app, uniq('not'));
    const b = await login(app, uniq('not'));
    await sql`update users set banned_at = now() where id = ${b.user.id}::uuid`;
    const base = {
      kind: 'gorjeta_recebida' as const,
      title: 'T',
      body: 'B',
      url: '/carteira',
      topic: null,
      refType: 'gorjeta',
      refId: null,
    };
    await notify(sql, [
      { ...base, userId: a.user.id },
      { ...base, userId: b.user.id },
    ]);
    await notify(sql, []);
    const rows =
      await sql`select user_id, push_state, read_at from notifications where user_id in (${a.user.id}::uuid, ${b.user.id}::uuid)`;
    expect(rows).toHaveLength(1);
    expect(rows[0]!.userId).toBe(a.user.id);
    expect(rows[0]!.pushState).toBe('pendente');
    expect(rows[0]!.readAt).toBeNull();
  });
});

describe('fn_vest_due', () => {
  async function due(userId: string, credits: number) {
    const id = await award(sql, userId, 'resposta_aceita', 0, credits, { type: 'resposta', id: userId });
    await sql`update ledger set vests_at = now() - interval '1 minute' where id = ${id}`;
  }

  it('fn_vest_due avisa uma vez por pessoa com a soma', async () => {
    await sql`select fn_vest_due()`; // zera sobras de outros testes para a contagem ser exata
    const a = await login(app, uniq('vest'));
    const b = await login(app, uniq('vest'));
    await due(a.user.id, 30);
    await due(a.user.id, 90);
    await due(b.user.id, 50);
    const [r] = await sql`select fn_vest_due() as n`;
    expect(r!.n).toBe(3);
    const na = await sql`select * from notifications where user_id = ${a.user.id}::uuid and kind = 'pepitas_liberadas'`;
    expect(na).toHaveLength(1);
    const esperado = texts.pepitasLiberadas(120);
    expect(na[0]!.title).toBe(esperado.title);
    expect(na[0]!.body).toBe(esperado.body);
    expect(na[0]!.url).toBe('/carteira');
    expect(na[0]!.topic).toBe('pepitas');
    expect(na[0]!.refType).toBe('ledger');
    expect(na[0]!.refId).toBeNull();
    const nb =
      await sql`select body from notifications where user_id = ${b.user.id}::uuid and kind = 'pepitas_liberadas'`;
    expect(nb).toHaveLength(1);
    expect(nb[0]!.body).toBe(texts.pepitasLiberadas(50).body);
  });

  it('fn_vest_due sem nada a liberar não avisa', async () => {
    await sql`select fn_vest_due()`;
    const a = await login(app, uniq('vest'));
    await award(sql, a.user.id, 'resposta_aceita', 0, 30, { type: 'resposta', id: a.user.id }); // carência ainda correndo
    const [r] = await sql`select fn_vest_due() as n`;
    expect(r!.n).toBe(0);
    const n = await sql`select 1 from notifications where user_id = ${a.user.id}::uuid`;
    expect(n).toHaveLength(0);
  });
});
