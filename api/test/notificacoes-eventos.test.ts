import sharp from 'sharp';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { App } from '../src/app.js';
import type { Sql } from '../src/db.js';
import { api, login, makeApp, type Session, uniq, upload } from './helpers.js';

let app: App;
let sql: Sql;
let close: () => Promise<void>;
beforeAll(async () => {
  ({ app, sql, close } = await makeApp());
});
afterAll(async () => {
  await close();
});

const C = { lat: -9.9075, lng: -63.0415 };

// Imagem de blocos aleatórios: o dhash varia de verdade, então não colide com as fotos de outros arquivos de teste
// (que compartilham o banco e barram foto repetida ou parecida).
async function foto(): Promise<Buffer> {
  const px = Buffer.alloc(9 * 9 * 3);
  for (let i = 0; i < px.length; i++) px[i] = Math.floor(Math.random() * 256);
  return sharp(px, { raw: { width: 9, height: 9, channels: 3 } })
    .resize(256, 256, { kernel: 'nearest' })
    .png()
    .toBuffer();
}

type Row = { userId: string; kind: string; title: string; body: string; url: string; topic: string; refType: string };

async function avisos(userId: string, kind?: string) {
  return sql<Row[]>`
    select user_id, kind, title, body, url, topic, ref_type from notifications
    where user_id = ${userId}::uuid and (${kind ?? null}::text is null or kind = ${kind ?? null}) order by id`;
}

async function totalAvisos() {
  return (await sql<{ n: number }[]>`select count(*)::int as n from notifications`)[0]!.n;
}

async function missao(autor: Session, tag: string) {
  const q = await api(app, 'POST', '/api/questions', {
    session: autor,
    body: { title: `Pilha recarregável tamanho médio ${tag}`, category: 'casa', lat: C.lat, lng: C.lng, force: true },
  });
  expect(q.status).toBe(201);
  return q.json.id as string;
}

async function lugar(s: Session, name: string) {
  const r = await api(app, 'POST', '/api/places', {
    session: s,
    body: { name, lat: C.lat + 0.002, lng: C.lng, kind: 'loja' },
  });
  return r.json.place.id as string;
}

async function responde(s: Session, qid: string, placeId: string) {
  const up = await upload(app, s, await foto(), { lat: String(C.lat + 0.002), lng: String(C.lng) });
  expect(up.status, JSON.stringify(up.json)).toBe(201);
  return api(app, 'POST', `/api/questions/${qid}/answers`, {
    session: s,
    body: { placeId, evidenceIds: [up.json.id] },
  });
}

const confirma = (s: Session, answerId: string, vote = 1) =>
  api(app, 'POST', `/api/answers/${answerId}/confirm`, { session: s, body: { vote } });

