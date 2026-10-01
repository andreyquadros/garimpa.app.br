import { describe, it, expect } from 'vitest';
import sharp from 'sharp';
import { dhashOf, hamming, processImage, scoreEvidence } from '../src/evidence.js';
import { testImage } from './helpers.js';

describe('hash perceptual', () => {
  it('a mesma foto reenviada pelo WhatsApp (1280px, q70) é a mesma foto (Hamming <= 6)', async () => {
    const original = await testImage(7, 512);
    const whatsapp = await sharp(original).resize(1280).jpeg({ quality: 70 }).toBuffer();
    expect(hamming(await dhashOf(original), await dhashOf(whatsapp))).toBeLessThanOrEqual(6);
  });
  it('recompressão agressiva (300px, q40) ainda é "parecida" (Hamming <= 12)', async () => {
    const original = await testImage(7, 512);
    const recompressed = await sharp(original).resize(300).jpeg({ quality: 40 }).toBuffer();
    expect(hamming(await dhashOf(original), await dhashOf(recompressed))).toBeLessThanOrEqual(12);
  });
  it('fotos diferentes ficam longe (Hamming > 12)', async () => {
    const a = await dhashOf(await testImage(1));
    const b = await dhashOf(await testImage(2));
    expect(hamming(a, b)).toBeGreaterThan(12);
  });
  it('processImage remove EXIF e devolve JPEG limitado a 1600px', async () => {
    const big = await sharp({ create: { width: 2400, height: 1200, channels: 3, background: '#F2B705' } }).jpeg().toBuffer();
    const p = await processImage(big);
    expect(p.width).toBe(1600);
    const meta = await sharp(p.jpeg).metadata();
    expect(meta.exif).toBeUndefined();
    expect(p.dhash).toHaveLength(64);
  });
});

describe('pontuação da prova', () => {
  const place = { placeLat: -9.9075, placeLng: -63.0415 };
  it('foto com GPS perto, recente e enviada do local é forte', () => {
    const r = scoreEvidence({ kind: 'foto_produto', exifLat: -9.9076, exifLng: -63.0414, exifTakenAt: new Date(), deviceLat: -9.9077, deviceLng: -63.0416, ...place, reusedBySameUser: false });
    expect(r.score).toBeGreaterThanOrEqual(80);
    expect(r.flags).toEqual([]);
  });
  it('foto sem EXIF vale pouco e é marcada', () => {
    const r = scoreEvidence({ kind: 'foto_produto', exifLat: null, exifLng: null, exifTakenAt: null, deviceLat: null, deviceLng: null, ...place, reusedBySameUser: false });
    expect(r.score).toBeLessThan(60);
    expect(r.flags).toContain('sem_gps');
    expect(r.flags).toContain('sem_data');
  });
  it('GPS a 5 km da loja derruba a nota', () => {
    const r = scoreEvidence({ kind: 'foto_produto', exifLat: -9.95, exifLng: -63.0415, exifTakenAt: new Date(), deviceLat: null, deviceLng: null, ...place, reusedBySameUser: false });
    expect(r.flags).toContain('longe_do_local');
    expect(r.score).toBeLessThan(40);
  });
  it('foto parecida com a de outra pessoa perde 20 e é marcada', () => {
    const r = scoreEvidence({ kind: 'foto_produto', exifLat: null, exifLng: null, exifTakenAt: null, deviceLat: -9.9075, deviceLng: -63.0415, ...place, reusedBySameUser: false, similarToOther: true });
    expect(r.score).toBe(20);
    expect(r.flags).toContain('foto_parecida');
  });
  it('nota fiscal recebe bônus; foto reutilizada perde', () => {
    const nf = scoreEvidence({ kind: 'nota_fiscal', exifLat: null, exifLng: null, exifTakenAt: null, deviceLat: -9.9075, deviceLng: -63.0415, ...place, reusedBySameUser: false });
    const reused = scoreEvidence({ kind: 'nota_fiscal', exifLat: null, exifLng: null, exifTakenAt: null, deviceLat: -9.9075, deviceLng: -63.0415, ...place, reusedBySameUser: true });
    expect(nf.score - reused.score).toBe(30);
    expect(reused.flags).toContain('foto_reutilizada');
  });
});
