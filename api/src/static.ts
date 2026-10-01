import fs from 'node:fs';
import fsp from 'node:fs/promises';
import path from 'node:path';
import type { Context } from 'hono';

const MIME: Record<string, string> = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8', '.json': 'application/json; charset=utf-8', '.webmanifest': 'application/manifest+json',
  '.svg': 'image/svg+xml', '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.webp': 'image/webp', '.ico': 'image/x-icon',
  '.woff2': 'font/woff2', '.woff': 'font/woff', '.txt': 'text/plain; charset=utf-8', '.map': 'application/json', '.wasm': 'application/wasm',
};

async function sendFile(c: Context, abs: string, cache: string): Promise<Response | null> {
  let st: fs.Stats;
  try { st = await fsp.stat(abs); } catch { return null; }
  if (!st.isFile()) return null;
  const type = MIME[path.extname(abs).toLowerCase()] ?? 'application/octet-stream';
  const stream = fs.createReadStream(abs);
  const body = new ReadableStream({
    start(controller) {
      stream.on('data', (chunk) => controller.enqueue(typeof chunk === 'string' ? Buffer.from(chunk) : new Uint8Array(chunk)));
      stream.on('end', () => controller.close());
      stream.on('error', (e) => controller.error(e));
    },
    cancel() { stream.destroy(); },
  });
  return new Response(body, { headers: { 'content-type': type, 'content-length': String(st.size), 'cache-control': cache } });
}

/** Fotos enviadas: só caminhos no formato ano/mes/<sha256>.jpg, nada de "..". */
export async function serveUpload(c: Context, uploadDir: string, rel: string): Promise<Response> {
  if (!/^\d{4}\/\d{2}\/[a-f0-9]{64}\.jpg$/.test(rel)) return c.notFound();
  const res = await sendFile(c, path.join(uploadDir, rel), 'public, max-age=31536000, immutable');
  return res ?? c.notFound();
}

/** Build do PWA com fallback para index.html (rotas do React Router). */
export async function serveWeb(c: Context, webDir: string, urlPath: string): Promise<Response> {
  const clean = path.posix.normalize(decodeURIComponent(urlPath)).replace(/^(\.\.(\/|\\|$))+/, '');
  const abs = path.join(webDir, clean);
  if (!abs.startsWith(webDir)) return c.notFound();
  const hashed = /\/assets\//.test(clean) || /\.[a-f0-9]{8,}\./.test(clean);
  const res = await sendFile(c, abs, hashed ? 'public, max-age=31536000, immutable' : 'public, max-age=300');
  if (res) return res;
  const index = await sendFile(c, path.join(webDir, 'index.html'), 'no-cache');
  return index ?? c.notFound();
}
