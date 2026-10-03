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
const credits = () => page.$eval('[data-testid=credits]', (el) => Number(el.textContent.replace(/\D/g, '')));

async function loginAs(name) {
  await page.goto(`${BASE}/#/entrar`);
  await page.waitForSelector('input[placeholder="Marina Castro"]');
  await page.fill('input[placeholder="Marina Castro"]', name);
  await page.click('button[type=submit]:has-text("Continuar")');
  await page.waitForURL((u) => !u.hash.startsWith('#/entrar'));
  step(`entrou como ${name}`);
}

// 1. Lucas entra e abre uma missão aberta de outra pessoa
await page.goto(`${BASE}/#/entrar`);
await page.waitForSelector('text=O que você procura está mais perto.');
await shot('demo-00-boas-vindas');
await loginAs('lucas');
await page.waitForSelector('button[aria-label="Modo demonstração: saiba mais"]');
await page.waitForSelector('text=Já encontraram por aqui.');
await shot('demo-01-explorar');

await page.goto(`${BASE}/#/?q=garrafa`);
await page.waitForSelector('text=Perto. E já encontrado.');
await page.waitForSelector('text=/pistas? para sua busca/');
await shot('demo-12-busca');

await page.goto(`${BASE}/#/missoes`);
await page.waitForSelector('a[href^="#/m/"]');
await shot('demo-02-missoes');
await page.click('a[href^="#/m/"]:has-text("Guarda-chuva")');
await page.waitForSelector('button:has-text("Eu sei onde tem!")');
const qid = new URL(page.url()).hash.replace('#/m/', '');
step(`missão ${qid}`);
await shot('demo-03-missao');
await page.click('button:has-text("Eu sei onde tem!")');
await page.waitForSelector('text=Uma foto sua vale uma boa pista.');

// 2. Envia uma imagem PNG gerada (buffer) e declara autoria
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
step('evidência enviada com checklist');
await page.click('text=Esta evidência é minha');
await shot('demo-04-evidencia');
await page.click('button:has-text("Continuar")');

// 3. Escolhe um lugar da lista e detalha
await page.waitForSelector('text=Qual loja tem o produto?');
await page.waitForSelector('li button');
const placeName = await page.$eval('li button span span', (el) => el.textContent);
await page.click('li button');
await page.waitForSelector('text=Ajude quem vai lá');
step(`lugar: ${placeName}`);
await page.fill('textarea', 'Fica no corredor dos guarda-sóis, perto do caixa. Tem transparente e com borda colorida.');
await page.fill('input[placeholder="24,90"]', '39,90');
await page.click('button:has-text("Enviar para validação")');
await page.waitForSelector('text=/Boa! /');
await page.waitForSelector('text=+5 XP');
step('evidência enviada (+5 XP)');
await shot('demo-05-conquista');

// 4. Marina (autora) aceita e agradece
await loginAs('marina');
await page.goto(`${BASE}/#/m/${qid}`);
await page.waitForSelector('button:has-text("Foi aqui que encontrei")');
await page.click('button:has-text("Foi aqui que encontrei")');
await page.waitForSelector('text=Agradecer com pepitas');
const toast = await page.waitForSelector('text=/ganhou [0-9]+ pepitas/'); const toastText = await toast.textContent(); if (!/ganhou 55 pepitas/.test(toastText)) throw new Error('toast inesperado: ' + toastText);
step('evidência aceita: ' + toastText.trim());
await page.click('[role=dialog] button:has-text("10")');
await page.waitForSelector('text=Agradecimento de 10 pepitas enviado.');
step('agradecimento de 10 enviado');
await page.waitForSelector('[role=dialog]', { state: 'detached' });
await page.waitForSelector('text=Encontrado');
await shot('demo-06-missao-encontrada');

// 5. Lucas vê as pepitas em carência e simula 7 dias
await loginAs('lucas');
await page.goto(`${BASE}/#/carteira`);
await page.waitForSelector('text=em carência');
const pendingText = await page.$eval('text=em carência', (el) => el.textContent);
step(`carteira: ${pendingText.trim()}`);
if (!/\+75 em carência/.test(pendingText)) throw new Error(`esperava +75 em carência, veio: ${pendingText}`);
const creditsBefore = await credits();
step(`pepitas disponíveis antes: ${creditsBefore}`);
await page.waitForSelector('text=Agradecimento de 10 pepitas enviado.', { state: 'detached', timeout: 8000 }).catch(() => {});
await shot('demo-07-carteira-carencia');

await page.click('button[aria-label="Modo demonstração: saiba mais"]');
await page.waitForSelector('button:has-text("Simular 7 dias")');
await page.click('button:has-text("Simular 7 dias")');
await page.waitForSelector('text=Sete dias depois');
await page.waitForSelector('text=em carência', { state: 'detached' });
await page.waitForFunction((before) => {
  const el = document.querySelector('[data-testid=credits]');
  return el && Number(el.textContent.replace(/\D/g, '')) === before + 75;
}, creditsBefore);
const creditsAfter = await credits();
step(`pepitas disponíveis depois: ${creditsAfter}`);
if (creditsAfter !== creditsBefore + 75) throw new Error(`esperava ${creditsBefore + 75}, veio ${creditsAfter}`);
// A sequência de 7 dias (XP de streak + Maratonista) faz Lucas subir de patente: a cerimônia abre e precisa ser fechada.
const levelUp = await page.waitForSelector('text=Nova patente', { timeout: 5000 }).catch(() => null);
if (levelUp) {
  const name = await page.$eval('[role=dialog] h2', (el) => el.textContent);
  await shot('demo-08-nova-patente');
  await page.click('button:has-text("Continuar ajudando")');
  await page.waitForSelector('[role=dialog]', { state: 'detached' });
  step(`subiu de patente: ${name}`);
}

// 6. Jornada: patente, árvore de níveis e ranking
await page.goto(`${BASE}/#/jornada`);
await page.waitForSelector('text=Sua árvore de conquistas');
const streak = await page.$eval('text=/dias seguidos ajudando/', (el) => el.textContent).catch(() => null);
step(`sequência: ${streak ?? 'não exibida'}`);
await page.waitForSelector('text=Quem mais ajudou');
await page.waitForSelector('.grid-cols-3 .font-display');
await page.click('button:has-text("Geral")');
await page.waitForSelector('.grid-cols-3 .font-display');
step('ranking carregou (semana e geral)');
await shot('demo-09-jornada');

// 7. Deduplicação e persistência após recarregar
await page.goto(`${BASE}/#/missoes/nova?title=garrafa%20hermetica`);
await page.waitForSelector('text=/Encontramos (uma|\\d+) miss/');
step('dedupe: missão parecida aparece antes de publicar');
await shot('demo-10-nova-missao');
await page.reload();
await page.goto(`${BASE}/#/m/${qid}`);
await page.waitForSelector('text=Encontrado');
await page.waitForSelector('text=Lucas Ferreira');
step('estado persistiu após recarregar (evidência aceita continua lá)');

const dark = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, colorScheme: 'dark', locale: 'pt-BR' });
const dp = await dark.newPage();
await dp.goto(`${BASE}/#/missoes`);
await dp.waitForSelector('a[href^="#/m/"]');
await dp.waitForTimeout(800);
await dp.screenshot({ path: path.join(OUT, 'demo-11-missoes-escuro.png') });
step('captura demo-11-missoes-escuro');

await browser.close();
if (errors.length) { console.log('ERROS DE PÁGINA:'); for (const e of errors) console.log('  ', e); process.exit(1); }
console.log('SMOKE OK');
