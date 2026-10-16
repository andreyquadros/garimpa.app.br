import { expect, type Page, test } from '@playwright/test';
import { newPerson, randomJpeg } from './support.ts';

/** Espera a próxima resposta de `method path` (path exato, sem query). */
function nextResponse(page: Page, method: string, path: string) {
  return page.waitForResponse((r) => r.request().method() === method && new URL(r.url()).pathname === path);
}

test('missão vai de aberta a resolvida pelo navegador', async ({ browser }) => {
  // Tag aleatória: títulos e nomes diferentes a cada execução, sem colidir com a detecção de missões parecidas.
  const tag = Math.random().toString(36).slice(2, 8);

  // 1. A autora abre a missão.
  const autora = await newPerson(browser, `Autora ${tag}`);
  await autora.goto('/missoes/nova');
  await autora.getByLabel('O que você está procurando?').fill(`Garrafa térmica azul ${tag}`);
  await autora.getByRole('button', { name: 'Publicar missão' }).click();
  await expect(autora).toHaveURL(/\/m\/[0-9a-f-]{36}$/);
  const id = new URL(autora.url()).pathname.split('/').pop()!;

  // 2. Outra pessoa responde com prova própria e um lugar novo, cadastrado pelo formulário (sem clicar no mapa).
  const respondente = await newPerson(browser, `Respondente ${tag}`);
  await respondente.goto(`/m/${id}/evidencia`);
  await respondente
    .getByLabel(/Anexar evidência/)
    .setInputFiles({ name: 'prova.jpg', mimeType: 'image/jpeg', buffer: await randomJpeg(respondente) });
  await expect(respondente.getByRole('img', { name: 'Evidência 1' })).toBeVisible();
  await respondente.getByText('Esta evidência é minha e removi dados pessoais.').click();
  await respondente.getByRole('button', { name: 'Continuar' }).click();
  await respondente.getByRole('button', { name: /marcar lugar novo no mapa/ }).click();
  await respondente.getByLabel('Nome do lugar').fill(`Loja ${tag}`);
  await respondente.getByRole('button', { name: 'Usar este lugar' }).click();
  const answered = nextResponse(respondente, 'POST', `/api/questions/${id}/answers`);
  await respondente.getByRole('button', { name: 'Enviar para validação' }).click();
  const answerRes = await answered;
  expect(answerRes.status()).toBe(201);
  const { answerId } = (await answerRes.json()) as { answerId: string };

  // 3. Duas pessoas confirmam no local: peso 1 cada, o mínimo para a descoberta ficar confirmada.
  for (const name of [`Conf1 ${tag}`, `Conf2 ${tag}`]) {
    const conf = await newPerson(browser, name);
    await conf.goto(`/m/${id}`);
    const confirmed = nextResponse(conf, 'POST', `/api/answers/${answerId}/confirm`);
    await conf.getByRole('button', { name: 'Confirmo, tem lá' }).click();
    expect((await confirmed).status()).toBe(200);
  }

  // 4. A autora aceita. Contas em contextos distintos (aparelhos distintos) não podem cair em conluio forte.
  await autora.reload();
  const accepted = nextResponse(autora, 'POST', `/api/questions/${id}/accept`);
  await autora.getByRole('button', { name: 'Foi aqui que encontrei' }).click();
  const acceptRes = await accepted;
  expect(acceptRes.status()).toBe(200);
  expect(((await acceptRes.json()) as { collusion: string | null }).collusion).not.toBe('forte');

  // 5. O estado final vem da API, não da tela.
  const res = await autora.request.get(`/api/questions/${id}`);
  expect(res.ok()).toBe(true);
  const body = (await res.json()) as {
    question: { status: string };
    answers: Array<{ id: string; status: string; confirms: number }>;
  };
  expect(body.question.status).toBe('resolvida');
  const answer = body.answers.find((a) => a.id === answerId);
  expect(answer?.status).toBe('aceita');
  expect(answer?.confirms).toBeGreaterThanOrEqual(2);
});
