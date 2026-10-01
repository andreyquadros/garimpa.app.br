import sharp from 'sharp';
import type { Sql } from './db.js';
import { award, loadEconomy, grantBadge } from './economy.js';
import { processImage, storeImage, scoreEvidence } from './evidence.js';

/**
 * Dados de demonstração para o piloto (marcados como source='seed'; apague com `delete from users where handle like 'demo-%'`).
 * Lugares usam avenidas reais de Ariquemes, mas os nomes de loja são fictícios.
 */
export async function seedDemo(sql: Sql, uploadDir: string, cityId: string) {
  const exists = await sql`select 1 from users where handle = 'demo-marina'`;
  if (exists.length) return { skipped: true };
  const eco = await loadEconomy(sql);
  const c = { lat: -9.9075, lng: -63.0415 };

  const users = [
    { handle: 'demo-marina', name: 'Marina Castro' }, { handle: 'demo-joao', name: 'João Pedro Lima' },
    { handle: 'demo-tais', name: 'Taís Oliveira' }, { handle: 'demo-rafael', name: 'Rafael Souza' },
    { handle: 'demo-dona-neide', name: 'Dona Neide' }, { handle: 'demo-lucas', name: 'Lucas Ferreira' },
  ];
  const uid: Record<string, string> = {};
  for (const u of users) {
    const r = await sql<{ id: string }[]>`insert into users(name, handle, city_id, google_sub, created_at) values (${u.name}, ${u.handle}, ${cityId}, ${'seed:' + u.handle}, now() - interval '20 days') returning id`;
    uid[u.handle] = r[0]!.id;
    await grantBadge(sql, r[0]!.id, 'fundador');
  }

  const placesIn = [
    ['Casa & Cozinha Jamari', 'Av. Jamari, Setor 01', 'loja', 0.0021, -0.0038],
    ['Mercado Tancredo', 'Av. Tancredo Neves, Setor 02', 'mercado', -0.0045, 0.0022],
    ['Utilidades Canaã', 'Av. Canaã, Setor 03', 'loja', 0.0062, 0.0051],
    ['Farmácia Capitão Sílvio', 'Av. Capitão Sílvio, Setor 04', 'farmacia', -0.0088, -0.0064],
    ['Papelaria JK', 'Av. Juscelino Kubitschek, Setor 05', 'loja', 0.0105, -0.0011],
    ['Ferragens Machadinho', 'Av. Machadinho, Setor 06', 'loja', -0.0131, 0.0098],
    ['Feira do Produtor', 'Setor Institucional', 'feira', 0.0034, 0.0122],
    ['Pet Guaporé', 'Av. Guaporé, Setor 02', 'loja', -0.0012, 0.0067],
    ['Eletrônica Jorge Teixeira', 'Bairro Jardim Jorge Teixeira', 'loja', 0.0151, 0.0083],
    ['Atacado Setor 09', 'Setor 09', 'mercado', -0.0176, -0.0032],
  ] as const;
  const pid: string[] = [];
  for (const [name, address, kind, dlat, dlng] of placesIn) {
    const r = await sql<{ id: string }[]>`insert into places(city_id, name, address, lat, lng, kind, source, created_by)
      values (${cityId}, ${name}, ${address}, ${c.lat + dlat}, ${c.lng + dlng}, ${kind}, 'seed', ${uid['demo-tais']!}::uuid) returning id`;
    pid.push(r[0]!.id);
  }

  type Q = { by: string; title: string; details?: string; category: string; daysAgo: number; answers: Array<{ by: string; place: number; note: string; price?: number; accept?: boolean; confirms?: string[]; gps?: boolean }> };
  const questions: Q[] = [
    { by: 'demo-marina', title: 'Garrafa de vidro com tampa hermética (1 litro)', details: 'Para guardar kombucha. Pode ser de clipe ou rosca, mas tem que vedar.', category: 'casa', daysAgo: 6,
      answers: [
        { by: 'demo-joao', place: 0, note: 'Tem na prateleira do fundo, perto das panelas. Vidro com tampa de clipe, 1 L.', price: 2490, accept: true, confirms: ['demo-tais', 'demo-lucas'], gps: true },
        { by: 'demo-rafael', place: 2, note: 'Vi hoje de manhã no corredor de potes, modelo com rosca.', price: 1990, confirms: ['demo-marina'] },
      ] },
    { by: 'demo-rafael', title: 'Fonte carregador USB-C 65W (notebook)', details: 'Pode ser de qualquer marca, só precisa ser USB-C PD 65W.', category: 'eletronicos', daysAgo: 4,
      answers: [{ by: 'demo-lucas', place: 8, note: 'Tem Baseus 65W no balcão, pediu pra testar e funcionou no meu Lenovo.', price: 15900, accept: true, confirms: ['demo-joao', 'demo-tais'], gps: true }] },
    { by: 'demo-dona-neide', title: 'Ração hipoalergênica para gato castrado', category: 'pets', daysAgo: 3,
      answers: [{ by: 'demo-tais', place: 7, note: 'Pacote de 1,5 kg da Premier Gourmet e da Guabi. Preço na foto.', price: 8990, confirms: ['demo-rafael', 'demo-lucas'], gps: true }] },
    { by: 'demo-joao', title: 'Lâmpada LED E27 bivolt 15W luz amarela', category: 'casa', daysAgo: 2,
      answers: [{ by: 'demo-dona-neide', place: 5, note: 'Caixa com 3 unidades, R$ 29,90.', price: 2990, confirms: ['demo-marina'] }] },
    { by: 'demo-tais', title: 'Fita isolante líquida', category: 'ferramentas', daysAgo: 2, answers: [] },
    { by: 'demo-lucas', title: 'Caderno de desenho A3 (papel 180g)', category: 'papelaria', daysAgo: 1,
      answers: [{ by: 'demo-marina', place: 4, note: 'Canson A3 180g, última unidade estava hoje às 10h.', price: 4590 }] },
    { by: 'demo-marina', title: 'Guarda-chuva transparente estilo bolha', category: 'roupas', daysAgo: 1, answers: [] },
    { by: 'demo-rafael', title: 'Cadeirinha de carro reversível até 25 kg', category: 'bebe', daysAgo: 0, answers: [] },
  ];

  const ids = { questions: 0, answers: 0, evidences: 0 };
  for (const q of questions) {
    const qr = await sql<{ id: string; createdAt: Date }[]>`
      insert into questions(city_id, author_id, title, details, category, lat, lng, created_at, followers_count)
      values (${cityId}, ${uid[q.by]!}::uuid, ${q.title}, ${q.details ?? null}, ${q.category}, ${c.lat + (Math.random() - 0.5) * 0.02}, ${c.lng + (Math.random() - 0.5) * 0.02},
              now() - make_interval(days => ${q.daysAgo}::int, hours => 3), 1) returning id, created_at`;
    const qid = qr[0]!.id;
    ids.questions++;
    await sql`insert into question_followers(question_id, user_id) values (${qid}::uuid, ${uid[q.by]!}::uuid)`;
    await award(sql, uid[q.by]!, 'pergunta', eco.xp.pergunta, 0, { type: 'pergunta', id: qid }, {}, 0);
    for (const f of ['demo-lucas', 'demo-tais'].filter((h) => h !== q.by).slice(0, q.daysAgo % 3)) {
      await sql`insert into question_followers(question_id, user_id) values (${qid}::uuid, ${uid[f]!}::uuid) on conflict do nothing`;
      await sql`update questions set followers_count = followers_count + 1, bounty = least(${eco.pepitas.bounty_maximo}, bounty + ${eco.pepitas.bounty_tambem_quero}) where id = ${qid}::uuid`;
    }
    let first = true;
    for (const a of q.answers) {
      const placeId = pid[a.place]!;
      const pl = (await sql<{ lat: number; lng: number }[]>`select lat, lng from places where id = ${placeId}::uuid`)[0]!;
      const ar = await sql<{ id: string }[]>`
        insert into answers(question_id, author_id, place_id, note, price_cents, seen_on, is_first_for_place, created_at)
        values (${qid}::uuid, ${uid[a.by]!}::uuid, ${placeId}::uuid, ${a.note}, ${a.price ?? null}, current_date - ${q.daysAgo}::int, ${first}, now() - make_interval(days => ${q.daysAgo}::int, hours => 1)) returning id`;
      const aid = ar[0]!.id;
      ids.answers++;
      const img = await demoImage(q.title, a.place);
      const p = await processImage(img);
      const rel = await storeImage(uploadDir, p.sha256, p.jpeg);
      const exifLat = a.gps ? pl.lat + 0.0004 : null;
      const exifLng = a.gps ? pl.lng - 0.0003 : null;
      const sc = scoreEvidence({ kind: 'foto_produto', exifLat, exifLng, exifTakenAt: a.gps ? new Date(Date.now() - q.daysAgo * 86400000) : null,
        deviceLat: pl.lat + 0.001, deviceLng: pl.lng, placeLat: pl.lat, placeLng: pl.lng, reusedBySameUser: false });
      await sql`insert into evidences(answer_id, uploader_id, kind, file_path, mime, width, height, bytes, sha256, dhash, exif_taken_at, exif_lat, exif_lng, device_lat, device_lng, distance_exif_m, distance_device_m, flags, score)
        values (${aid}::uuid, ${uid[a.by]!}::uuid, 'foto_produto', ${rel}, 'image/jpeg', ${p.width}, ${p.height}, ${p.jpeg.length}, ${p.sha256}, ${p.dhash}::bit(64),
                ${a.gps ? new Date(Date.now() - q.daysAgo * 86400000) : null}, ${exifLat}, ${exifLng}, ${pl.lat + 0.001}, ${pl.lng}, ${sc.distanceExifM}, ${sc.distanceDeviceM}, ${sc.flags}::text[], ${sc.score})`;
      ids.evidences++;
      await sql`update answers set evidence_score = ${sc.score} where id = ${aid}::uuid`;
      await sql`update questions set answers_count = answers_count + 1, status = case when status = 'aberta' then 'respondida' else status end where id = ${qid}::uuid`;
      await award(sql, uid[a.by]!, 'resposta_com_evidencia', sc.score >= eco.evidencia_forte ? eco.xp.resposta_com_evidencia : 5, 0, { type: 'resposta', id: aid }, { forte: sc.score >= eco.evidencia_forte }, 0);
      for (const v of a.confirms ?? []) {
        await sql`insert into confirmations(answer_id, user_id, vote, weight) values (${aid}::uuid, ${uid[v]!}::uuid, 1, 1.0)`;
        await sql`update answers set confirms = confirms + 1 where id = ${aid}::uuid`;
        await award(sql, uid[v]!, 'confirmar', eco.xp.confirmar, 0, { type: 'resposta', id: aid }, {}, 0);
      }
      if ((a.confirms?.length ?? 0) >= eco.confirmacoes_para_validar) {
        await sql`update answers set status = 'confirmada' where id = ${aid}::uuid`;
        await award(sql, uid[a.by]!, 'resposta_confirmada', eco.xp.resposta_confirmada, Math.round(eco.pepitas.resposta_confirmada * (first ? 1 : eco.pepitas.fracao_segundo_achado)), { type: 'resposta', id: aid }, {}, 0);
        for (const v of a.confirms ?? []) await award(sql, uid[v]!, 'confirmacao_validada', eco.xp.confirmacao_validada, eco.pepitas.confirmacao_validada, { type: 'resposta', id: aid }, {}, 0);
      }
      if (a.accept) {
        await sql`update questions set status = 'resolvida', accepted_answer_id = ${aid}::uuid, solved_at = now() - make_interval(days => ${q.daysAgo}::int) where id = ${qid}::uuid`;
        await sql`update answers set status = 'aceita' where id = ${aid}::uuid`;
        await award(sql, uid[a.by]!, 'resposta_aceita', eco.xp.resposta_aceita, eco.pepitas.resposta_aceita, { type: 'resposta', id: aid }, { primeiro: first }, 0);
        await award(sql, uid[a.by]!, 'primeiro_achado', eco.xp.primeiro_achado, eco.pepitas.primeiro_achado, { type: 'resposta', id: aid }, {}, 0);
        await award(sql, uid[q.by]!, 'aceitar_resposta', eco.xp.aceitar_resposta, 0, { type: 'pergunta', id: qid }, {}, 0);
        await grantBadge(sql, uid[a.by]!, 'primeiro_achado');
        const tip = await sql<{ id: string }[]>`insert into tips(from_user, to_user, answer_id, amount, source) values (${uid[q.by]!}::uuid, ${uid[a.by]!}::uuid, ${aid}::uuid, 10, 'orcamento') returning id`;
        await sql`update questions set tip_budget_left = tip_budget_left - 10 where id = ${qid}::uuid`;
        await award(sql, uid[a.by]!, 'gorjeta_recebida', 2, 10, { type: 'gorjeta', id: tip[0]!.id }, { de: uid[q.by] }, 0);
      }
      first = false;
    }
  }
  for (const h of Object.keys(uid)) await sql`select fn_recompute_trust(${uid[h]!}::uuid)`;
  await sql`update users set streak_days = 5, last_active_on = (now() at time zone 'America/Porto_Velho')::date where handle = 'demo-marina'`;
  await sql`update users set streak_days = 12, last_active_on = (now() at time zone 'America/Porto_Velho')::date where handle = 'demo-tais'`;
  return { skipped: false, users: users.length, places: pid.length, ...ids };
}

