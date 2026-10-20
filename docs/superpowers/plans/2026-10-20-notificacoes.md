# Notificações — plano de implementação

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Lista de notificações no app e Web Push com fila no Postgres para os avisos de resposta (nova evidência, evidência confirmada/aceita, gorjeta, pepitas liberadas).

**Architecture:** As escritas gravam linhas em `notifications` na mesma transação (`notify`); `fn_vest_due()` faz o mesmo para pepitas liberadas. Um remetente na API lê a fila com `FOR UPDATE SKIP LOCKED` e envia por Web Push (VAPID) através de uma interface `PushTransport`. O PWA passa a ter service worker próprio (`injectManifest`) para receber push; sininho, lista e pedido de permissão contextual.

**Tech Stack:** PostgreSQL 18, Hono, Postgres.js, `web-push` 3.6.7, React 19, vite-plugin-pwa (`injectManifest`), Workbox 7.4.1, Vitest, Testing Library, Playwright.

**Spec:** `docs/superpowers/specs/2026-10-20-notificacoes-design.md`

**Entrega:** PR 1 `docs/spec-notificacoes` (spec e plano, já na branch) → PR 2 `feat/notificacoes-eventos` (Tasks 1–3) → PR 3 `feat/notificacoes-push` (Tasks 4–5) → PR 4 `feat/notificacoes-app` (Tasks 6–7) → PR 5 `docs/notificacoes` (Task 8).

## Global Constraints

- Versões exatas (`-E`): `web-push@3.6.7`, `@types/web-push@3.6.4` (api); `workbox-precaching@7.4.1`, `workbox-routing@7.4.1`, `workbox-strategies@7.4.1`, `workbox-expiration@7.4.1`, `@testing-library/user-event@14.6.7` (web).
- `kind`: `nova_evidencia`, `evidencia_confirmada`, `evidencia_aceita`, `gorjeta_recebida`, `pepitas_liberadas`.
- `push_state`: `pendente`, `enviado`, `sem_assinatura`, `desativado`, `falhou`.
- Remetente: a cada 5 s, lote de 50, `FOR UPDATE SKIP LOCKED`; TTL 86400 s; `Topic` = `topic`; `urgency: normal`; esperas 1 min, 5 min, 30 min, 2 h; `falhou` na 5ª falha; 404/410 apaga a inscrição.
- Lista: páginas de 30; limpeza de notificações com mais de 90 dias; cartão de permissão some por 30 dias após "Agora não".
- Ninguém recebe aviso da própria ação. Nada destas rotas usa `cached` (ADR-0006).
- Textos para o usuário em português com acentuação; todos em `api/src/notifications/texts.ts`.
- Regras do `CLAUDE.md`: TDD, commits em português ≤ 72 caracteres, sem atribuição ao Claude, push/PR só com confirmação.

## Review Focus

- **Endereço de inscrição arbitrário (SSRF):** a API faz POST no `endpoint` que o navegador mandou; um cliente malicioso poderia apontar para `http://127.0.0.1:…` ou um host interno → só aceitar `https:` em hosts de serviços de push conhecidos (`fcm.googleapis.com`, `updates.push.services.mozilla.com`, `*.push.apple.com`, `*.notify.windows.com`, `*.push.services.mozilla.com`) → teste na Task 4.
- **Celular compartilhado:** B entra na conta no aparelho em que A estava inscrito; os avisos de A não podem chegar ao aparelho de B depois disso → teste na Task 4.
- **Conteúdo do usuário nos textos** (título da missão, nome da loja, nome de quem agradeceu): payload de push tem limite (~4 KB) e a lista não pode interpretar HTML → textos truncados (título 80, corpo 160 caracteres, com "…") e exibidos como texto puro → testes nas Tasks 1 e 7.
- **Destinatário removido ou banido:** conta excluída (`banned_at`) não recebe aviso novo nem push → testes nas Tasks 2 e 5.
- **Marcar como lidas com ids de outra pessoa:** nenhuma linha alheia muda → teste na Task 3.

