import { expect, test } from '@playwright/test';

test('a tela de entrada mostra o login de desenvolvimento', async ({ page }) => {
  await page.goto('/entrar');
  await expect(page.getByLabel('Seu nome')).toBeVisible();
});
