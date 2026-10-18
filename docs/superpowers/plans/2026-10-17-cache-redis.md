# Cache com Redis — plano de implementação

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Cache das leituras públicas da API no Redis, com invalidação imediata por versão de grupo e funcionamento sem cache quando o Redis falha.

**Architecture:** Um módulo `api/src/cache.ts` (cliente ioredis, `wrap`/`bump`, cache nulo sem URL, fail-open) e uma camada HTTP `api/src/cache-http.ts` (cache no contexto do Hono, `markDirty`, middleware que incrementa versões depois de respostas de sucesso, cabeçalho `X-Cache`). As rotas de leitura passam por `cached(...)`; as de escrita declaram grupos com `markDirty`.

**Tech Stack:** Redis 8.8.3 (`redis:8.8.3-alpine`), ioredis 6.0.0, Hono, Postgres.js, Vitest, Playwright.

**Spec:** `docs/superpowers/specs/2026-10-17-cache-redis-design.md` (as tabelas "O que entra no cache" e "O que cada escrita invalida" são a fonte dos grupos).

**Entrega:** 4 PRs encadeados — PR 1 `infra/redis` (Task 1) → PR 2 `feat/cache-modulo` (Task 2) → PR 3 `feat/cache-rotas` (Tasks 3–5) → PR 4 `docs/cache-medicao` (Task 6).

## Global Constraints

- Versões exatas: imagem `redis:8.8.3-alpine`; `ioredis@6.0.0` (`pnpm --filter garimpa-api add -E`); medição com `npx -y autocannon@8.0.0` (não vira dependência).
- Prefixo de toda chave: `pepita:v1:`; versão de grupo em `pepita:v1:grupo:<grupo>`.
- Prazo de reserva: 10 min (600 s) para tudo; 1 h (3600 s) para `config`.
- Prazo de comando do Redis: 50 ms; sem fila offline.
- Grupos (nomes exatos): `config`, `missoes`, `achados`, `lugares`, `ranking`, `missao:<id>`, `lugar:<id>`.
- `X-Cache: HIT | MISS | BYPASS` em toda rota cacheada.
- Nada pessoal no cache; sem `REDIS_URL`, comportamento idêntico ao atual (cabeçalho `BYPASS`).
- Redis local na porta `63799` (como o Postgres em `54329`); testes da API no banco lógico `/2`, e2e no `/1`, dev no `/0`.
- Regras do `CLAUDE.md`: TDD, commits pequenos em português (≤ 72 caracteres), sem atribuição ao Claude, push/PR só com confirmação.

## Review Focus

- **Campos pessoais vazando pelo cache** (`iFollow`, `myVote`, `canAccept` em `/questions/:id`; `me` em `/ranking`): a resposta em `HIT` para a pessoa B não pode trazer os dados da pessoa A → teste na Task 4.
- **Resposta diferente entre `MISS` e `HIT`** (datas, números, `null`, ordem): o JSON tem de ser idêntico → teste na Task 4.
- **Redis cai no meio do uso:** leituras respondem `BYPASS` com os dados certos e escritas continuam funcionando → teste de integração na Task 3.
- **Testes que escrevem direto no banco por SQL e depois leem pela API** veriam dado em cache → `FLUSHDB` do banco `/2` no setup global e `bump` explícito onde o teste escreve por SQL (Task 3).
- **`GET /me` invalidando o ranking a cada abertura de tela** mataria o cache do ranking → só incrementa `ranking` quando o bônus de sequência foi de fato lançado; teste dos dois casos na Task 5.

---

### Task 1: Infraestrutura do Redis e ADR-0006 (PR 1)

**Files:**
- Modify: `infra/docker-compose.yml`, `.env.example`, `.github/workflows/ci.yml`, `api/src/config.ts`
- Create: `scripts/local-redis.sh`, `docs/adr/0006-cache-com-redis.md`

**Interfaces:**
- Produces: variável `REDIS_URL` opcional em `loadConfig()` (`config.REDIS_URL: string | undefined`); `scripts/local-redis.sh start|stop|status|cli` (contêiner `garimpa-redis`, `127.0.0.1:63799`, sem senha); env de testes `REDIS_URL_TEST` (CI: `redis://127.0.0.1:63799/2`).