describe('avisos nas escritas', () => {
  it('nova evidência avisa autor e seguidores, não quem respondeu', async () => {
    const [a, b, c] = [await login(app, uniq('A')), await login(app, uniq('B')), await login(app, uniq('C'))];
    const tag = uniq('n');
    const qid = await missao(a, tag);
    expect((await api(app, 'POST', `/api/questions/${qid}/follow`, { session: b })).status).toBe(200);
    const nome = `Mercado ${tag}`;
    const r = await responde(c, qid, await lugar(c, nome));
    expect(r.status).toBe(201);
    for (const s of [a, b]) {
      const rows = await avisos(s.user.id, 'nova_evidencia');
      expect(rows).toHaveLength(1);
      expect(rows[0]).toMatchObject({ url: `/m/${qid}`, topic: `missao-${qid}`, refType: 'resposta' });
      expect(rows[0]!.body).toContain(nome);
    }
    expect(await avisos(c.user.id)).toHaveLength(0);
  });

  it('quem segue e responde não é avisado da própria resposta', async () => {
    const [a, b] = [await login(app, uniq('A')), await login(app, uniq('B'))];
    const tag = uniq('s');
    const qid = await missao(a, tag);
    await api(app, 'POST', `/api/questions/${qid}/follow`, { session: b });
    expect((await responde(b, qid, await lugar(b, `Loja ${tag}`))).status).toBe(201);
    expect(await avisos(b.user.id)).toHaveLength(0);
    expect(await avisos(a.user.id, 'nova_evidencia')).toHaveLength(1);
  });

  it('confirmação avisa só na transição para confirmada', async () => {
    const [a, b, v1, v2, v3] = await Promise.all(['A', 'B', 'V1', 'V2', 'V3'].map((n) => login(app, uniq(n))));
    const tag = uniq('c');
    const qid = await missao(a!, tag);
    const ans = await responde(b!, qid, await lugar(b!, `Loja ${tag}`));
    const id = ans.json.answerId as string;
    await confirma(v1!, id);
    expect(await avisos(b!.user.id, 'evidencia_confirmada')).toHaveLength(0);
    expect((await confirma(v2!, id)).json.status).toBe('confirmada');
    const rows = await avisos(b!.user.id, 'evidencia_confirmada');
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ url: `/m/${qid}`, topic: `missao-${qid}`, refType: 'resposta' });
    expect(rows[0]!.body).toContain(`Loja ${tag}`);
    await confirma(v3!, id);
    expect(await avisos(b!.user.id, 'evidencia_confirmada')).toHaveLength(1);
  });

  it('aceite avisa o autor da evidência com as pepitas', async () => {
    const [a, b, c] = [await login(app, uniq('A')), await login(app, uniq('B')), await login(app, uniq('C'))];
    const tag = uniq('a');
    const qid = await missao(a, tag);
    const ans = await responde(b, qid, await lugar(b, `Loja ${tag}`));
    const acc = await api(app, 'POST', `/api/questions/${qid}/accept`, {
      session: a,
      body: { answerId: ans.json.answerId },
    });
    expect(acc.status).toBe(200);
    const rows = await avisos(b.user.id, 'evidencia_aceita');
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ url: `/m/${qid}`, topic: `missao-${qid}`, refType: 'resposta' });
    expect(acc.json.credits, JSON.stringify(acc.json)).toBeGreaterThan(0);
    // O aviso soma o que o autor ganhou de verdade: aceite mais primeiro achado (dois lançamentos no livro-razão).
    expect(acc.json.primeiroAchado, JSON.stringify(acc.json)).toBeGreaterThan(0);
    const total = (
      await sql<{ s: number }[]>`
        select coalesce(sum(credits), 0)::int as s from ledger
        where user_id = ${b.user.id}::uuid and ref_type = 'resposta' and ref_id = ${ans.json.answerId as string}::uuid
          and kind in ('resposta_aceita', 'primeiro_achado')`
    )[0]!.s;
    expect(total).toBe(acc.json.credits + acc.json.primeiroAchado);
    expect(rows[0]!.body).toContain(`(+${total} pepitas)`);

    // Sem pepitas (mesmo aparelho do autor da missão): o texto omite o parêntese.
    const device = uniq('cel');
    const [d, e] = [await login(app, uniq('D'), device), await login(app, uniq('E'), device)];
    const qid2 = await missao(d, uniq('z'));
    const ans2 = await responde(e, qid2, await lugar(e, `Loja ${tag}b`));
    const acc2 = await api(app, 'POST', `/api/questions/${qid2}/accept`, {
      session: d,
      body: { answerId: ans2.json.answerId },
    });
    expect(acc2.json.credits).toBe(0);
    const rows2 = await avisos(e.user.id, 'evidencia_aceita');
    expect(rows2).toHaveLength(1);
    expect(rows2[0]!.body).not.toContain('(');
    expect(c).toBeDefined();
  });

  it('gorjeta avisa quem recebeu', async () => {
    const [a, b] = [await login(app, uniq('A')), await login(app, uniq('B'))];
    const tag = uniq('g');
    const qid = await missao(a, tag);
    const ans = await responde(b, qid, await lugar(b, `Loja ${tag}`));
    const tip = await api(app, 'POST', `/api/answers/${ans.json.answerId}/tip`, {
      session: a,
      body: { amount: 20, source: 'orcamento' },
    });
    expect(tip.status).toBe(201);
    const rows = await avisos(b.user.id, 'gorjeta_recebida');
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ refType: 'gorjeta', url: `/m/${qid}`, topic: `missao-${qid}` });
    expect(rows[0]!.body).toBe(`${a.user.name} agradeceu com 20 pepitas`);
    const ref =
      await sql`select 1 from notifications where ref_id = ${tip.json.tipId}::uuid and kind = 'gorjeta_recebida'`;
    expect(ref).toHaveLength(1);
  });

  it('escrita recusada não grava aviso', async () => {
    const [a, b, c] = [await login(app, uniq('A')), await login(app, uniq('B')), await login(app, uniq('C'))];
    const tag = uniq('r');
    const qid = await missao(a, tag);
    const place = await lugar(b, `Loja ${tag}`);
    const note = 'Fica no corredor dois, ao lado do caixa, prateleira de baixo com preço na etiqueta.';
    const up1 = await upload(app, b, await foto());
    const ok = await api(app, 'POST', `/api/questions/${qid}/answers`, {
      session: b,
      body: { placeId: place, note, evidenceIds: [up1.json.id] },
    });
    expect(ok.status).toBe(201);
    const antes = await totalAvisos();
    const up2 = await upload(app, c, await foto());
    const dup = await api(app, 'POST', `/api/questions/${qid}/answers`, {
      session: c,
      body: { placeId: place, note, evidenceIds: [up2.json.id] },
    });
    expect(dup.status).toBe(409);
    expect((await confirma(b, ok.json.answerId)).status).toBe(400);
    expect(await totalAvisos()).toBe(antes);
  });

  it('conta removida não recebe aviso', async () => {
    const [a, b, c] = [await login(app, uniq('A')), await login(app, uniq('B')), await login(app, uniq('C'))];
    const tag = uniq('d');
    const qid = await missao(a, tag);
    await api(app, 'POST', `/api/questions/${qid}/follow`, { session: b });
    expect((await api(app, 'DELETE', '/api/auth/account', { session: b })).status).toBe(200);
    expect((await responde(c, qid, await lugar(c, `Loja ${tag}`))).status).toBe(201);
    expect(await avisos(b.user.id)).toHaveLength(0);
    expect(await avisos(a.user.id, 'nova_evidencia')).toHaveLength(1);
  });
});