---

### Task 1: Tabelas, textos, `notify` e pepitas liberadas (PR 2)

**Files:**
- Create: `db/migrations/0007_notificacoes.sql`, `api/src/notifications/texts.ts`, `api/src/notifications/store.ts`, `api/test/notificacoes-dados.test.ts`

**Interfaces:**
- Produces:
  - Tabelas `notifications` e `push_subscriptions` exatamente como na spec (seção Dados), com os dois índices.
  - `fn_vest_due()` recriada: além do que faz hoje (mesmo retorno), insere uma notificação `pepitas_liberadas` por pessoa com soma > 0 (`url` `/carteira`, `topic` `pepitas`, `ref_type` `ledger`, `ref_id` nulo), texto igual ao de `texts.pepitasLiberadas(n)` (o SQL monta a mesma frase: `N pepitas liberadas na sua carteira`; título `Pepitas liberadas`).
  - `texts.ts`: `export type NotificationText = { title: string; body: string }`; funções `novaEvidencia(tituloMissao: string, lugar: string)`, `evidenciaConfirmada(lugar: string)`, `evidenciaAceita(lugar: string, pepitas: number)`, `gorjetaRecebida(nome: string, pepitas: number)`, `pepitasLiberadas(pepitas: number)`, todas devolvendo `NotificationText` truncado (título ≤ 80, corpo ≤ 160, cortando com `…`).
  - `store.ts`: `export type NewNotification = { userId: string; kind: Kind; title: string; body: string; url: string; topic: string | null; refType: string; refId: string | null }`; `export async function notify(tx: Sql | Tx, rows: NewNotification[]): Promise<void>` (insert em lote; ignora `rows` vazias; nunca insere para usuário com `banned_at`).

- [ ] **Step 1: Testes** (`api/test/notificacoes-dados.test.ts`, Postgres real):
  - `'textos têm os modelos da spec'`: `novaEvidencia('Garrafa térmica azul', 'Loja X')` → `{ title: 'Nova pista para Garrafa térmica azul', body: 'Loja X' }` — formato: título `Nova pista para <missão>`, corpo `<lugar>`; `evidenciaConfirmada('Loja X')` → título `Sua pista foi confirmada`, corpo `Loja X`; `evidenciaAceita('Loja X', 60)` → título `Foi aqui que encontrei!`, corpo `Sua pista em Loja X foi escolhida (+60 pepitas)`; com 0 pepitas o corpo omite o parêntese; `gorjetaRecebida('Marina', 20)` → título `Agradecimento`, corpo `Marina agradeceu com 20 pepitas`; `pepitasLiberadas(120)` → título `Pepitas liberadas`, corpo `120 pepitas liberadas na sua carteira`.
  - `'textos longos são truncados'`: título de missão com 300 caracteres → `title.length <= 80` e termina com `…`; corpo ≤ 160.
  - `'notify grava em lote e ignora contas removidas'`: duas linhas (uma para usuário com `banned_at`) → só uma gravada, `push_state = 'pendente'`, `read_at` nulo.
  - `'fn_vest_due avisa uma vez por pessoa com a soma'`: dois lançamentos em carência (30 e 90) do mesmo usuário e um de outro, todos com `vests_at` no passado → após `select fn_vest_due()`: uma notificação `pepitas_liberadas` com corpo `120 pepitas liberadas na sua carteira` para o primeiro e uma para o segundo; o retorno da função continua sendo o número de lançamentos (3).
  - `'fn_vest_due sem nada a liberar não avisa'`.
- [ ] **Step 2:** `pnpm --filter garimpa-api exec vitest run test/notificacoes-dados.test.ts` → falha.
- [ ] **Step 3: Implementar** migração, `texts.ts` e `store.ts`.
- [ ] **Step 4:** teste focado e suíte da API verdes; `pnpm check:ci`, `pnpm typecheck`.
- [ ] **Step 5: Commit** `feat: adiciona as tabelas e o registro de notificações`.

