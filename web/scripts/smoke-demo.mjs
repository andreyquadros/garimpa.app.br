// Smoke test headless do modo demonstração (web/dist-demo servido em http://127.0.0.1:4173).
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

async function loadPlaywright() {
  for (const spec of ['playwright', '/opt/node-tools/node_modules/playwright/index.mjs', '/opt/node22/lib/node_modules/playwright/index.mjs']) {
    try { return await import(spec); } catch { /* tenta o próximo */ }
  }
  throw new Error('playwright não encontrado: pnpm dlx playwright install chromium');
}
const { chromium } = await loadPlaywright();
const BASE = process.env.BASE_URL ?? 'http://127.0.0.1:4173';
const OUT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..', 'docs', 'screenshots');
await fs.mkdir(OUT, { recursive: true });

const browser = await chromium.launch();
const ctx = await browser.newContext({
  viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true, locale: 'pt-BR',
  geolocation: { latitude: -9.9075, longitude: -63.0415 }, permissions: ['geolocation'],
});
const page = await ctx.newPage();
page.setDefaultTimeout(20000);
const errors = [];
page.on('pageerror', (e) => { errors.push(`pageerror: ${e.message}`); });
page.on('console', (m) => { if (m.type() === 'error' && !/tile|ERR_|net::|Failed to load resource/i.test(m.text())) errors.push(`console: ${m.text()}`); });

const step = (msg) => console.log('·', msg);
const shot = async (name) => { await page.waitForTimeout(700); await page.screenshot({ path: path.join(OUT, `${name}.png`) }); step(`captura ${name}`); };

async function loginAs(name) {
  await page.goto(`${BASE}/#/entrar`);
  await page.waitForSelector('input[placeholder="Marina Castro"]');
  await page.fill('input[placeholder="Marina Castro"]', name);
  await page.click('button:has-text("Entrar e garimpar")');
  await page.waitForURL((u) => !u.hash.startsWith('#/entrar'));
  step(`entrou como ${name}`);
}

// 1. Lucas entra e abre uma pergunta aberta de outra pessoa
await page.goto(`${BASE}/#/entrar`);
await page.waitForSelector('text=Garimpa');
await loginAs('lucas');
await page.waitForSelector('button[aria-label="Modo demonstração: saiba mais"]');
await page.waitForSelector('text=Demonstração');
await shot('demo-01-mapa');

await page.goto(`${BASE}/#/garimpos`);
await page.waitForSelector('a[href^="#/g/"]');
await page.click('a[href^="#/g/"]:has-text("Guarda-chuva")');
await page.waitForSelector('button:has-text("Eu sei onde tem!")');
const qid = new URL(page.url()).hash.replace('#/g/', '');
step(`pergunta ${qid}`);
await page.click('button:has-text("Eu sei onde tem!")');
await page.waitForSelector('text=Em qual lugar você viu?');

// 2. Escolhe um lugar da lista
await page.waitForSelector('li button');
const placeName = await page.$eval('li button span span', (el) => el.textContent);
await page.click('li button');
await page.waitForSelector('text=Mostre a prova');
step(`lugar: ${placeName}`);

// 3. Envia uma imagem PNG gerada (buffer)
const dataUrl = await page.evaluate(() => {
  const c = document.createElement('canvas'); c.width = 640; c.height = 480;
  const x = c.getContext('2d');
  const rnd = () => `hsl(${Math.floor(Math.random() * 360)} 70% 45%)`;
  const g = x.createLinearGradient(0, 0, 640, 480); g.addColorStop(0, rnd()); g.addColorStop(1, rnd());
  x.fillStyle = g; x.fillRect(0, 0, 640, 480);
  for (let i = 0; i < 14; i++) { x.fillStyle = rnd(); x.beginPath(); x.arc(Math.random() * 640, Math.random() * 480, 20 + Math.random() * 90, 0, 7); x.fill(); }
  x.fillStyle = '#fff'; x.font = 'bold 40px sans-serif'; x.fillText(`prova ${Date.now()}`, 30, 440);
  return c.toDataURL('image/png');
});
const png = Buffer.from(dataUrl.split(',')[1], 'base64');
await page.setInputFiles('input[type=file]', { name: 'prova.png', mimeType: 'image/png', buffer: png });
await page.waitForSelector('text=Foto enviada e limpa de dados pessoais');
await page.waitForSelector('text=Enviada com a sua localização');
step('prova enviada com checklist');
await page.click('button:has-text("Continuar")');
await page.waitForSelector('text=Ajude quem vai lá');
await page.fill('textarea', 'Fica no corredor dos guarda-sóis, perto do caixa. Tem transparente e com borda colorida.');
await page.fill('input[placeholder="24,90"]', '39,90');
await page.click('button:has-text("Enviar pista")');
await page.waitForSelector('text=Pista enviada');
await page.waitForSelector('text=+5 XP');
step('pista enviada (+5 XP)');