/** Imagem de demonstração: cartão com o nome do produto e formas em posições que dependem do texto (hashes distintos). */
export async function demoImage(title: string, seed: number): Promise<Buffer> {
  const palette = [['#0F4C4C', '#F2B705'], ['#1E7A52', '#F5F8F3'], ['#B3401F', '#FBE7A1'], ['#133A3A', '#7FD1AE'], ['#F2B705', '#0F4C4C']];
  const [bg, fg] = palette[seed % palette.length]!;
  let h = 0;
  for (const ch of title) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
  const shapes = Array.from({ length: 7 }, (_, i) => {
    const x = ((h >> (i * 3)) % 700) + 50; const y = ((h >> (i * 2 + 1)) % 420) + 60; const r = 20 + ((h >> i) % 60);
    return i % 2 ? `<circle cx="${x}" cy="${y}" r="${r}" fill="${fg}" opacity="0.35"/>` : `<rect x="${x}" y="${y}" width="${r * 2}" height="${r}" rx="12" fill="${fg}" opacity="0.25"/>`;
  }).join('');
  const safe = title.replace(/&/g, '&amp;').replace(/</g, '&lt;');
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="800" height="600"><rect width="800" height="600" fill="${bg}"/>${shapes}
    <text x="40" y="520" font-family="sans-serif" font-size="34" font-weight="700" fill="${fg}">${safe}</text>
    <text x="40" y="565" font-family="sans-serif" font-size="22" fill="${fg}" opacity="0.8">foto de exemplo · piloto Ariquemes</text></svg>`;
  return sharp(Buffer.from(svg)).jpeg({ quality: 85 }).toBuffer();
}