- [ ] **Step 1:** Compose: serviço `garimpa-cache` com `redis:8.8.3-alpine`, sem volume, sem `ports`, comando `redis-server --requirepass ${REDIS_PASSWORD:?defina REDIS_PASSWORD} --maxmemory 256mb --maxmemory-policy allkeys-lru --save "" --appendonly no`, healthcheck `redis-cli -a $REDIS_PASSWORD ping`; o serviço `garimpa` ganha `REDIS_URL: redis://:${REDIS_PASSWORD}@garimpa-cache:6379/0` e `depends_on` (`service_healthy`). `.env.example`: `REDIS_PASSWORD=` e um comentário sobre `REDIS_URL`.
- [ ] **Step 2:** `api/src/config.ts`: `REDIS_URL: z.string().optional()`.
- [ ] **Step 3:** `scripts/local-redis.sh`, no estilo de `scripts/local-postgres.sh` (só Docker): `start` cria ou inicia `garimpa-redis` (`redis:8.8.3-alpine`, `-p 127.0.0.1:63799:6379`, `--save "" --appendonly no`) e espera `PING`; `stop`, `status`, `cli` (`docker exec -it ... redis-cli`).
- [ ] **Step 4:** CI: serviço `redis` (`redis:8.8.3-alpine`, porta `63799:6379`, healthcheck `redis-cli ping`) nos jobs `test` e `e2e`; env `REDIS_URL_TEST: redis://127.0.0.1:63799/2` no passo dos testes da API e `REDIS_URL_E2E: redis://127.0.0.1:63799/1` no passo do e2e.
- [ ] **Step 5:** `docs/adr/0006-cache-com-redis.md` no formato das outras ADRs, a partir da spec: status "Aceita (out/2026) · implementação pendente", decisão, contexto (objetivos), opções comparadas (versão por grupo × apagar chaves × invalidação pelo banco; Redis 8 × Valkey), consequências (fail-open, prazo de reserva, só dados públicos).
- [ ] **Step 6: Verificar.** `scripts/local-redis.sh start` → pronto; `scripts/local-redis.sh status` → `PONG`; `POSTGRES_PASSWORD=x SESSION_SECRET=y REDIS_PASSWORD=z docker compose -f infra/docker-compose.yml config -q`; YAML do CI válido; `pnpm typecheck`; testes da API continuam 56/56.
- [ ] **Step 7: Commits:** `infra: adiciona o Redis ao compose, ao CI e ao ambiente local` (compose, .env.example, ci.yml, script, config.ts) e `docs: registra a ADR-0006 do cache com Redis`.

### Task 2: Módulo de cache (PR 2)

**Files:**
- Create: `api/src/cache.ts`, `api/test/cache.test.ts`
- Modify: `api/package.json`, `pnpm-lock.yaml`

**Interfaces:**
- Consumes: `config.REDIS_URL` (Task 1).
- Produces, em `api/src/cache.ts`:
  - `export type CacheStatus = 'HIT' | 'MISS' | 'BYPASS'`
  - `export type Cache = { wrap<T>(name: string, groups: string[], params: unknown, ttlSeconds: number, loader: () => Promise<T>): Promise<{ value: T; status: CacheStatus }>; bump(groups: string[]): Promise<void>; close(): Promise<void> }`
  - `export function createCache(url?: string, opts?: { commandTimeoutMs?: number; log?: (msg: string) => void }): Cache` (padrões: 50 ms; `console.error`)

