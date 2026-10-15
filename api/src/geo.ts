import type { Sql, Tx } from './db.js';

export type Bbox = [w: number, s: number, e: number, n: number];

/** Ponto geography (SRID 4326). Atenção: PostGIS usa a ordem (lng, lat). */
export function pointSql(db: Sql | Tx, lat: number, lng: number) {
  return db`ST_SetSRID(ST_MakePoint(${lng}::float8, ${lat}::float8), 4326)::geography`;
}

/**
 * Lê `w,s,e,n`; `null` se não forem quatro números finitos (aí a consulta não filtra por área).
 * Também devolve `null` quando a área não é representável como geography: o Leaflet não limita a longitude e, com
 * zoom baixo ou cruzando o antimeridiano, o polígono seria desenhado "pelo caminho curto" e excluiria os pinos.
 * A latitude é limitada a ±90.
 */
export function parseBbox(raw: string | undefined): Bbox | null {
  if (!raw) return null;
  const parts = raw.split(',');
  if (parts.length !== 4 || parts.some((p) => p.trim() === '')) return null;
  const nums = parts.map(Number);
  if (!nums.every(Number.isFinite)) return null;
  const [w, s, e, n] = nums as Bbox;
  if (w < -180 || e > 180 || w > e || e - w >= 180) return null;
  const clamp = (v: number) => Math.min(90, Math.max(-90, v));
  return [w, clamp(s), e, clamp(n)];
}

/** `and <coluna> && envelope`, usando o índice GiST. `column` é fixo no código, nunca vem da requisição. */
export function bboxSql(db: Sql | Tx, column: string, box: Bbox | null) {
  if (!box) return db``;
  const [w, s, e, n] = box;
  return db`and ${db(column)} && ST_MakeEnvelope(${w}::float8, ${s}::float8, ${e}::float8, ${n}::float8, 4326)::geography`;
}