### Task 2: Avisos nas escritas (PR 2)

**Files:**
- Modify: `api/src/routes/answers.ts` (criar resposta, confirmar, gorjeta), `api/src/routes/questions.ts` (aceite)
- Test: `api/test/notificacoes-eventos.test.ts`

**Interfaces:**
- Consumes: `notify`, `texts` (Task 1).

- [ ] **Step 1: Testes** (fluxos reais com `login`, `upload`, como em `api/test/flow.test.ts`):
  - `'nova evidência avisa autor e seguidores, não quem respondeu'`: A abre a missão, B segue, C responde → uma `nova_evidencia` para A e uma para B, nenhuma para C; `url` `/m/<qid>`, `topic` `missao-<qid>`, corpo com o nome do lugar.
  - `'quem segue e responde não é avisado da própria resposta'`: B segue e responde → nada para B.
  - `'confirmação avisa só na transição para confirmada'`: 1º voto (ainda pendente) → nenhuma; 2º voto (vira confirmada) → uma `evidencia_confirmada` para o autor da evidência; 3º voto → nenhuma nova.
  - `'aceite avisa o autor da evidência com as pepitas'`: corpo contém `(+<credits> pepitas)` igual ao `credits` da resposta da rota (sem parêntese quando 0).
  - `'gorjeta avisa quem recebeu'`: corpo `<nome de quem deu> agradeceu com 20 pepitas`.
  - `'escrita recusada não grava aviso'`: resposta duplicada (409) e confirmação na própria resposta (400) → contagem de notificações inalterada.
  - `'conta removida não recebe aviso'`: seguidor B exclui a conta; nova evidência → nada para B.
- [ ] **Step 2:** Rodar → falha.
- [ ] **Step 3: Implementar** chamadas a `notify(tx, …)` dentro das transações já existentes, depois da escrita do evento; destinatários = autor da missão + `question_followers` sem o autor da ação (sem duplicar o autor). Buscar título da missão e nome do lugar nas consultas que a rota já faz; acrescentar campos ao `select` existente em vez de nova ida ao banco quando possível.
- [ ] **Step 4:** testes focados, suíte da API e e2e verdes.
- [ ] **Step 5: Commit** `feat: avisa sobre evidências, confirmações, aceites e gorjetas`.

### Task 3: Rotas da lista, exclusão de conta e limpeza (PR 2)

**Files:**
- Create: `api/src/routes/notifications.ts`, `api/test/notificacoes-rotas.test.ts`
- Modify: `api/src/app.ts` (montar rotas), `api/src/routes/auth.ts` (`DELETE /account`), `api/src/jobs.ts` (`runTick`)

**Interfaces:**
- Produces: `GET /api/notifications?before=<ISO>` → `{ items: Array<{ id, kind, title, body, url, createdAt, readAt }>, unread: number, nextBefore: string | null }` (30 por página, mais novo primeiro, `nextBefore` = `createdAt` do último item quando vieram 30); `POST /api/notifications/read` corpo `{ ids?: string[] }` (zod, uuid, até 100) → `{ unread: number }`.

- [ ] **Step 1: Testes:**
  - `'lista pagina de 30 em 30 e conta não lidas'` (35 notificações: 1ª página 30 + `nextBefore`; 2ª página 5 + `nextBefore: null`; `unread: 35`).
  - `'marcar lidas por id e todas'` (`unread` cai; `read_at` preenchido).
  - `'não marca nem lista notificações de outra pessoa'`: ids de B no corpo de A → B continua com as suas não lidas; A não vê as de B.
  - `'exige login'` → 401 nas duas rotas.
  - `'excluir a conta apaga notificações e inscrições'`.
  - `'runTick apaga notificações com mais de 90 dias'` (uma com `created_at` = now − 91 dias some; uma com 89 fica).
