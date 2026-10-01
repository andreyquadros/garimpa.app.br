import { hash32, rng } from './text';

/** Imagens do modo demonstração: provas do seed em SVG, processamento de envios via canvas e hash perceptual. */

const PALETTE = [['#0F4C4C', '#F2B705'], ['#1E7A52', '#F5F8F3'], ['#B3401F', '#FBE7A1'], ['#133A3A', '#7FD1AE'], ['#F2B705', '#0F4C4C']] as const;

function esc(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}
function svgUrl(svg: string): string {
  return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
}

/** Cartão com o nome do produto e formas em posições que dependem do texto (mesma ideia de api/src/seed.ts). */
export function demoImageDataUrl(title: string, seed: number): string {
  const [bg, fg] = PALETTE[Math.abs(seed) % PALETTE.length]!;
  let h = 0;
  for (const ch of title) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
  const shapes = Array.from({ length: 7 }, (_, i) => {
    const x = ((h >> (i * 3)) % 700) + 50; const y = ((h >> (i * 2 + 1)) % 420) + 60; const r = 20 + ((h >> i) % 60);
    return i % 2 ? `<circle cx="${x}" cy="${y}" r="${r}" fill="${fg}" opacity="0.35"/>` : `<rect x="${x}" y="${y}" width="${r * 2}" height="${r}" rx="12" fill="${fg}" opacity="0.25"/>`;
  }).join('');
  const short = title.length > 34 ? `${title.slice(0, 33)}…` : title;
  return svgUrl(`<svg xmlns="http://www.w3.org/2000/svg" width="800" height="600" viewBox="0 0 800 600"><rect width="800" height="600" fill="${bg}"/>${shapes}<text x="40" y="520" font-family="sans-serif" font-size="34" font-weight="700" fill="${fg}">${esc(short)}</text><text x="40" y="565" font-family="sans-serif" font-size="22" fill="${fg}" opacity="0.8">foto de exemplo · piloto Ariquemes</text></svg>`);
}

/** Substitui fotos enviadas nesta sessão que se perderam ao recarregar (o demo não guarda imagens). */
export function placeholderDataUrl(): string {
  return svgUrl(`<svg xmlns="http://www.w3.org/2000/svg" width="800" height="600" viewBox="0 0 800 600"><rect width="800" height="600" fill="#D5E9E2"/><rect x="300" y="210" width="200" height="140" rx="20" fill="none" stroke="#0F4C4C" stroke-width="10"/><circle cx="400" cy="280" r="38" fill="none" stroke="#0F4C4C" stroke-width="10"/><rect x="350" y="180" width="60" height="40" rx="8" fill="#0F4C4C"/><text x="400" y="420" text-anchor="middle" font-family="sans-serif" font-size="26" font-weight="700" fill="#0F4C4C">foto enviada na demonstração</text><text x="400" y="458" text-anchor="middle" font-family="sans-serif" font-size="20" fill="#3F6260">a imagem fica só na memória do navegador</text></svg>`);
}

/** dHash pseudoaleatório, estável por título, para as provas do seed (não há pixels para ler). */
export function seedDhash(title: string, seed: number): string {
  const r = rng(hash32(`${title}|${seed}`));
  let bits = '';
  for (let i = 0; i < 64; i++) bits += r() < 0.5 ? '0' : '1';
  return bits;
}

export type Processed = { dataUrl: string; width: number; height: number; dhash: string; sha: string };

function loadImage(blob: Blob): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(blob);
    const img = new Image();
    img.onload = () => { URL.revokeObjectURL(url); resolve(img); };
    img.onerror = () => { URL.revokeObjectURL(url); reject(new Error('imagem ilegível')); };
    img.src = url;
  });
}

function canvasOf(w: number, h: number): { canvas: HTMLCanvasElement; ctx: CanvasRenderingContext2D } {
  const canvas = document.createElement('canvas');
  canvas.width = Math.max(1, Math.round(w));
  canvas.height = Math.max(1, Math.round(h));
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  if (!ctx) throw new Error('canvas indisponível');
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = 'high';
  return { canvas, ctx };
}

/** Hash perceptual (dHash 8x8) a partir de um canvas: reduz em etapas até 9x8 em tons de cinza e compara vizinhos. */
export function dhashOfCanvas(src: HTMLCanvasElement): string {
  let cur = src;
  while (cur.width > 72 || cur.height > 64) {
    const { canvas, ctx } = canvasOf(Math.max(9, cur.width / 2), Math.max(8, cur.height / 2));
    ctx.drawImage(cur, 0, 0, canvas.width, canvas.height);
    cur = canvas;
  }
  const { canvas, ctx } = canvasOf(9, 8);
  ctx.drawImage(cur, 0, 0, 9, 8);
  const { data } = ctx.getImageData(0, 0, 9, 8);
  const grey = (i: number) => 0.299 * data[i * 4]! + 0.587 * data[i * 4 + 1]! + 0.114 * data[i * 4 + 2]!;
  let bits = '';
  for (let r = 0; r < 8; r++) for (let c = 0; c < 8; c++) bits += grey(r * 9 + c) > grey(r * 9 + c + 1) ? '1' : '0';
  return bits;
}

/** Lê o arquivo, reduz a no máximo 1200 px (JPEG), calcula o dHash e um hash do conteúdo. */
export async function processImage(blob: Blob): Promise<Processed> {
  const img = await loadImage(blob);
  const w0 = img.naturalWidth || img.width;
  const h0 = img.naturalHeight || img.height;
  if (!w0 || !h0) throw new Error('imagem vazia');
  const scale = Math.min(1, 1200 / Math.max(w0, h0));
  const { canvas, ctx } = canvasOf(w0 * scale, h0 * scale);
  ctx.fillStyle = '#fff';
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
  const dataUrl = canvas.toDataURL('image/jpeg', 0.82);
  const dhash = dhashOfCanvas(canvas);
  return { dataUrl, width: canvas.width, height: canvas.height, dhash, sha: hash32(dataUrl).toString(16).padStart(8, '0') + dataUrl.length.toString(16) };
}
