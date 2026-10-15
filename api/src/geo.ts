import type { Sql, Tx } from './db.js';

export type Bbox = [w: number, s: number, e: number, n: number];

/** Ponto geography (SRID 4326). Atenção: PostGIS usa a ordem (lng, lat). */
export function pointSql(db: Sql | Tx, lat: number, lng: number) {
  return db`ST_SetSRID(ST_MakePoint(${lng}::float8, ${lat}::float8), 4326)::geography`;
}

/** Lê `w,s,e,n`; `null` se não forem quatro números finitos (aí a consulta não filtra por área). */
export function parseBbox(raw: string | undefined): Bbox | null {
  if (!raw) return null;
  const parts = raw.split(',');
  if (parts.length !== 4 || parts.some((p) => p.trim() === '')) return null;
  const nums = parts.map(Number);
  return nums.every(Number.isFinite) ? (nums as Bbox) : null;
}

/** `and <coluna> && envelope`, usando o índice GiST. `column` é fixo no código, nunca vem da requisição. */
export function bboxSql(db: Sql | Tx, column: string, box: Bbox | null) {
  if (!box) return db``;
  const [w, s, e, n] = box;
  return db`and ${db(column)} && ST_MakeEnvelope(${w}::float8, ${s}::float8, ${e}::float8, ${n}::float8, 4326)::geography`;
}
