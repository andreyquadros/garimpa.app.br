# Teste de ponta a ponta do fluxo principal — plano de implementação

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Um teste Playwright que percorre, no navegador, o fluxo principal (entrar → abrir missão → enviar evidência → confirmar → aceitar) contra a API e o banco reais, rodando no CI.

**Architecture:** `@playwright/test` no pacote `web`. O `globalSetup` recria um banco próprio (`garimpa_e2e`) e aplica as migrações; o `webServer` do Playwright sobe a API (`:8787`, login de desenvolvimento ligado) e o Vite (`:5173`, com proxy para a API). Cada pessoa do fluxo é um contexto de navegador separado (cookie, localStorage e id de dispositivo próprios). O estado final é conferido pela API, não por textos de tela.

**Tech Stack:** `@playwright/test` 1.63.0 (Chromium), Vite 8, API Hono, PostgreSQL 18 + PostGIS.

**Spec:** `docs/adr/0005-tdd.md` (item "Ponta a ponta"), `docs/adr/0004-hooks-e-ci.md`; regras em `CLAUDE.md`.

**Branch / PR:** `test/e2e-fluxo-principal`, a partir da `main` depois do merge de `feat/postgis` (o CI já usa a imagem do PostGIS).

## Global Constraints

- Versão exata: `@playwright/test@1.63.0` (`pnpm --filter garimpa-web add -D -E`).
- Só Chromium.
- Banco do teste: `postgres://postgres@127.0.0.1:54329/garimpa_e2e` (variável `DATABASE_URL_E2E`), nunca o `garimpa` de desenvolvimento.
- O login de desenvolvimento só existe fora de produção (`NODE_ENV` ≠ `production`); o teste não muda essa regra.
- Nada de `waitForTimeout`: só esperas automáticas do Playwright (`expect(...).toBeVisible()`, `waitForResponse`).

## Review Focus

- **Mesmo IP para todos os contextos:** a API vê conluio "fraco" (mesma rede) entre as pessoas do teste; isso só alonga a carência e não bloqueia o aceite → o teste confere status, não pepitas liberadas.
- **Id de dispositivo:** cada contexto precisa do próprio `localStorage`; se dois contextos compartilharem o id, a API marca conluio "forte" e zera as pepitas → contextos separados (nunca páginas do mesmo contexto) e asserção de que `collusion` não é `"forte"` na resposta do aceite.
- **Geolocalização:** a tela de evidência pede posição; sem permissão o fluxo trava → `geolocation` e `permissions: ['geolocation']` em cada contexto, no centro de Ariquemes.
- **Foto de prova:** precisa ser um JPEG válido e diferente a cada execução (a API recusa foto repetida de outra pessoa) → imagem gerada em tempo de execução com ruído aleatório (`DATABASE_URL_E2E` tem padrão local; no CI vem do ambiente).
- **Rodar duas vezes seguidas:** o banco `garimpa_e2e` é recriado no `globalSetup`, então a segunda execução não colide com a primeira → verificação na Task 2.

---

### Task 1: Playwright configurado

**Files:**
- Create: `web/playwright.config.ts`, `web/e2e/global-setup.ts`
- Modify: `web/package.json` (script `"test:e2e": "playwright test"`), `pnpm-lock.yaml`, `.gitignore` (`web/test-results/`, `web/playwright-report/`), `biome.jsonc` (excluir as duas pastas, se necessário)

**Interfaces:**
- Produces: `pnpm --filter garimpa-web test:e2e`; `globalSetup` exportando `default async function setup(): Promise<void>` que cria `garimpa_e2e` se não existir, faz `drop schema public cascade; create schema public;`, e chama `migrate` e `ensureCity` de `api/src/db.ts` (importação relativa `../../api/src/db.ts`, como o `api/test/global-setup.ts`).

- [ ] **Step 1:** `pnpm --filter garimpa-web add -D -E @playwright/test@1.63.0` e `pnpm --filter garimpa-web exec playwright install chromium`.
- [ ] **Step 2:** `playwright.config.ts`: `testDir: 'e2e'`, `globalSetup: './e2e/global-setup.ts'`, `use.baseURL: 'http://localhost:5173'`, `use.trace: 'retain-on-failure'`, `projects` só `chromium`, `workers: 1`. `webServer` com dois itens: API (`command: 'pnpm --filter garimpa-api exec tsx src/main.ts'`, `url: 'http://localhost:8787/api/health'`, `env: { DATABASE_URL: <DATABASE_URL_E2E>, UPLOAD_DIR: <pasta temporária>, NODE_ENV: 'test' }`) e Vite (`command: 'pnpm --filter garimpa-web dev'`, `url: 'http://localhost:5173'`); `reuseExistingServer: !process.env.CI`.
- [ ] **Step 3:** Teste mínimo `e2e/smoke.spec.ts`: abre `/entrar` e espera o campo do login de desenvolvimento. `pnpm --filter garimpa-web test:e2e` → passa.
- [ ] **Step 4: Commit** `test: configura o Playwright para testes de ponta a ponta`

