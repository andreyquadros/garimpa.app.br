import { type Browser, expect, type Page } from '@playwright/test';

/** Centro de Ariquemes: a cidade do piloto, onde ficam as lojas e as confirmações "no local". */
const ARIQUEMES = { latitude: -9.9075, longitude: -63.0415 };

/**
 * Uma pessoa = um contexto novo do navegador. Cada contexto tem o próprio `localStorage`, logo o próprio
 * `x-garimpa-device`: sem isso o antifraude veria todas as contas no mesmo aparelho (conluio forte).
 */
export async function newPerson(browser: Browser, name: string): Promise<Page> {
  const context = await browser.newContext({ geolocation: ARIQUEMES, permissions: ['geolocation'] });
  const page = await context.newPage();
  await page.goto('/entrar');
  await page.getByLabel('Seu nome').fill(name);
  await page.getByRole('button', { name: 'Continuar' }).click();
  await expect(page).not.toHaveURL(/\/entrar/);
  return page;
}

/**
 * JPEG 256×256 de ruído, diferente a cada chamada: a API recusa a mesma foto vinda de outra pessoa (imagem
 * reutilizada), então uma imagem fixa no repositório faria o teste falhar na segunda execução contra o mesmo banco.
 */
export async function randomJpeg(page: Page): Promise<Buffer> {
  const dataUrl = await page.evaluate(() => {
    const canvas = document.createElement('canvas');
    canvas.width = 256;
    canvas.height = 256;
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('canvas 2d indisponível');
    const img = ctx.createImageData(256, 256);
    for (let i = 0; i < img.data.length; i += 4) {
      img.data[i] = Math.floor(Math.random() * 256);
      img.data[i + 1] = Math.floor(Math.random() * 256);
      img.data[i + 2] = Math.floor(Math.random() * 256);
      img.data[i + 3] = 255;
    }
    ctx.putImageData(img, 0, 0);
    return canvas.toDataURL('image/jpeg');
  });
  return Buffer.from(dataUrl.slice(dataUrl.indexOf(',') + 1), 'base64');
}

/**
 * Num celular de 360 px, com a pessoa logada, o cabeçalho (sequência, XP, sininho, avatar) cabe sem rolagem lateral
 * e o avatar, atalho da Carteira, fica dentro da tela. Volta ao tamanho anterior no fim.
 */
export async function expectHeaderFitsPhone(page: Page): Promise<void> {
  const before = page.viewportSize();
  await page.setViewportSize({ width: 360, height: 740 });
  const avatar = page.getByRole('link', { name: 'Sua carteira' });
  await expect(avatar).toBeVisible();
  await expect(page.getByRole('link', { name: /^Notificações/ })).toBeVisible();
  const { scrollWidth, innerWidth } = await page.evaluate(() => ({
    scrollWidth: document.documentElement.scrollWidth,
    innerWidth: window.innerWidth,
  }));
  expect(scrollWidth).toBeLessThanOrEqual(innerWidth);
  const box = await avatar.boundingBox();
  expect(box).not.toBeNull();
  expect(box!.x).toBeGreaterThanOrEqual(0);
  expect(box!.x + box!.width).toBeLessThanOrEqual(innerWidth);
  if (before) await page.setViewportSize(before);
}
