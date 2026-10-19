import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { App } from '../src/app.js';
import { bboxSql, parseBbox, pointSql } from '../src/geo.js';
import { api, login, makeApp, type Session, testImage, uniq, upload } from './helpers.js';

let app: App;
let sql: Awaited<ReturnType<typeof makeApp>>['sql'];
let close: () => Promise<void>;
beforeAll(async () => {
  ({ app, sql, close } = await makeApp());
});
afterAll(async () => {
  await close();
});

// Centro da cidade. Em Ariquemes, 0,009° de latitude ≈ 1.000 m e 0,009° de longitude ≈ 986 m.
const C = { lat: -9.9075, lng: -63.0415 };

function postPlace(s: Session, name: string, dlat = 0, dlng = 0) {
  return api(app, 'POST', '/api/places', {
    session: s,
    body: { name, lat: C.lat + dlat, lng: C.lng + dlng, kind: 'loja' },
  });
}

async function newQuestion(s: Session, title: string, pos?: { dlat: number; dlng: number }) {
  const r = await api(app, 'POST', '/api/questions', {
    session: s,
    body: {
      title,
      category: 'casa',
      force: true, // títulos parecidos entre os testes não devem ser barrados como duplicata
      ...(pos ? { lat: C.lat + pos.dlat, lng: C.lng + pos.dlng } : {}),
    },
  });
  expect(r.status).toBe(201);
  return r.json.id as string;
}

