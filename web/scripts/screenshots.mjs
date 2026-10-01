// Capturas de tela do PWA em viewport de celular, para o README.
// Uso: BASE_URL=http://localhost:8787 node web/scripts/screenshots.mjs   (API servindo web/dist, banco com seed)
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

async function loadPlaywright() {
  for (const spec of ['playwright', '/opt/node-tools/node_modules/playwright/index.mjs', '/opt/node22/lib/node_modules/playwright/index.mjs']) {
    try { return await import(spec); } catch { /* tenta o próximo */ }
  }
  throw new Error('playwright não encontrado: npx playwright install chromium ou pnpm dlx playwright');
}
const { chromium } = await loadPlaywright();
const BASE = process.env.BASE_URL ?? 'http://localhost:8787';
const OUT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..', 'docs', 'screenshots');
await fs.mkdir(OUT, { recursive: true });

const browser = await chromium.launch(process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : {});
const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true, locale: 'pt-BR', geolocation: { latitude: -9.9075, longitude: -63.0415 }, permissions: ['geolocation'] });
const page = await ctx.newPage();
page.setDefaultTimeout(20000);
const shot = async (name) => { await page.waitForTimeout(900); await page.screenshot({ path: path.join(OUT, `${name}.png`) }); console.log('ok', name); };
const loginAs = async (name) => {
  await page.goto(`${BASE}/entrar`);
  await page.keyboard.press('Escape');
  await page.fill('input[placeholder="Marina Castro"]', name);
  await page.click('button:has-text("Entrar e garimpar")');
  await page.waitForURL(`${BASE}/`);
};

await page.goto(`${BASE}/entrar`);
await page.waitForSelector('text=Garimpa');
await shot('08-entrar');
await loginAs('marina');

await page.goto(`${BASE}/?q=garrafa`);
await page.waitForSelector('text=Tem em');
await shot('01-mapa-busca');

await page.goto(`${BASE}/garimpos`);
await page.waitForSelector('text=Garimpos');
await page.waitForSelector('a[href^="/g/"]');
await shot('02-garimpos');

const resolved = await page.$eval('a[href^="/g/"]', (a) => a.getAttribute('href'));
await page.goto(`${BASE}/garimpos`);
await page.click('button:has-text("Achados")');
await page.waitForSelector('a[href^="/g/"]');
const achado = await page.$eval('a[href^="/g/"]', (a) => a.getAttribute('href'));
await page.goto(`${BASE}${achado}`);
await page.waitForSelector('text=pista');
await shot('03-pergunta');

await page.goto(`${BASE}/perguntar?title=garrafa%20hermetica`);
await page.waitForSelector('text=Já garimparam isso');
await shot('04-perguntar');

// Fluxo de resposta: pergunta aberta de outra pessoa (Taís entra para responder)
await loginAs('lucas');
await page.goto(`${BASE}/garimpos`);
await page.click('button:has-text("Procurando")');
await page.waitForSelector('a[href^="/g/"]');
const links = await page.$$eval('a[href^="/g/"]', (as) => as.map((a) => a.getAttribute('href')));
let answered = false;
for (const l of links) {
  await page.goto(`${BASE}${l}/responder`);
  if (page.url().includes('/entrar')) break;
  const ok = await page.waitForSelector('text=Em qual lugar você viu?', { timeout: 5000 }).catch(() => null);
  if (!ok) continue;
  await page.waitForSelector('li button', { timeout: 8000 }).catch(() => null);
  const btn = await page.$('li button');
  if (!btn) continue;
  await btn.click();
  await page.waitForSelector('text=Mostre a prova');
  const png = await fs.readFile(path.join(OUT, '..', '..', 'web', 'public', 'icons', 'og.png'));
  await page.setInputFiles('input[type=file]', { name: 'prova.png', mimeType: 'image/png', buffer: png });
  await page.waitForSelector('text=Foto enviada', { timeout: 20000 }).catch(() => null);
  await shot('05-prova');
  answered = true;
  break;
}
if (!answered) console.warn('fluxo de prova não capturado');

await loginAs('tais');
await page.goto(`${BASE}/perfil`);
await page.keyboard.press('Escape');
await page.waitForSelector('text=Minhas pepitas');
await shot('06-perfil');

await page.goto(`${BASE}/ranking?period=geral`);
await page.waitForSelector('text=Ranking');
await page.click('button:has-text("Desde o início")');
await page.waitForTimeout(1200);
await shot('07-ranking');

const dark = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, colorScheme: 'dark', locale: 'pt-BR' });
const dp = await dark.newPage();
await dp.goto(`${BASE}/garimpos`);
await dp.waitForSelector('a[href^="/g/"]');
await dp.waitForTimeout(800);
await dp.screenshot({ path: path.join(OUT, '09-garimpos-escuro.png') });
console.log('ok 09-garimpos-escuro');
await browser.close();