### Task 2: Fluxo principal

**Files:**
- Create: `web/e2e/fluxo-principal.spec.ts`, `web/e2e/support.ts`
- Delete: `web/e2e/smoke.spec.ts` (coberto pelo fluxo)

**Interfaces:**
- Produces, em `web/e2e/support.ts`:
  - `newPerson(browser: Browser, name: string): Promise<Page>` — contexto novo com `geolocation: { latitude: -9.9075, longitude: -63.0415 }` e `permissions: ['geolocation']`, faz o login de desenvolvimento com `name` pela tela `/entrar` e devolve a página já logada.
  - `randomJpeg(page: Page): Promise<Buffer>` — JPEG 256×256 com ruído aleatório, gerado com `canvas` do próprio navegador (`page.evaluate` + `canvas.toDataURL('image/jpeg')`) para não adicionar dependência.

O teste descreve um fluxo que já existe; ele precisa passar com o código atual. Para provar que ele detecta falhas, a Step 3 o quebra de propósito.

- [ ] **Step 1: Escrever o teste** `'missão vai de aberta a resolvida pelo navegador'`, com um `tag` aleatório no título:
  1. `autora = newPerson(browser, 'Autora <tag>')`: abre `/missoes/nova`, preenche o título `Garrafa térmica azul <tag>`, publica (botão "Publicar missão"); guarda o id da URL `/m/:id`.
  2. `respondente`: abre `/m/:id/evidencia`, anexa `randomJpeg(page)` no campo (`setInputFiles({ name: 'prova.jpg', mimeType: 'image/jpeg', buffer })`) de arquivo, cadastra um lugar novo `Loja <tag>` perto do centro, envia; espera a resposta `POST /api/questions/:id/answers` com status 201.
  3. `conf1` e `conf2`: cada um abre `/m/:id` e confirma a evidência; espera `POST /api/answers/:aid/confirm` com 200.
  4. `autora` recarrega `/m/:id`, toca em "Foi aqui que encontrei"; espera `POST /api/questions/:id/accept` com 200 e `collusion` diferente de `"forte"` no corpo.
  5. Asserções finais via `autora.request.get('/api/questions/:id')`: `question.status === 'resolvida'`, a resposta com `status === 'aceita'` e `confirms >= 2`.
  Seletores: por papel e texto visível (`getByRole`, `getByLabel`, `getByText`), lidos das páginas `Ask.tsx`, `Answer.tsx` e `Question.tsx`; sem classes CSS.
- [ ] **Step 2:** `pnpm --filter garimpa-web test:e2e` → passa. Rodar de novo em seguida → passa (banco recriado).
- [ ] **Step 3: Provar que o teste pega regressão:** comentar temporariamente a linha `update answers set status = 'aceita'` em `api/src/routes/questions.ts`, rodar → falha na asserção de `status === 'aceita'`; desfazer a mudança.
- [ ] **Step 4:** `pnpm check:ci` e `pnpm --filter garimpa-web typecheck` passam.
- [ ] **Step 5: Commit** `test: cobre o fluxo principal da missão no navegador`

### Task 3: CI e documentação

**Files:**
- Modify: `.github/workflows/ci.yml`, `CLAUDE.md`, `docs/adr/0005-tdd.md`

- [ ] **Step 1:** Job novo `e2e` (depois de `test`, `needs: test`), com o mesmo serviço PostGIS na porta 54329: `pnpm install --frozen-lockfile`; `pnpm --filter garimpa-web exec playwright install --with-deps chromium`; `pnpm --filter garimpa-web test:e2e` com `DATABASE_URL_E2E: postgres://postgres:postgres@127.0.0.1:54329/garimpa_e2e`; em falha, `actions/upload-artifact` com `web/playwright-report` e `web/test-results`.
- [ ] **Step 2:** `CLAUDE.md`: comando `pnpm --filter garimpa-web test:e2e` (precisa do Postgres local); regra "mudou o fluxo principal → atualizar `web/e2e/fluxo-principal.spec.ts`". ADR-0005: Playwright implantado.
- [ ] **Step 3: Commits separados:** `ci: roda o teste de ponta a ponta no CI` e `docs: documenta o teste de ponta a ponta`.
- [ ] **Step 4:** Mostrar ao Julio o resumo do PR e pedir confirmação para push e PR; conferir o job `e2e` verde no PR.
