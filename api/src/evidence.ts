import sharp from 'sharp';
import exifr from 'exifr';
import { createHash } from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';
import { haversineM } from './text.js';

export const EXIF_NEAR_M = 300;
export const EXIF_FAR_M = 1000;
export const DEVICE_NEAR_M = 500;
export const DEVICE_FAR_M = 2000;
export const EXIF_MAX_AGE_DAYS = 30;
/** <= 6 bits: mesma foto (recusa se for de outra pessoa). 7–12: parecida (aceita com aviso e desconto). */
export const DUPLICATE_HAMMING = 6;
export const SIMILAR_HAMMING = 12;

export type Processed = {
  jpeg: Buffer;
  width: number;
  height: number;
  sha256: string;
  dhash: string; // 64 chars de 0/1
  exifTakenAt: Date | null;
  exifLat: number | null;
  exifLng: number | null;
};

/** Hash perceptual (dHash 8x8): robusto a recompressão, redimensionamento e pequenos recortes. */
export async function dhashOf(input: Buffer): Promise<string> {
  const { data, info } = await sharp(input)
    .rotate()
    .removeAlpha()
    .greyscale()
    .resize(9, 8, { fit: 'fill' })
    .raw()
    .toBuffer({ resolveWithObject: true });
  const ch = info.channels;
  let bits = '';
  for (let r = 0; r < 8; r++) {
    for (let c = 0; c < 8; c++) {
      const a = data[(r * 9 + c) * ch]!;
      const b = data[(r * 9 + c + 1) * ch]!;
      bits += a > b ? '1' : '0';
    }
  }
  return bits;
}

export function hamming(a: string, b: string): number {
  let d = 0;
  for (let i = 0; i < 64; i++) if (a[i] !== b[i]) d++;
  return d;
}

/** Lê EXIF (antes de remover), gera JPEG limpo de metadados e os hashes. */
export async function processImage(input: Buffer): Promise<Processed> {
  let exifTakenAt: Date | null = null;
  let exifLat: number | null = null;
  let exifLng: number | null = null;
  try {
    const gps = await exifr.gps(input);
    if (gps && Number.isFinite(gps.latitude) && Number.isFinite(gps.longitude)) {
      exifLat = gps.latitude;
      exifLng = gps.longitude;
    }
  } catch { /* sem GPS */ }
  try {
    const meta = (await exifr.parse(input, ['DateTimeOriginal', 'CreateDate'])) as
      | { DateTimeOriginal?: Date; CreateDate?: Date }
      | undefined;
    const d = meta?.DateTimeOriginal ?? meta?.CreateDate;
    if (d instanceof Date && !Number.isNaN(d.getTime())) exifTakenAt = d;
  } catch { /* sem data */ }

  const { data, info } = await sharp(input)
    .rotate()
    .resize({ width: 1600, height: 1600, fit: 'inside', withoutEnlargement: true })
    .jpeg({ quality: 82, mozjpeg: true })
    .toBuffer({ resolveWithObject: true }); // sharp descarta EXIF/GPS por padrão: a foto publicada não vaza localização
  const sha256 = createHash('sha256').update(data).digest('hex');
  const dhash = await dhashOf(data);
  return { jpeg: data, width: info.width, height: info.height, sha256, dhash, exifTakenAt, exifLat, exifLng };
}

export async function storeImage(uploadDir: string, sha256: string, jpeg: Buffer): Promise<string> {
  const now = new Date();
  const rel = path.posix.join(String(now.getUTCFullYear()), String(now.getUTCMonth() + 1).padStart(2, '0'), `${sha256}.jpg`);
  const abs = path.join(uploadDir, rel);
  await fs.mkdir(path.dirname(abs), { recursive: true });
  await fs.writeFile(abs, jpeg);
  return rel;
}

export type ScoreInput = {
  kind: string;
  exifLat: number | null;
  exifLng: number | null;
  exifTakenAt: Date | null;
  deviceLat: number | null;
  deviceLng: number | null;
  placeLat: number;
  placeLng: number;
  questionCreatedAt?: Date | null;
  reusedBySameUser: boolean;
  similarToOther?: boolean;
  now?: Date;
};

export type ScoreResult = { score: number; flags: string[]; distanceExifM: number | null; distanceDeviceM: number | null };

/**
 * Pontua a prova de 0 a 100. A regra é transparente para o usuário (checklist na tela):
 * foto com GPS perto da loja e data recente vale muito; foto sem EXIF ainda vale, mas depende de confirmação.
 */
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
