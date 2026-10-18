import { afterAll, describe, expect, it } from 'vitest';
import { award } from '../src/economy.js';
import { api, login, makeApp, type Session, testImage, uniq, upload } from './helpers.js';

// Requisito 1 da spec do cache: toda escrita invalida, na hora, as leituras que ela afeta. Cada linha aquece uma
// leitura até HIT, faz a escrita e exige MISS com o dado novo na leitura seguinte.

const ctx = await makeApp();
const { app, sql } = ctx;
afterAll(() => ctx.close());

const C = { lat: -9.9075, lng: -63.0415 };
const BBOX = `${C.lng - 0.05},${C.lat - 0.05},${C.lng + 0.05},${C.lat + 0.05}`;
let seed = 500;

async function get(url: string, session?: Session) {
  const headers: Record<string, string> = { 'x-garimpa-device': session?.device ?? 'dev-anonimo' };
  if (session) headers.cookie = session.cookie;
  const res = await app.request(url, { headers });
  expect(res.status).toBe(200);
  return { xcache: res.headers.get('x-cache'), json: (await res.json()) as any };
}

/** Lê até HIT (no máximo três vezes) e devolve o corpo em cache. */
async function warm(url: string, session?: Session) {
  for (let i = 0; i < 3; i++) {
    const r = await get(url, session);
    if (r.xcache === 'HIT') return r.json;
  }
  throw new Error(`${url} não chegou a HIT`);
}

async function ok(p: Promise<{ status: number; json: any }>, status = [200, 201]) {
  const r = await p;
  expect(status, JSON.stringify(r.json)).toContain(r.status);
  return r.json;
}

const question = async (s: Session, extra: Record<string, unknown> = {}) =>
  (
    await ok(
      api(app, 'POST', '/api/questions', {
        session: s,
        body: { title: uniq('Rolamento de bicicleta'), category: 'esporte', force: true, ...extra },
      }),
    )
  ).id as string;

const place = async (s: Session, name = uniq('Bicicletaria')) =>
  (await ok(api(app, 'POST', '/api/places', { session: s, body: { name, lat: C.lat + 0.001, lng: C.lng } }))).place
    .id as string;

const evidence = async (s: Session) => (await ok(upload(app, s, await testImage(seed++)))).id as string;

const answer = async (s: Session, qid: string, pid: string) =>
  (
    await ok(
      api(app, 'POST', `/api/questions/${qid}/answers`, {
        session: s,
        body: { placeId: pid, evidenceIds: [await evidence(s)] },
      }),
    )
  ).answerId as string;

const confirm = (s: Session, aid: string) =>
  ok(api(app, 'POST', `/api/answers/${aid}/confirm`, { session: s, body: { vote: 1 } }));

/** Missão de A com resposta pendente de B num lugar já existente. */
async function scenario() {
  const asker = await login(app, uniq('Autora'));
  const helper = await login(app, uniq('Ajudante'));
  const qid = await question(asker, { lat: C.lat, lng: C.lng });
  const pid = await place(helper);
  const aid = await answer(helper, qid, pid);
  return { asker, helper, qid, pid, aid };
}

/** XP alto na semana para a pessoa aparecer entre as 50 do ranking, que acumula contas de todos os testes. */
const boost = (s: Session) => award(sql, s.user.id, 'ajuste', 5000, 0);
const pontos = (rank: any, userId: string) => rank.items.find((r: any) => r.id === userId)?.pontos ?? 0;
const RANK = '/api/ranking?period=semana';

type Row = {
  name: string;
  run: () => Promise<{
    url: string;
    session?: Session;
    write: () => Promise<unknown>;
    check: (before: any, after: any) => void;
  }>;
};