- [ ] **Step 2:** Rodar → falha.
- [ ] **Step 3: Implementar.**
- [ ] **Step 4:** suíte da API verde; `pnpm check:ci`, `pnpm typecheck`.
- [ ] **Step 5: Commit** `feat: adiciona a lista de notificações e a limpeza de 90 dias`.

### Task 4: Inscrições e chaves VAPID (PR 3)

**Files:**
- Create: `api/src/routes/push.ts`, `api/src/push/endpoint.ts`, `api/test/push-inscricoes.test.ts`
- Modify: `api/src/config.ts` (`VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY`, `VAPID_SUBJECT`, opcionais; `pushEnabled` = as três presentes), `api/src/app.ts`, `api/src/cli.ts` (`push:keys`), `package.json` (raiz: `"push:keys": "pnpm --filter garimpa-api exec tsx src/cli.ts push:keys"`), `api/package.json`, `pnpm-lock.yaml`, `.env.example`

**Interfaces:**
- Produces: `GET /api/push/key` → `{ publicKey: string | null }`; `POST /api/push/subscriptions` (corpo `{ endpoint, keys: { p256dh, auth } }`) → 201; `DELETE /api/push/subscriptions` (corpo `{ endpoint }`) → 200; `export function isAllowedPushEndpoint(url: string): boolean` em `api/src/push/endpoint.ts`; `config.pushEnabled: boolean`.

- [ ] **Step 1:** `pnpm --filter garimpa-api add -E web-push@3.6.7` e `pnpm --filter garimpa-api add -DE @types/web-push@3.6.4`.
- [ ] **Step 2: Testes:**
  - `'endpoint só de serviços de push conhecidos'`: aceita `https://fcm.googleapis.com/fcm/send/x`, `https://updates.push.services.mozilla.com/wpush/v2/x`, `https://web.push.apple.com/x`, `https://wns2-par02p.notify.windows.com/w/?token=x`; recusa `http://fcm.googleapis.com/x`, `https://127.0.0.1/x`, `https://evil.example/x`, `https://fcm.googleapis.com.evil.example/x`, `not a url`.
  - `'POST com endpoint não permitido → 400'`.
  - `'inscrição criada e idempotente'` (dois POST iguais → uma linha).
  - `'aparelho que troca de conta passa a ser só da conta atual'`: A inscreve endpoint E; B faz POST com E → a linha de E pertence a B; A não tem inscrições.
  - `'DELETE só remove a inscrição da própria pessoa'`.
  - `'GET /api/push/key devolve null sem VAPID e a chave com VAPID'` (via `makeApp({ env })`).
  - `'push:keys gera um par válido'` (a função usada pelo CLI devolve chaves base64url não vazias; `web-push` aceita `setVapidDetails` com elas).
- [ ] **Step 3:** Rodar → falha.
- [ ] **Step 4: Implementar.** `isAllowedPushEndpoint`: `new URL` dentro de try; protocolo `https:`; hostname igual a `fcm.googleapis.com` ou `updates.push.services.mozilla.com`, ou terminado em `.push.apple.com`, `.notify.windows.com`, `.push.services.mozilla.com` (comparação por sufixo com o ponto, para não aceitar `fcm.googleapis.com.evil.example`).
- [ ] **Step 5:** suíte da API verde; `pnpm check:ci`, `pnpm typecheck`.
- [ ] **Step 6: Commit** `feat: inscreve aparelhos para receber avisos por push`.

### Task 5: Remetente (PR 3)

**Files:**
- Create: `api/src/push/transport.ts`, `api/src/push/sender.ts`, `api/test/push-remetente.test.ts`
- Modify: `api/src/main.ts` (iniciar o remetente a cada 5 s quando `pushEnabled`; parar no encerramento), `api/src/jobs.ts` (sem push: `update notifications set push_state = 'desativado' where push_state = 'pendente'` a cada tick — ver Ruling no fim)

