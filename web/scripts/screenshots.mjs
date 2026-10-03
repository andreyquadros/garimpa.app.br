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
  await page.click('button[type=submit]:has-text("Continuar")');
  await page.waitForURL(`${BASE}/`);
};

await page.goto(`${BASE}/entrar`);
await page.waitForSelector('text=O que você procura está mais perto.');
await shot('00-boas-vindas');
await loginAs('marina');

await page.waitForSelector('text=Já encontraram por aqui.');
await shot('01-explorar');

await page.goto(`${BASE}/?q=garrafa`);
await page.waitForSelector('text=Perto. E já encontrado.');
await page.waitForSelector('text=/pistas? para sua busca/');
await shot('02-busca');

await page.goto(`${BASE}/missoes`);
await page.waitForSelector('text=O que a cidade procura agora.');
await page.waitForSelector('a[href^="/m/"]');
await shot('03-missoes');

await page.goto(`${BASE}/missoes?tab=resolvida`);
await page.waitForSelector('a[href^="/m/"]');
const found = await page.$eval('a[href^="/m/"]', (a) => a.getAttribute('href'));
await page.goto(`${BASE}${found}`);
await page.waitForSelector('text=pista');
await shot('04-missao');

await page.goto(`${BASE}/missoes/nova?title=garrafa%20hermetica`);
await page.waitForSelector('text=/Encontramos (uma|\\d+) miss/');
await shot('05-nova-missao');

// Fluxo de evidência: missão aberta de outra pessoa (Lucas entra para colaborar)
await loginAs('lucas');
await page.goto(`${BASE}/missoes`);
await page.click('button:has-text("Procurando")');
await page.waitForSelector('a[href^="/m/"]');
const links = await page.$$eval('a[href^="/m/"]', (as) => as.map((a) => a.getAttribute('href')));
let answered = false;
for (const l of links) {
  await page.goto(`${BASE}${l}/evidencia`);
  if (page.url().includes('/entrar')) break;
  const ok = await page.waitForSelector('text=Uma foto sua vale uma boa pista.', { timeout: 5000 }).catch(() => null);
  if (!ok) continue;
  const png = await fs.readFile(path.join(OUT, '..', '..', 'web', 'public', 'icons', 'og.png'));
  await page.setInputFiles('input[type=file]', { name: 'prova.png', mimeType: 'image/png', buffer: png });
  await page.waitForSelector('text=Foto enviada', { timeout: 20000 }).catch(() => null);
  await page.click('text=Esta evidência é minha');
  await shot('06-evidencia');
  answered = true;
  break;
}
if (!answered) console.warn('fluxo de evidência não capturado');

await loginAs('tais');
await page.goto(`${BASE}/jornada`);
await page.keyboard.press('Escape');
await page.waitForSelector('text=Sua árvore de conquistas');
await page.waitForSelector('.grid-cols-3 .font-display');
await shot('07-jornada');

await page.goto(`${BASE}/carteira`);
await page.waitForSelector('text=Pepitas de agradecimento');
await shot('08-carteira');

const dark = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, colorScheme: 'dark', locale: 'pt-BR' });
const dp = await dark.newPage();
await dp.goto(`${BASE}/missoes`);
await dp.waitForSelector('a[href^="/m/"]');
await dp.waitForTimeout(800);
await dp.screenshot({ path: path.join(OUT, '09-missoes-escuro.png') });
console.log('ok 09-missoes-escuro');
await browser.close();