const rows: Row[] = [
  {
    name: 'POST /questions invalida GET /questions',
    run: async () => {
      const s = await login(app, uniq('Ana'));
      let id = '';
      return {
        url: '/api/questions?status=todas',
        write: async () => {
          id = await question(s);
        },
        check: (_b, a) => expect(a.items.map((i: any) => i.id)).toContain(id),
      };
    },
  },
  {
    name: 'POST /questions invalida GET /map/open',
    run: async () => {
      const s = await login(app, uniq('Ana'));
      let id = '';
      return {
        url: `/api/map/open?bbox=${BBOX}`,
        write: async () => {
          id = await question(s, { lat: C.lat, lng: C.lng });
        },
        check: (_b, a) => expect(a.items.map((i: any) => i.id)).toContain(id),
      };
    },
  },
  {
    name: 'POST /questions invalida GET /ranking',
    run: async () => {
      const s = await login(app, uniq('Ana'));
      await boost(s);
      return {
        url: RANK,
        write: () => question(s),
        check: (b, a) => expect(pontos(a, s.user.id)).toBeGreaterThan(pontos(b, s.user.id)),
      };
    },
  },
  {
    name: 'POST /questions/:id/close invalida GET /questions/:id',
    run: async () => {
      const s = await login(app, uniq('Ana'));
      const qid = await question(s);
      return {
        url: `/api/questions/${qid}`,
        write: () => ok(api(app, 'POST', `/api/questions/${qid}/close`, { session: s })),
        check: (b, a) => {
          expect(b.question.status).toBe('aberta');
          expect(a.question.status).toBe('fechada');
        },
      };
    },
  },
  {
    name: 'POST /questions/:id/follow invalida GET /questions/:id',
    run: async () => {
      const s = await login(app, uniq('Ana'));
      const f = await login(app, uniq('Beto'));
      const qid = await question(s);
      return {
        url: `/api/questions/${qid}`,
        write: () => ok(api(app, 'POST', `/api/questions/${qid}/follow`, { session: f })),
        check: (b, a) => expect(a.question.followersCount).toBe(b.question.followersCount + 1),
      };
    },
  },
  {
    name: 'POST /questions/:id/follow invalida GET /ranking',
    run: async () => {
      const s = await login(app, uniq('Ana'));
      const f = await login(app, uniq('Beto'));
      const qid = await question(s);
      await boost(f);
      return {
        url: RANK,
        write: () => ok(api(app, 'POST', `/api/questions/${qid}/follow`, { session: f })),
        check: (b, a) => expect(pontos(a, f.user.id)).toBeGreaterThan(pontos(b, f.user.id)),
      };
    },
  },
  {
    name: 'POST /questions/:id/answers invalida GET /questions/:id',
    run: async () => {
      const s = await login(app, uniq('Ana'));
      const h = await login(app, uniq('Beto'));
      const qid = await question(s);
      const pid = await place(h);
      return {
        url: `/api/questions/${qid}`,
        write: () => answer(h, qid, pid),
        check: (b, a) => {
          expect(b.answers).toHaveLength(0);
          expect(a.answers).toHaveLength(1);
        },
      };
    },
  },
  {
    name: 'POST /questions/:id/answers invalida GET /places/:id',
    run: async () => {
      const s = await login(app, uniq('Ana'));
      const h = await login(app, uniq('Beto'));
      const qid = await question(s);
      const pid = await place(h);
      return {
        url: `/api/places/${pid}`,
        write: () => answer(h, qid, pid),
        check: (_b, a) => expect(a.finds.map((f: any) => f.questionId)).toContain(qid),
      };
    },
  },
  {
    name: 'POST /questions/:id/answers criando lugar invalida GET /places',
    run: async () => {
      const s = await login(app, uniq('Ana'));
      const h = await login(app, uniq('Beto'));
      const qid = await question(s);
      const name = uniq('Ciclovia Peças');
      const ev = await evidence(h);
      return {
        url: `/api/places?q=${encodeURIComponent(name)}`,
        write: () =>
          ok(
            api(app, 'POST', `/api/questions/${qid}/answers`, {
              session: h,
              body: { newPlace: { name, lat: C.lat, lng: C.lng + 0.002 }, evidenceIds: [ev] },
            }),
          ),
        check: (_b, a) => expect(a.items.map((i: any) => i.name)).toContain(name),
      };
    },
  },
  {
    name: 'POST /answers/:id/confirm invalida GET /questions/:id',
    run: async () => {
      const { qid, aid } = await scenario();
      const v1 = await login(app, uniq('Vera'));
      const v2 = await login(app, uniq('Vito'));
      await confirm(v1, aid);
      return {
        url: `/api/questions/${qid}`,
        write: () => confirm(v2, aid),
        check: (b, a) => {
          expect(b.answers[0].status).toBe('pendente');
          expect(a.answers[0].status).toBe('confirmada');
        },
      };
    },
  },
  {
    name: 'POST /answers/:id/confirm invalida GET /map/finds',
    run: async () => {
      const { pid, aid } = await scenario();
      const v1 = await login(app, uniq('Vera'));
      const v2 = await login(app, uniq('Vito'));
      await confirm(v1, aid);
      return {
        url: `/api/map/finds?bbox=${BBOX}`,
        write: () => confirm(v2, aid),
        check: (b, a) => {
          expect(b.items.map((i: any) => i.placeId)).not.toContain(pid);
          expect(a.items.map((i: any) => i.placeId)).toContain(pid);
        },
      };
    },
  },
  {
    name: 'POST /questions/:id/accept invalida GET /places/:id',
    run: async () => {
      const { asker, qid, pid, aid } = await scenario();
      return {
        url: `/api/places/${pid}`,
        write: () => ok(api(app, 'POST', `/api/questions/${qid}/accept`, { session: asker, body: { answerId: aid } })),
        check: (_b, a) => expect(a.finds.find((f: any) => f.answerId === aid).status).toBe('aceita'),
      };
    },
  },
  {
    name: 'POST /questions/:id/accept invalida GET /places',
    run: async () => {
      const { asker, qid, aid } = await scenario();
      const name = (await get(`/api/questions/${qid}`)).json.answers[0].placeName as string;
      return {
        url: `/api/places?q=${encodeURIComponent(name)}`,
        write: () => ok(api(app, 'POST', `/api/questions/${qid}/accept`, { session: asker, body: { answerId: aid } })),
        check: (b, a) => {
          const finds = (r: any) => r.items.find((i: any) => i.name === name).finds;
          expect(finds(a)).toBe(finds(b) + 1);
        },
      };
    },
  },
  {
    name: 'POST /questions/:id/accept invalida GET /ranking',
    run: async () => {
      const { asker, helper, qid, aid } = await scenario();
      await boost(helper);
      return {
        url: RANK,
        write: () => ok(api(app, 'POST', `/api/questions/${qid}/accept`, { session: asker, body: { answerId: aid } })),
        check: (b, a) => expect(pontos(a, helper.user.id)).toBeGreaterThan(pontos(b, helper.user.id)),
      };
    },
  },
  {
    name: 'POST /questions/:id/accept invalida GET /questions',
    run: async () => {
      const { asker, qid, aid } = await scenario();
      return {
        url: '/api/questions?status=resolvida',
        write: () => ok(api(app, 'POST', `/api/questions/${qid}/accept`, { session: asker, body: { answerId: aid } })),
        check: (_b, a) => expect(a.items.map((i: any) => i.id)).toContain(qid),
      };
    },
  },
  {
    name: 'POST /answers/:id/tip invalida GET /questions/:id',
    run: async () => {
      const { asker, qid, aid } = await scenario();
      return {
        url: `/api/questions/${qid}`,
        write: () => ok(api(app, 'POST', `/api/answers/${aid}/tip`, { session: asker, body: { amount: 5 } })),
        check: (_b, a) => expect(a.answers[0].tips).toHaveLength(1),
      };
    },
  },
  {
    name: 'POST /flags que esconde a resposta invalida GET /questions/:id',
    run: async () => {
      const { qid, aid } = await scenario();
      const fiscais: Session[] = [];
      for (let i = 0; i < 3; i++) {
        const f = await login(app, uniq('Fiscal'));
        await sql`update users set trust = 0.9 where id = ${f.user.id}::uuid`;
        fiscais.push(f);
      }
      const flag = (f: Session) =>
        ok(
          api(app, 'POST', '/api/flags', {
            session: f,
            body: { targetType: 'resposta', targetId: aid, reason: 'spam' },
          }),
        );
      await flag(fiscais[0]!);
      await flag(fiscais[1]!);
      return {
        url: `/api/questions/${qid}`,
        write: () => flag(fiscais[2]!),
        check: (b, a) => {
          expect(b.answers).toHaveLength(1);
          expect(a.answers).toHaveLength(0);
        },
      };
    },
  },
  {
    name: 'POST /admin/flags/:id invalida GET /questions/:id',
    run: async () => {
      const { qid, aid } = await scenario();
      const f = await login(app, uniq('Fiscal'));
      await ok(
        api(app, 'POST', '/api/flags', { session: f, body: { targetType: 'resposta', targetId: aid, reason: 'spam' } }),
      );
      const flagId = (await sql<{ id: string }[]>`select id from flags where target_id = ${aid}::uuid`)[0]!.id;
      const mod = await login(app, uniq('Mod'));
      await sql`update users set role = 'moderator' where id = ${mod.user.id}::uuid`;
      return {
        url: `/api/questions/${qid}`,
        write: () => ok(api(app, 'POST', `/api/admin/flags/${flagId}`, { session: mod, body: { status: 'procede' } })),
        check: (b, a) => {
          expect(b.answers).toHaveLength(1);
          expect(a.answers).toHaveLength(0);
        },
      };
    },
  },
  {
    name: 'POST /places invalida GET /places',
    run: async () => {
      const s = await login(app, uniq('Geo'));
      const name = uniq('Papelaria Central');
      return {
        url: `/api/places?q=${encodeURIComponent(name)}`,
        write: () => place(s, name),
        check: (b, a) => {
          expect(b.items.map((i: any) => i.name)).not.toContain(name);
          expect(a.items.map((i: any) => i.name)).toContain(name);
        },
      };
    },
  },
  {
    name: 'POST /places invalida GET /ranking',
    run: async () => {
      const s = await login(app, uniq('Geo'));
      await boost(s);
      return {
        url: RANK,
        write: () => place(s),
        check: (b, a) => expect(pontos(a, s.user.id)).toBeGreaterThan(pontos(b, s.user.id)),
      };
    },
  },
];