**Interfaces:**
- Consumes: tabelas (Task 1), `config.pushEnabled` e VAPID (Task 4).
- Produces:
  - `export type PushPayload = { id: string; title: string; body: string; url: string; topic: string | null }`
  - `export type PushTransport = { send(sub: { endpoint: string; p256dh: string; auth: string }, payload: PushPayload, opts: { ttl: number; topic: string | null }): Promise<{ statusCode: number }> }`
  - `export function webPushTransport(vapid: { publicKey: string; privateKey: string; subject: string }): PushTransport` (erros HTTP do `web-push` viram `{ statusCode }`; erros de rede viram `statusCode: 0`)
  - `export async function sendPendingPush(sql: Sql, transport: PushTransport, now?: Date): Promise<{ processed: number }>`

- [ ] **Step 1: Testes** (`PushTransport` controlado que registra chamadas e devolve status programados):
  - `'entrega em um aparelho marca enviado'` (`push_state = 'enviado'`, `last_success_at` preenchido, payload com `url` e `topic`, `ttl` 86400).
  - `'sem inscrição marca sem_assinatura'`.
  - `'410 e 404 apagam a inscrição'` (com dois aparelhos: um 410, outro 201 → notificação `enviado`, inscrição morta apagada).
  - `'erro agenda nova tentativa com espera crescente'`: 500 → `push_attempts = 1`, `push_next_at` ≈ now + 1 min; tentativas seguintes 5 min, 30 min, 2 h; 5ª falha → `falhou` (usar `now` injetado).
  - `'notificação de conta removida não é enviada'` (`banned_at` → não chama o transporte; marca `sem_assinatura`).
  - `'dois remetentes simultâneos não enviam a mesma notificação'`: 60 pendentes, `Promise.all` de dois `sendPendingPush` com transporte lento (20 ms) → cada id enviado exatamente uma vez.
  - `'sem VAPID as pendentes viram desativado'` (`runTick` com config sem VAPID).
  - `'web-push real criptografa e manda os cabeçalhos'`: servidor HTTP local (`node:http`) que responde 201 e registra a requisição; inscrição com chaves geradas por `crypto.createECDH('prime256v1')` (p256dh) e 16 bytes aleatórios (auth); o envio passa por `webPushTransport` com o endpoint apontando para o servidor local (só no teste; a trava de endpoint é da rota) → cabeçalhos `TTL: 86400`, `Topic`, `Content-Encoding: aes128gcm`, `Authorization` começando por `vapid `.
- [ ] **Step 2:** Rodar → falha.
- [ ] **Step 3: Implementar.** Lote: transação com `select … where push_state = 'pendente' and push_next_at <= $now order by push_next_at limit 50 for update skip locked`; envia; atualiza estado na mesma transação. `Topic` do Web Push aceita só `[A-Za-z0-9_-]` até 32 caracteres: normalizar `topic` (ex.: `missao-<uuid sem hífens>` cortado em 32) dentro do transporte.
- [ ] **Step 4:** testes focados e suíte verdes; `pnpm check:ci`, `pnpm typecheck`.
- [ ] **Step 5: Commit** `feat: envia as notificações pendentes por Web Push`.

### Task 6: Service worker e biblioteca de push do app (PR 4)

**Files:**
- Create: `web/src/sw.ts`, `web/src/lib/push.ts`, `web/src/lib/push.test.ts`, `web/src/lib/notification-payload.ts`, `web/src/lib/notification-payload.test.ts`
- Modify: `web/vite.config.ts` (`strategies: 'injectManifest'`, `srcDir: 'src'`, `filename: 'sw.ts'`, `injectManifest.globPatterns` igual ao `workbox.globPatterns` atual), `web/package.json`, `pnpm-lock.yaml`, `web/tsconfig.json` (se precisar de `lib: ["WebWorker"]` separado para o SW, usar um `tsconfig.sw.json` encadeado no `typecheck`)