describe('consultas geográficas', () => {
  it('recusa lugar fora da área da cidade', async () => {
    const s = await login(app, uniq('Geo'));
    const fora = await postPlace(s, `Loja longe ${uniq('g')}`, 0.2);
    expect(fora.status).toBe(400);
    const dentro = await postPlace(s, `Loja perto ${uniq('g')}`, 0.01);
    expect(dentro.status).toBe(201);
  });

  it('reaproveita lugar com o mesmo nome a menos de 150 m', async () => {
    const s = await login(app, uniq('Geo'));
    const nome = `Loja repetida ${uniq('g')}`;
    const a = await postPlace(s, nome);
    expect(a.status).toBe(201);
    expect(a.json.created).toBe(true);
    const perto = await postPlace(s, nome, 0.0009); // ≈ 100 m
    expect(perto.json.created).toBe(false);
    expect(perto.json.place.id).toBe(a.json.place.id);
    const longe = await postPlace(s, nome, 0.0027); // ≈ 300 m
    expect(longe.json.created).toBe(true);
    expect(longe.json.place.id).not.toBe(a.json.place.id);
  });

  it('distância em metros respeita latitude e longitude', async () => {
    const s = await login(app, uniq('Geo'));
    const tag = uniq('dist');
    // Mesmo nome nos dois: a similaridade empata e a ordem passa a depender só da distância.
    const norte = await postPlace(s, `Loja ${tag}`, 0.009, 0);
    const leste = await postPlace(s, `Loja ${tag}`, 0, 0.018);
    expect(norte.status).toBe(201);
    expect(leste.status).toBe(201);
    const r = await api(app, 'GET', `/api/places?q=${tag}&lat=${C.lat}&lng=${C.lng}`);
    expect(r.status).toBe(200);
    const items = r.json.items as { id: string; distanceM: number }[];
    const iN = items.findIndex((i) => i.id === norte.json.place.id);
    const iL = items.findIndex((i) => i.id === leste.json.place.id);
    expect(iN).toBeGreaterThanOrEqual(0);
    expect(iL).toBeGreaterThanOrEqual(0);
    expect(items[iN]!.distanceM).toBeGreaterThanOrEqual(990);
    expect(items[iN]!.distanceM).toBeLessThanOrEqual(1010);
    expect(items[iL]!.distanceM).toBeGreaterThanOrEqual(1950);
    expect(items[iL]!.distanceM).toBeLessThanOrEqual(1995);
    expect(iN).toBeLessThan(iL);
  });

  it('pinos do mapa filtram pela área visível', async () => {
    const marina = await login(app, uniq('Marina'));
    const joao = await login(app, uniq('Joao'));
    const tag = uniq('mapa');
    const qid = (
      await api(app, 'POST', '/api/questions', {
        session: marina,
        body: { title: `Tomada tripla com adaptador ${tag}`, category: 'casa', lat: C.lat, lng: C.lng },
      })
    ).json.id as string;
    const place = await postPlace(joao, `Casa Elétrica ${tag}`, 0.005, 0);
    expect(place.status).toBe(201);
    const placeId = place.json.place.id as string;
    const up = await upload(app, joao, await testImage(83), { lat: String(C.lat + 0.005), lng: String(C.lng) });
    expect(up.status).toBe(201);
    const ans = await api(app, 'POST', `/api/questions/${qid}/answers`, {
      session: joao,
      body: { placeId, note: 'Balcão do fundo, ao lado do caixa.', priceCents: 1990, evidenceIds: [up.json.id] },
    });
    expect(ans.status).toBe(201);
    const acc = await api(app, 'POST', `/api/questions/${qid}/accept`, {
      session: marina,
      body: { answerId: ans.json.answerId },
    });
    expect(acc.status).toBe(200);

    const ids = async (qs: string) => {
      const r = await api(app, 'GET', `/api/map/finds${qs}`);
      expect(r.status).toBe(200);
      return (r.json.items as { placeId: string }[]).map((i) => i.placeId);
    };
    const bbox = (w: number, s: number, e: number, n: number) => `?bbox=${w},${s},${e},${n}`;
    expect(await ids(bbox(C.lng - 0.01, C.lat, C.lng + 0.01, C.lat + 0.01))).toContain(placeId);
    expect(await ids(bbox(C.lng + 0.02, C.lat, C.lng + 0.04, C.lat + 0.01))).not.toContain(placeId);
    expect(await ids('')).toContain(placeId);
    expect(await ids('?bbox=abc')).toContain(placeId);
    // Leaflet não limita a longitude: com zoom baixo a área passa de 180 graus e não pode excluir os pinos.
    expect(await ids(bbox(-231, -60, 106, 60))).toContain(placeId);
  });

  it('missões abertas filtram pela área visível', async () => {
    const s = await login(app, uniq('Geo'));
    const id = await newQuestion(s, `Missão aberta no mapa ${uniq('m')}`, { dlat: 0, dlng: 0 });
    const open = async (w: number, so: number, e: number, n: number) => {
      const r = await api(app, 'GET', `/api/map/open?bbox=${w},${so},${e},${n}`);
      expect(r.status).toBe(200);
      return (r.json.items as { id: string }[]).map((i) => i.id);
    };
    expect(await open(C.lng - 0.01, C.lat - 0.01, C.lng + 0.01, C.lat + 0.01)).toContain(id);
    expect(await open(C.lng + 0.02, C.lat - 0.01, C.lng + 0.04, C.lat + 0.01)).not.toContain(id);
  });

  it('missões mais perto primeiro, sem posição no fim', async () => {
    const s = await login(app, uniq('Geo'));
    const tag = uniq('perto');
    // A posição gravada é aproximada em até ~200 m; as distâncias escolhidas mantêm a ordem.
    const longe = await newQuestion(s, `Missão longe ${tag}`, { dlat: 0.045, dlng: 0 }); // ≈ 5 km
    const sem = await newQuestion(s, `Missão sem posição ${tag}`);
    const perto = await newQuestion(s, `Missão perto ${tag}`, { dlat: 0.0018, dlng: 0 }); // ≈ 200 m
    const mine = new Set([perto, longe, sem]);
    // A lista é paginada (20 por vez) e outros testes também criam missões: percorre até achar as três.
    const found: { id: string; distanceM: number | null }[] = [];
    let offset: number | null = 0;
    while (offset !== null && found.length < 3) {
      const r = await api(
        app,
        'GET',
        `/api/questions?sort=perto&lat=${C.lat}&lng=${C.lng}&status=abertas&offset=${offset}`,
      );
      expect(r.status).toBe(200);
      for (const i of r.json.items) if (mine.has(i.id)) found.push(i);
      offset = r.json.nextOffset;
    }
    expect(found.map((i) => i.id)).toEqual([perto, longe, sem]);
    expect(found[2]!.distanceM).toBeNull();
  });

  it('places e questions têm coluna geog indexada', async () => {
    const cols = await sql`
      select table_name, udt_name from information_schema.columns
      where column_name = 'geog' and table_name in ('places', 'questions')`;
    expect(cols.map((c) => `${c.tableName}:${c.udtName}`).sort()).toEqual(['places:geography', 'questions:geography']);
    const idx =
      await sql`select indexname from pg_indexes where indexname in ('places_geog_idx', 'questions_geog_idx')`;
    expect(idx.map((i) => i.indexname).sort()).toEqual(['places_geog_idx', 'questions_geog_idx']);
  });

  it('earthdistance e cube não estão mais instalados', async () => {
    const exts = await sql`select extname from pg_extension`;
    const names = exts.map((e) => e.extname);
    expect(names).not.toContain('earthdistance');
    expect(names).not.toContain('cube');
  });

  it('consulta de área usa o índice', async () => {
    const plan = await sql.begin(async (tx) => {
      await tx`set local enable_seqscan = off`;
      const rows = await tx`
        explain select id from places
        where geog && ST_MakeEnvelope(-63.1, -10, -63, -9.8, 4326)::geography`;
      return rows.map((r) => r['QUERY PLAN']).join('\n');
    });
    expect(plan).toContain('places_geog_idx');
  });

  it('as respostas da API não expõem geog', async () => {
    const marina = await login(app, uniq('Marina'));
    const joao = await login(app, uniq('Joao'));
    const tag = uniq('semgeog');
    const qid = await newQuestion(marina, `Fita isolante azul ${tag}`, { dlat: 0, dlng: 0 });
    const place = await postPlace(joao, `Loja Sem Geog ${tag}`, 0.004, 0);
    expect(place.status).toBe(201);
    const placeId = place.json.place.id as string;
    const up = await upload(app, joao, await testImage(84), { lat: String(C.lat + 0.004), lng: String(C.lng) });
    expect(up.status).toBe(201);
    const ans = await api(app, 'POST', `/api/questions/${qid}/answers`, {
      session: joao,
      body: { placeId, note: 'Prateleira de baixo, perto da porta.', priceCents: 990, evidenceIds: [up.json.id] },
    });
    expect(ans.status).toBe(201);
    const acc = await api(app, 'POST', `/api/questions/${qid}/accept`, {
      session: marina,
      body: { answerId: ans.json.answerId },
    });
    expect(acc.status).toBe(200);

    const finds = await api(app, 'GET', '/api/map/finds');
    expect(finds.status).toBe(200);
    const items = finds.json.items as Record<string, unknown>[];
    expect(items.some((i) => i.placeId === placeId)).toBe(true);
    for (const i of items) expect(i).not.toHaveProperty('geog');

    const q = await api(app, 'GET', `/api/questions/${qid}`);
    expect(q.status).toBe(200);
    expect(q.json.question).not.toHaveProperty('geog');
  });
});