// 4. Marina (autora) aceita e dá gorjeta
await loginAs('marina');
await page.goto(`${BASE}/#/g/${qid}`);
await page.waitForSelector('button:has-text("Foi aqui que achei")');
await page.click('button:has-text("Foi aqui que achei")');
await page.waitForSelector('text=Dar gorjeta');
const toast = await page.waitForSelector('text=/ganhou [0-9]+ pepitas/'); const toastText = await toast.textContent(); if (!/ganhou 55 pepitas/.test(toastText)) throw new Error('toast inesperado: ' + toastText);
step('resposta aceita: ' + toastText.trim());
await page.click('[role=dialog] button:has-text("10")');
await page.waitForSelector('text=Gorjeta de 10 pepitas enviada.');
step('gorjeta de 10 enviada');
await page.waitForSelector('[role=dialog]', { state: 'detached' });
await page.waitForSelector('text=Achado');
await shot('demo-02-pergunta-aceita');

// 5. Lucas vê as pepitas em carência e simula 7 dias
await loginAs('lucas');
await page.goto(`${BASE}/#/perfil`);
await page.waitForSelector('text=em carência');
const pendingText = await page.$eval('text=em carência', (el) => el.textContent);
step(`perfil: ${pendingText.trim()}`);
if (!/\+75 em carência/.test(pendingText)) throw new Error(`esperava +75 em carência, veio: ${pendingText}`);
const creditsBefore = Number((await page.$eval('section:has-text("Minhas pepitas") span.text-4xl span', (el) => el.textContent)).replace(/\D/g, ''));
step(`pepitas disponíveis antes: ${creditsBefore}`);
await page.waitForSelector('text=Gorjeta de 10 pepitas enviada.', { state: 'detached', timeout: 8000 }).catch(() => {});
await shot('demo-03-perfil-carencia');

await page.click('button[aria-label="Modo demonstração: saiba mais"]');
await page.waitForSelector('button:has-text("Simular 7 dias")');
await page.click('button:has-text("Simular 7 dias")');
await page.waitForSelector('text=Sete dias depois');
await page.waitForSelector('text=em carência', { state: 'detached' });
await page.waitForFunction((before) => {
  const el = document.querySelector('section span.text-4xl span');
  return el && Number(el.textContent.replace(/\D/g, '')) === before + 75;
}, creditsBefore);
const creditsAfter = Number((await page.$eval('section:has-text("Minhas pepitas") span.text-4xl span', (el) => el.textContent)).replace(/\D/g, ''));
step(`pepitas disponíveis depois: ${creditsAfter}`);
if (creditsAfter !== creditsBefore + 75) throw new Error(`esperava ${creditsBefore + 75}, veio ${creditsAfter}`);
// A sequência de 7 dias (XP de streak + Maratonista) faz Lucas subir de nível: a cerimônia abre e precisa ser fechada.
const levelUp = await page.waitForSelector('text=Você subiu de nível', { timeout: 5000 }).catch(() => null);
if (levelUp) {
  const name = await page.$eval('[role=dialog] h2', (el) => el.textContent);
  await page.click('button:has-text("Bora garimpar")');
  await page.waitForSelector('[role=dialog]', { state: 'detached' });
  step(`subiu de nível: ${name}`);
}
const streak = await page.$eval('text=/dias seguidos garimpando/', (el) => el.textContent).catch(() => null);
step(`sequência: ${streak ?? 'não exibida'}`);

// 6. Deduplicação, ranking e persistência após recarregar
await page.goto(`${BASE}/#/perguntar?title=garrafa%20hermetica`);
await page.waitForSelector('text=Já garimparam isso');
step('dedupe: "Já garimparam isso" aparece');
await page.goto(`${BASE}/#/ranking`);
await page.waitForSelector('text=Esta semana');
await page.waitForSelector('.grid-cols-3 .font-display');
await page.click('button:has-text("Desde o início")');
await page.waitForSelector('text=Lucas');
step('ranking carregou (semana e geral)');
await page.reload();
await page.goto(`${BASE}/#/g/${qid}`);
await page.waitForSelector('text=Achado');
await page.waitForSelector('text=Lucas Ferreira');
step('estado persistiu após recarregar (resposta aceita continua lá)');

await browser.close();
if (errors.length) { console.log('ERROS DE PÁGINA:'); for (const e of errors) console.log('  ', e); process.exit(1); }
console.log('SMOKE OK');
