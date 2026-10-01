/** Espelhos em TypeScript das funções de texto, distância e pontuação da API, para o modo demonstração. */

export function normText(s: string): string {
  return s
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

export function slugify(s: string): string {
  return normText(s).replace(/\s+/g, '-').slice(0, 24) || 'garimpeiro';
}

export function haversineM(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const R = 6371000;
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2;
  return Math.round(2 * R * Math.asin(Math.sqrt(a)));
}

const STOPWORDS = new Set(['de', 'da', 'do', 'com', 'para', 'em', 'e', 'o', 'a', 'um', 'uma']);

/** Palavras relevantes: normalizadas, sem palavras vazias (de/da/do/com/para/em/e/o/a/um/uma). */
export function tokens(s: string): string[] {
  return Array.from(new Set(normText(s).split(' ').filter((t) => t && !STOPWORDS.has(t))));
}

/** Duas palavras "batem" se iguais ou se uma é prefixo da outra (garrafa/garrafas, hermetica/hermetico). */
function matches(a: string, b: string): boolean {
  if (a === b) return true;
  if (a.length < 4 || b.length < 4) return false;
  return a.startsWith(b) || b.startsWith(a);
}

export type TextSim = { sim: number; wsim: number; rank: number; score: number; allFound: boolean };

/**
 * Similaridade entre a busca e um título: `sim` é o Jaccard dos conjuntos de palavras,
 * `wsim` é quanto da busca está contida no título (containment), `rank` pesa também os detalhes
 * (faz as vezes do ts_rank) e `allFound` diz se toda palavra da busca aparece no título ou nos detalhes
 * (o equivalente do websearch_to_tsquery). `score` segue a API: greatest(sim, wsim * 0.8, rank).
 */
export function similarity(query: string, title: string, details = ''): TextSim {
  const q = tokens(query);
  const t = tokens(title);
  if (q.length === 0 || t.length === 0) return { sim: 0, wsim: 0, rank: 0, score: 0, allFound: false };
  const inter = q.filter((a) => t.some((b) => matches(a, b))).length;
  const union = new Set([...q, ...t]).size;
  const sim = round4(inter / union);
  const wsim = round4(inter / q.length);
  const all = tokens(`${title} ${details}`);
  const hits = q.filter((a) => all.some((b) => matches(a, b))).length;
  const rank = round4(hits > 0 ? 0.05 + 0.05 * (hits / q.length) : 0);
  return { sim, wsim, rank, score: round4(Math.max(sim, wsim * 0.8, rank)), allFound: hits === q.length };
}

/** Critério de "parecida" da busca (espelha `%`, `<%` e `@@` da API): quase tudo da busca aparece no título, ou tudo no texto. */
export function textMatches(t: TextSim): boolean {
  return t.sim >= 0.3 || t.wsim >= 0.6 || t.allFound;
}
const round4 = (n: number) => Math.round(n * 10000) / 10000;

/** Trigramas no estilo do pg_trgm (cada palavra com dois espaços antes e um depois). */
function trigrams(s: string): Set<string> {
  const out = new Set<string>();
  for (const w of normText(s).split(' ')) {
    if (!w) continue;
    const p = `  ${w} `;
    for (let i = 0; i + 3 <= p.length; i++) out.add(p.slice(i, i + 3));
  }
  return out;
}

/** similarity() do pg_trgm: |∩| / |∪| dos trigramas. Usada para texto copiado entre respostas. */
export function trigramSimilarity(a: string, b: string): number {
  const ta = trigrams(a);
  const tb = trigrams(b);
  if (ta.size === 0 || tb.size === 0) return 0;
  let inter = 0;
  for (const t of ta) if (tb.has(t)) inter++;
  return inter / (ta.size + tb.size - inter);
}

export const EXIF_NEAR_M = 300;
export const EXIF_FAR_M = 1000;
export const DEVICE_NEAR_M = 500;
export const DEVICE_FAR_M = 2000;
export const EXIF_MAX_AGE_DAYS = 30;
export const DUPLICATE_HAMMING = 6;
export const SIMILAR_HAMMING = 12;

export type ScoreInput = {
  kind: string;
  exifLat: number | null; exifLng: number | null; exifTakenAt: Date | null;
  deviceLat: number | null; deviceLng: number | null;
  placeLat: number; placeLng: number;
  reusedBySameUser: boolean; similarToOther?: boolean; now?: Date;
};
export type ScoreResult = { score: number; flags: string[]; distanceExifM: number | null; distanceDeviceM: number | null };

/** Mesma régua da API (api/src/evidence.ts). No navegador não lemos EXIF: conta só a localização do aparelho. */
export function scoreEvidence(i: ScoreInput): ScoreResult {
  const flags: string[] = [];
  let score = 20;
  if (i.kind === 'nota_fiscal' || i.kind === 'recibo') score += 15;

  let distanceExifM: number | null = null;
  if (i.exifLat != null && i.exifLng != null) {
    distanceExifM = haversineM(i.exifLat, i.exifLng, i.placeLat, i.placeLng);
    if (distanceExifM <= EXIF_NEAR_M) score += 30;
    else if (distanceExifM <= EXIF_FAR_M) score += 10;
    else { score -= 20; flags.push('longe_do_local'); }
  } else {
    flags.push('sem_gps');
  }

  const now = i.now ?? new Date();
  if (i.exifTakenAt) {
    const ageDays = (now.getTime() - i.exifTakenAt.getTime()) / 86400000;
    if (ageDays <= EXIF_MAX_AGE_DAYS && ageDays >= -1) score += 15;
    else flags.push('foto_antiga');
  } else {
    flags.push('sem_data');
  }

  let distanceDeviceM: number | null = null;
  if (i.deviceLat != null && i.deviceLng != null) {
    distanceDeviceM = haversineM(i.deviceLat, i.deviceLng, i.placeLat, i.placeLng);
    if (distanceDeviceM <= DEVICE_NEAR_M) score += 20;
    else if (distanceDeviceM <= DEVICE_FAR_M) score += 5;
    else { score -= 10; flags.push('enviada_de_longe'); }
  }

  if (i.reusedBySameUser) { score -= 30; flags.push('foto_reutilizada'); }
  if (i.similarToOther) { score -= 20; flags.push('foto_parecida'); }

  return { score: Math.max(0, Math.min(100, score)), flags, distanceExifM, distanceDeviceM };
}

export function hamming(a: string, b: string): number {
  let d = 0;
  for (let i = 0; i < 64; i++) if (a[i] !== b[i]) d++;
  return d;
}

/** Hash de 32 bits de uma string (FNV-1a), base dos "aleatórios" determinísticos do seed. */
export function hash32(s: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 0x01000193) >>> 0; }
  return h >>> 0;
}

/** Gerador determinístico (mulberry32) em [0, 1). */
export function rng(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