**Interfaces:**
- Produces:
  - `notification-payload.ts`: `export function toNotificationOptions(p: PushPayload): { title: string; options: NotificationOptions }` (`body`, `icon` `/icons/icon-192.png`, `badge` `/icons/icon-192.png`, `tag` = `topic ?? undefined`, `data: { url, id }`); `export function safeAppUrl(url: unknown): string` (só caminhos que começam com `/` e não com `//`; senão `/notificacoes`).
  - `push.ts`: `export type PushStatus = 'indisponivel' | 'instalar-no-iphone' | 'negado' | 'ativo' | 'inativo'`; `getPushStatus(env: { hasServiceWorker: boolean; hasPushManager: boolean; permission: NotificationPermission | 'unsupported'; isIos: boolean; isStandalone: boolean; subscribed: boolean; serverKey: string | null }): PushStatus`; `isIosSafariNotInstalled(userAgent: string, standalone: boolean): boolean`; `shouldShowPrompt(dismissedAt: number | null, now: number): boolean` (30 dias); `enablePush(api, serverKey): Promise<PushStatus>`; `disablePush(api): Promise<void>` (cancela no navegador e chama `DELETE`).

- [ ] **Step 1:** `pnpm --filter garimpa-web add -DE workbox-precaching@7.4.1 workbox-routing@7.4.1 workbox-strategies@7.4.1 workbox-expiration@7.4.1`.
- [ ] **Step 2: Testes** de `getPushStatus` (cada estado), `isIosSafariNotInstalled` (iPhone Safari fora do standalone → true; Chrome Android → false; iPhone instalado → false), `shouldShowPrompt` (nulo → true; 29 dias → false; 31 dias → true), `toNotificationOptions` (campos e `tag`), `safeAppUrl` (`/m/1` ok; `https://evil` → `/notificacoes`; `//evil` → `/notificacoes`).
- [ ] **Step 3:** Rodar → falha.
- [ ] **Step 4: Implementar** `sw.ts`: `precacheAndRoute(self.__WB_MANIFEST)`; rota de navegação com fallback `/index.html` negando `/api/` e `/u/` (mesmo comportamento de hoje); `CacheFirst` para `/u/*.jpg` com cache `provas`, 300 entradas, 30 dias; `skipWaiting`/`clientsClaim` equivalentes ao `registerType: 'autoUpdate'` atual; `push` → `showNotification` com `toNotificationOptions` + `postMessage({ type: 'notificacao' })` às janelas; `notificationclick` → fechar, focar janela existente e `navigate(safeAppUrl(data.url))`, ou `openWindow`.
- [ ] **Step 5:** testes verdes; `pnpm --filter garimpa-web build` gera `dist/sw.js` com precache (conferir que `sw.js` contém o manifesto e as rotas); `build:demo` continua sem SW; `pnpm check:ci`, `pnpm typecheck`.
- [ ] **Step 6: Commit** `feat: adiciona service worker próprio com push e a biblioteca de avisos`.

### Task 7: Sininho, lista, pedido de permissão, Carteira e e2e (PR 4)

**Files:**
- Create: `web/src/components/NotificationBell.tsx`, `web/src/pages/Notificacoes.tsx`, `web/src/components/PushPrompt.tsx`, testes `*.test.tsx` ao lado (ambiente `jsdom` por arquivo: `// @vitest-environment jsdom`)
- Modify: `web/src/lib/api.ts` (`notifications(before?)`, `markRead(ids?)`, `pushKey()`, `subscribePush(sub)`, `unsubscribePush(endpoint)`), `web/src/lib/types.ts`, `web/src/App.tsx` (rota `notificacoes`), `web/src/components/Shell.tsx` (sininho; logout chama `disablePush` antes), `web/src/pages/Ask.tsx` e `web/src/pages/Answer.tsx` (mostrar `PushPrompt` após publicar/enviar), `web/src/pages/Carteira.tsx` (opção **Avisos no celular**), `web/e2e/fluxo-principal.spec.ts`, `web/package.json` (`@testing-library/user-event@14.6.7`)