describe('parseBbox', () => {
  it('lê quatro números', () => {
    expect(parseBbox('-63.1,-10,-63,-9.8')).toEqual([-63.1, -10, -63, -9.8]);
  });
  it('devolve null quando inválido', () => {
    for (const raw of [undefined, '', 'abc', '1,2,3', '1,2,3,x']) expect(parseBbox(raw)).toBeNull();
  });
  it('ignora áreas que o geography interpretaria pelo caminho curto', () => {
    for (const raw of ['-231,-60,106,60', '-200,-10,-60,-9', '10,0,5,1', '-180,-10,0,10']) {
      expect(parseBbox(raw)).toBeNull();
    }
  });
  it('limita a latitude a ±90', () => {
    expect(parseBbox('-63.1,-95,-63,95')).toEqual([-63.1, -90, -63, 90]);
  });
});

describe('fragmentos SQL', () => {
  it('bboxSql renderiza o identificador e sem caixa vira vazio', async () => {
    const [{ ok }] = await sql<{ ok: boolean }[]>`
      select true as ok from places pl where true ${bboxSql(sql, 'pl.geog', null)} limit 1`;
    expect(ok).toBe(true);
    await sql`select 1 from places pl where true ${bboxSql(sql, 'pl.geog', [-63.1, -10, -63, -9.8])}`;
    const [{ x, y }] = await sql<{ x: number; y: number }[]>`
      select ST_X(${pointSql(sql, -9.9, -63)}::geometry) as x, ST_Y(${pointSql(sql, -9.9, -63)}::geometry) as y`;
    expect([x, y]).toEqual([-63, -9.9]);
  });
});