- [ ] **Step 1:** `pnpm --filter garimpa-api add -E ioredis@6.0.0`.
- [ ] **Step 2: Testes** (`api/test/cache.test.ts`, Redis real em `process.env.REDIS_URL_TEST ?? 'redis://127.0.0.1:63799/2'`, nomes e grupos únicos por teste com `uniq`):
  - `'primeira leitura é MISS e a segunda é HIT'`: loader chamado 1×; status `['MISS','HIT']`; valores iguais.
  - `'parâmetros com chaves em outra ordem reaproveitam a entrada'`: `{a:1,b:2}` e depois `{b:2,a:1}` → `HIT`.
  - `'bump do grupo invalida; bump de outro grupo não'`: após `bump([g1])` → `MISS`; após `bump([gOutro])` → `HIT`.
  - `'entrada expira no prazo'`: `ttlSeconds: 1`, espera 1,2 s → `MISS`.
  - `'pedidos simultâneos iguais chamam o loader uma vez'`: 5 `wrap` em `Promise.all` com loader lento (50 ms) → loader 1×; todos com o mesmo valor.
  - `'erro do loader propaga e não grava'`: 1ª chamada rejeita; 2ª chama o loader de novo.
  - `'valor null é guardado'`: loader devolve `null` → 2ª leitura `HIT` com `null`.
  - `'Redis inacessível responde BYPASS sem erro e rápido'`: `createCache('redis://127.0.0.1:1')`; `wrap` → `{ value: <do loader>, status: 'BYPASS' }` em menos de 500 ms; `bump` resolve sem lançar.
  - `'erros do Redis vão ao log no máximo uma vez por minuto'`: com Redis inacessível e `log` espião, 10 `wrap` → `log` chamado 1×.
  - `'sem URL o cache não guarda nada'`: `createCache()` → sempre `BYPASS`, loader a cada chamada.
- [ ] **Step 3:** Rodar `pnpm --filter garimpa-api exec vitest run test/cache.test.ts` → falha (módulo não existe).
- [ ] **Step 4: Implementar** `createCache`. Decisões: ioredis com `enableOfflineQueue: false`, `commandTimeout`, `maxRetriesPerRequest: 0`, `retryStrategy` crescente até 5 s, listener de `'error'` (sem evento não tratado); chave `pepita:v1:<name>:<g>=<v>,…:<sha1 de JSON com chaves ordenadas>`; versões via `MGET` de `pepita:v1:grupo:<g>` (ausente = 0); gravação `SET ... EX`; `bump` com `INCR` em pipeline; deduplicação em processo com `Map<chave, Promise>` limpo no `finally`; cache nulo quando `url` ausente.
- [ ] **Step 5:** Teste focado → passa; suíte da API inteira → passa; `pnpm check:ci`, `pnpm typecheck`.
- [ ] **Step 6: Commit** `feat: adiciona o módulo de cache com Redis`.

### Task 3: Cache no contexto do Hono e configuração da economia (PR 3)

**Files:**
- Create: `api/src/cache-http.ts`, `api/test/cache-http.test.ts`
- Modify: `api/src/auth.ts` (`AppEnv`), `api/src/app.ts`, `api/src/main.ts`, `api/src/economy.ts` (`loadEconomy`), chamadas de `loadEconomy` nas rotas, `api/src/routes/misc.ts` (`GET /config`), `api/src/cli.ts`, `package.json` (raiz), `api/test/helpers.ts`, `api/test/global-setup.ts`

**Interfaces:**
- Consumes: `Cache`, `createCache` (Task 2).
- Produces:
  - `AppEnv.Variables.cache: Cache`; `createApp(deps: { sql: Sql; config: Config; cache?: Cache })` (padrão `createCache(config.REDIS_URL)`).
  - Em `api/src/cache-http.ts`: `markDirty(c: Context<AppEnv>, ...groups: string[]): void`; `cacheInvalidation: MiddlewareHandler<AppEnv>` (depois de `next()`, se `c.res.status < 400`, `await c.get('cache').bump(grupos únicos)`); `cached<T>(c: Context<AppEnv>, name: string, groups: string[], params: unknown, ttlSeconds: number, loader: () => Promise<T>): Promise<T>` (chama `wrap` e define `X-Cache`).
  - `loadEconomy(sql: Sql, cache?: Cache): Promise<Economy>` (nome `economia`, grupo `config`, 3600 s).
  - CLI `pnpm cache:bump <grupo...>` (raiz → `pnpm --filter garimpa-api exec tsx src/cli.ts cache:bump ...`).
  - `makeApp()` usa `createCache(process.env.REDIS_URL_TEST ?? 'redis://127.0.0.1:63799/2')`; `global-setup.ts` faz `FLUSHDB` nesse banco.