**Interfaces:**
- Consumes: rotas das Tasks 3–4; `push.ts` (Task 6).

- [ ] **Step 1:** `pnpm --filter garimpa-web add -DE @testing-library/user-event@14.6.7`.
- [ ] **Step 2: Testes de componente:**
  - `NotificationBell`: mostra o número de não lidas; esconde o número quando 0; rótulo acessível `Notificações, N não lidas`.
  - `Notificacoes`: lista itens (não lidas destacadas com `aria-label`/texto "não lida"); "Marcar todas como lidas" chama `markRead()` sem ids; clicar num item chama `markRead([id])` e navega para o `url`; um título contendo `<b>x</b>` aparece como texto literal.
  - `PushPrompt`: estado `inativo` → botão **Ativar avisos**; `instalar-no-iphone` → instruções de instalar na tela inicial, sem botão de ativar; "Agora não" grava o momento e o cartão some; `negado`/`indisponivel`/`ativo` → não renderiza.
- [ ] **Step 3:** Rodar → falha.
- [ ] **Step 4: Implementar.** Contador: TanStack Query com `refetchInterval: 60_000`, `refetchOnWindowFocus: true` e invalidação ao receber `message` `{ type: 'notificacao' }` do SW. Sem `publicKey` do servidor, nada de cartão nem opção na Carteira; o sininho continua.
- [ ] **Step 5: e2e:** no `fluxo-principal.spec.ts`, depois que a respondente envia a evidência, a autora vê o sininho com `1`, abre `/notificacoes`, clica no aviso e chega a `/m/<id>`.
- [ ] **Step 6:** testes do web, e2e, `pnpm check:ci`, `pnpm typecheck`, `build` e `build:demo` verdes.
- [ ] **Step 7: Commits** `feat: mostra o sininho e a lista de notificações` e `feat: pede permissão de push no momento certo`.

### Task 8: Documentação e ADR-0007 (PR 5)

**Files:**
- Create: `docs/adr/0007-notificacoes-web-push.md`
- Modify: `CLAUDE.md`, `docs/06-arquitetura-e-deploy.md`, `README.md`, `.env.example`

- [ ] **Step 1:** ADR-0007 a partir da spec: status, decisão (fila no Postgres + Web Push/VAPID), contexto, opções (envio direto na rota; Firebase Cloud Messaging), consequências (atraso até ~5 s; iPhone só com o app instalado; push desligado sem chaves; trava de endpoints conhecidos; entrega "pelo menos uma vez").
- [ ] **Step 2:** `CLAUDE.md`: comando `pnpm push:keys`; regra "evento que avisa alguém grava a notificação com `notify` na mesma transação, com o texto em `api/src/notifications/texts.ts`"; `docs/06`: variáveis `VAPID_*` e como gerar para o Dokploy; `README`: linha na tabela Stack; `.env.example`: as três variáveis com comentário.
- [ ] **Step 3:** Checklist de verificação manual no corpo do PR 4 (Android Chrome e iPhone instalado recebem push; toque abre a missão; com permissão negada só a lista funciona) — o Julio executa num aparelho real.
- [ ] **Step 4: Commit** `docs: registra a ADR-0007 e documenta as notificações`.

---

**Ruling do plano (desvio da spec):** a spec diz que, sem VAPID, as notificações "entram como `desativado`". O plano grava sempre `pendente` (inclusive as do `fn_vest_due`, que não conhece a configuração da API) e o `runTick` converte `pendente` → `desativado` quando o push está desligado. O efeito para o usuário é o mesmo e evita passar a configuração para o SQL. Custo: por até um ciclo do tick as linhas ficam `pendente`.