describe('escritas invalidam as leituras na hora', () => {
  for (const row of rows) {
    it(`${row.name} na hora`, async () => {
      const { url, session, write, check } = await row.run();
      const before = await warm(url, session);
      await write();
      const after = await get(url, session);
      expect(after.xcache).toBe('MISS');
      check(before, after.json);
    });
  }

  it('escrita recusada não invalida', async () => {
    const s = await login(app, uniq('Ana'));
    const title = uniq('Escova de aço para churrasqueira');
    await question(s, { title });
    const url = '/api/questions?status=todas';
    await warm(url);
    const dup = await api(app, 'POST', '/api/questions', { session: s, body: { title } });
    expect(dup.status).toBe(409);
    expect((await get(url)).xcache).toBe('HIT');
  });

  it('GET /me com bônus de sequência invalida o ranking', async () => {
    const s = await login(app, uniq('Sequencia'));
    await boost(s);
    await ok(api(app, 'GET', '/api/me', { session: s }));
    await sql`update users set last_active_on = (now() at time zone 'America/Porto_Velho')::date - 1, streak_days = 1
              where id = ${s.user.id}::uuid`;
    await warm(RANK);
    await ok(api(app, 'GET', '/api/me', { session: s }));
    const after = await get(RANK);
    expect(after.xcache).toBe('MISS');
    expect(pontos(after.json, s.user.id)).toBeGreaterThan(5000);
  });

  it('GET /me sem bônus não invalida o ranking', async () => {
    const s = await login(app, uniq('Sequencia'));
    await ok(api(app, 'GET', '/api/me', { session: s }));
    await warm(RANK);
    await ok(api(app, 'GET', '/api/me', { session: s }));
    expect((await get(RANK)).xcache).toBe('HIT');
  });
});