- [ ] **Step 1: Testes** (`api/test/cache-http.test.ts`):
  - `'GET /api/config responde MISS e depois HIT'` (cabeçalho `X-Cache`).
  - `'escrita com sucesso incrementa os grupos marcados'`: app de teste com uma rota POST que chama `markDirty(c, 'gX')` e responde 201 → depois, `wrap` com grupo `gX` volta a `MISS`.
  - `'escrita que falha não incrementa'`: a mesma rota respondendo 400 → leitura continua `HIT`.
  - `'Redis fora: leituras respondem BYPASS e escritas funcionam'`: `makeApp` com `createCache('redis://127.0.0.1:1')` → `GET /api/config` 200 com `X-Cache: BYPASS`; um `POST /api/questions` de usuário logado → 201.
  - `'cache:bump config invalida a economia'`: ler `GET /api/config` até `HIT`, rodar a função usada pelo CLI → `MISS`.
- [ ] **Step 2:** Rodar → falha.
- [ ] **Step 3: Implementar** as interfaces acima; `cacheInvalidation` registrado em `/api/*` depois de `withUser`; `main.ts` cria o cache com `config.REDIS_URL` e fecha no encerramento; todas as chamadas `loadEconomy(sql)` passam `c.get('cache')`.
- [ ] **Step 4:** Testes antigos que escrevem por SQL e leem pela API em seguida: se algum quebrar, chamar `cache.bump([...])` no próprio teste (nunca desligar o cache na suíte). Suíte inteira verde.
- [ ] **Step 5: Commit** `feat: integra o cache às rotas e à configuração da economia`.

### Task 4: Leituras públicas no cache (PR 3)

**Files:**
- Modify: `api/src/routes/places.ts`, `api/src/routes/questions.ts`, `api/src/routes/misc.ts` (`/ranking`)
- Test: `api/test/cache-leituras.test.ts`

**Interfaces:**
- Consumes: `cached`, grupos (Task 3; nomes nos Global Constraints).

- [ ] **Step 1: Testes** — para cada rota da tabela da spec (`/map/finds`, `/map/open`, `/search`, `/questions`, `/questions/:id`, `/places`, `/places/:id`, `/ranking`): `'<rota> responde MISS e depois HIT com o mesmo JSON'` (corpo em `HIT` `toEqual` ao corpo em `MISS`). Mais:
  - `'/questions com mine=1 ou sort=perto não usa cache'` → `BYPASS` nas duas chamadas.
  - `'/questions/:id em HIT traz os campos pessoais de quem pede'`: B segue a missão de A (`POST /follow`); A lê até `HIT` (`canAccept: true`, `iFollow: true` por ser autora); B lê → `HIT` com `iFollow: true` e `canAccept: false`; C (não segue) lê → `HIT` com `iFollow: false`.
  - `'/ranking em HIT calcula "me" para quem pede'`.
- [ ] **Step 2:** Rodar → falha (sem `X-Cache`).
- [ ] **Step 3: Implementar.** Cada rota envolve a consulta pública em `cached(c, '<nome>', grupos, params, 600, loader)`; params = os parâmetros de consulta normalizados (bbox já analisado, termo aparado, `status`, `category`, `sort`, `offset`; no ranking, período e semana ISO de `America/Porto_Velho`). `/questions/:id`: a consulta pública não usa `me`; uma consulta pequena separada traz `i_follow` e `my_vote` por resposta; `canAccept` é calculado no handler. `/questions` com `mine` ou `sort=perto` responde `X-Cache: BYPASS` sem cache.
- [ ] **Step 4:** Testes focados e suíte inteira verdes; `pnpm check:ci`.
- [ ] **Step 5: Commit** `feat: guarda no cache as leituras públicas da API`.

### Task 5: Invalidação nas escritas e teste "na hora" (PR 3)

**Files:**
- Modify: `api/src/routes/questions.ts`, `api/src/routes/answers.ts`, `api/src/routes/places.ts`, `api/src/routes/misc.ts`, `api/src/economy.ts` (`touchStreak` passa a informar se lançou o bônus), `web/playwright.config.ts` (env `REDIS_URL` da API do e2e = `process.env.REDIS_URL_E2E ?? 'redis://127.0.0.1:63799/1'`)
- Test: `api/test/cache-na-hora.test.ts`

**Interfaces:**
- Consumes: `markDirty` (Task 3); rotas cacheadas (Task 4).
- Produces: `touchStreak(...)` devolve `{ streak: number; awarded: boolean }`.

- [ ] **Step 1: Teste tabelado** `'<escrita> invalida <leitura> na hora'`, uma linha por par da tabela "O que cada escrita invalida" da spec (inclusive gorjeta, denúncia que esconde, moderação, novo lugar, `POST /questions/:id/answers` criando lugar). Cada linha: aquecer a leitura até `HIT` → fazer a escrita → ler e esperar `MISS` **e** o dado novo no corpo (ex.: missão nova aparece na lista; status `confirmada` no detalhe; `finds` aumentou no lugar; pontos no ranking).
- [ ] **Step 2:** Mais três testes: `'escrita recusada não invalida'` (pergunta parecida → 409; lista continua `HIT`); `'GET /me com bônus de sequência invalida o ranking'` (deixar `last_active_on` = ontem e `streak_days` = 1 via SQL, chamar `/me` → ranking `MISS`); `'GET /me sem bônus não invalida o ranking'` (segunda chamada no mesmo dia → ranking `HIT`).
- [ ] **Step 3:** Rodar → falham.
- [ ] **Step 4: Implementar** `markDirty` em cada rota de escrita com os grupos da spec (ids de missão e lugar já disponíveis nas consultas das rotas; buscar `place_id` onde faltar); `ranking` em toda rota que lança XP; `/me` marca `ranking` só se `awarded`.
- [ ] **Step 5:** Suíte da API inteira; e2e com Redis (`scripts/local-redis.sh start`, `pnpm --filter garimpa-web test:e2e`) verde; `pnpm check:ci`, `pnpm typecheck`.
- [ ] **Step 6: Commits** `feat: invalida o cache nas escritas` (rotas + testes) e `test: roda o teste de ponta a ponta com Redis` (playwright.config.ts).

### Task 6: Medição e documentação (PR 4)

**Files:**
- Modify: `docs/adr/0006-cache-com-redis.md` (status "implementada" e seção "Medição"), `CLAUDE.md` (comandos: `scripts/local-redis.sh start`, `REDIS_URL`, `pnpm cache:bump`; Redis local precisa estar de pé para os testes da API e o e2e), `docs/06-arquitetura-e-deploy.md` (diagrama e variáveis), `README.md` (seção Rodar e tabela Stack)

- [ ] **Step 1: Medir.** Banco de dev com seed; subir a API (`PORT=8790`) **sem** `REDIS_URL` e depois **com** `REDIS_URL=redis://127.0.0.1:63799/0`. Para cada rota (`/api/map/finds?bbox=-63.2,-10.1,-62.9,-9.7`, `/api/map/open?bbox=...`, `/api/search?q=garrafa`, `/api/questions`, `/api/questions/<id do seed>`, `/api/places`, `/api/ranking`): `npx -y autocannon@8.0.0 -d 15 -c 20 <url>` (p50, p97,5/p99, req/s) e diferença de `select xact_commit from pg_stat_database where datname = 'garimpa'` antes/depois de cada rodada.
- [ ] **Step 2:** Registrar a tabela de resultados na seção "Medição" da ADR-0006 (máquina, dados do seed, comando, números antes/depois) e conferir o critério da spec: com o cache cheio, as rotas cacheadas não abrem transação no Postgres e a latência de cauda cai (o autocannon reporta p97,5 e p99, não p95; registrar os dois).
- [ ] **Step 3:** Atualizar CLAUDE.md, docs/06 e README.
- [ ] **Step 4: Commit** `docs: registra a medição do cache e atualiza a documentação`.
