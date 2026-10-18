# Cache com Redis — design

| | |
|---|---|
| **Status** | Proposto (out/2026) |
| **Decisão** | Cache das leituras públicas da API no Redis, com invalidação imediata por **versão de grupo** e funcionamento sem cache quando o Redis cai. |
| **ADR** | ADR-0006 "Cache com Redis" (criada na implementação, a partir desta spec) |

## Objetivo

- Telas mais rápidas nas leituras repetidas (mapa, busca, lista e detalhe de missões e lugares, ranking, configuração).
- Aliviar o Postgres para crescer (mais usuários e cidades).
- Padronizar o Redis na stack desde já.

## Requisitos

1. **Nada de dado velho:** toda escrita invalida, na hora, as leituras que ela afeta. A única exceção aceita é o Redis com problema no momento da invalidação (ver Falhas).
2. **Redis é acelerador, não ponto de falha:** com o Redis fora, lento ou com erro, a API responde lendo do Postgres.
3. **Só dados públicos no cache:** respostas iguais para qualquer pessoa. Nada pessoal (sessão, carteira, voto, "eu sigo").
4. **Funciona com várias réplicas da API** (invalidação vale para todas).
5. **Sem `REDIS_URL`, nada muda:** desenvolvimento e testes sem Redis continuam funcionando.

## Infraestrutura

- Contêiner `redis:8-alpine` no `infra/docker-compose.yml`, sem volume persistente, só na rede interna (sem porta publicada), com senha.
- Configuração de cache puro: `maxmemory` (ex.: 256 MB) e `maxmemory-policy volatile-lru` (ver ADR-0006: as versões dos grupos não têm prazo e não podem ser despejadas).
- A API recebe `REDIS_URL` (opcional) em `api/src/config.ts`.
- CI: serviço Redis no job `test` e no job `e2e`. Ambiente local: script para subir o Redis em contêiner, no mesmo estilo de `scripts/local-postgres.sh`.
- Alternativa registrada na ADR: **Valkey** (fork BSD mantido pela Linux Foundation, mesmo protocolo). Escolhido o Redis 8 (AGPL; sem impacto para uso interno sem modificar o servidor).

## Componentes

### `api/src/cache.ts` — única porta de entrada do cache

- Cliente `ioredis` (versão exata, com pelo menos duas semanas de lançamento), comandos com prazo de ~50 ms e sem fila offline.
- `createCache(url?: string): Cache` — sem URL devolve um cache nulo (sempre executa o `loader`, responde `BYPASS`).
- `cache.wrap<T>(name: string, groups: string[], params: unknown, ttlSeconds: number, loader: () => Promise<T>): Promise<{ value: T; status: 'HIT' | 'MISS' | 'BYPASS' }>`
  1. `MGET` das versões dos grupos (grupo inexistente = versão 0).
  2. Chave: `pepita:v1:<name>:<grupo>=<versão>,…:<hash dos params>`.
  3. `GET`; achou → `HIT`. Não achou → roda o `loader`, grava com `SET … EX ttlSeconds` → `MISS`.
  4. Pedidos iguais simultâneos no mesmo processo compartilham a mesma consulta (uma promessa por chave).
- `cache.bump(groups: string[]): Promise<void>` — `INCR` de cada grupo numa pipeline.
- Qualquer erro do Redis em `wrap` → executa o `loader` e responde `BYPASS`; em `bump` → registra erro. Log de falhas no máximo uma vez por minuto, com contagem.

### Integração com o Hono

- O cache entra no contexto (`c.get('cache')`), como `sql` e `config`.
- `markDirty(c, groups)` acumula os grupos que a escrita afeta.
- Um middleware, depois do handler, chama `cache.bump(grupos)` **só se a resposta foi de sucesso** (status < 400) — o commit já aconteceu; escrita que falha não invalida nada.
- Rotas em cache devolvem o cabeçalho `X-Cache: HIT | MISS | BYPASS`.

## O que entra no cache

| Leitura | Grupos | Observação |
|---|---|---|
| `GET /api/config` e `loadEconomy()` | `config` | prazo de reserva de 1 h |
| `GET /api/map/finds` | `achados` | params: área visível, termo |
| `GET /api/map/open` | `missoes` | params: área visível |
| `GET /api/search` | `missoes`, `achados` | params: termo |
| `GET /api/questions` | `missoes`, `achados` | fora do cache: `mine=1` e `sort=perto` |
| `GET /api/questions/:id` | `missao:<id>` | só a parte pública; `i_follow`, `my_vote` e `canAccept` vêm de consulta separada |
| `GET /api/places` | `lugares`, `achados` | |
| `GET /api/places/:id` | `lugar:<id>` | |
| `GET /api/ranking` | `ranking` | params incluem período e semana corrente (ISO); `me` é calculado da lista |

**Fora do cache:** `/api/me`, `/api/me/ledger`, `/api/admin/*`, sessão do usuário, fotos (`/u/*`, já com cache HTTP longo).

Prazo de reserva padrão: **10 minutos** (limita o estrago se alguma escrita esquecer de declarar grupos).

## O que cada escrita invalida

| Escrita | Grupos |
|---|---|
| `POST /questions`, `POST /questions/:id/close`, `POST /questions/:id/follow` | `missoes`, `missao:<id>` |
| `POST /questions/:id/answers` | `missoes`, `missao:<id>`, `lugar:<placeId>` (+ `lugares` se criou lugar) |
| `POST /answers/:id/confirm`, `POST /questions/:id/accept`, `POST /answers/:id/tip` | `missoes`, `missao:<id>`, `achados`, `lugar:<placeId>`, `ranking` |
| `POST /flags` (quando esconde resposta), `POST /admin/flags/:id` | `missoes`, `missao:<id>`, `achados`, `lugar:<placeId>`, `ranking` |
| `POST /places` | `lugares` |
| Toda rota que gera lançamento de XP: `POST /questions`, `POST /questions/:id/follow`, `POST /questions/:id/answers`, `POST /places` e **`GET /me`** (bônus de sequência — uma leitura com efeito colateral) | `ranking` (além dos grupos da linha própria) |
| Mudança manual em `settings.economia` | `config`, via `pnpm cache:bump config` |

## Concorrência

- Leitura que começou antes de uma escrita grava com a versão antiga; o `bump` pós-commit faz as próximas leituras usarem chave nova; a gravação antiga fica órfã e expira. Nenhuma leitura posterior ao `bump` vê dado velho.
- Pedidos iguais simultâneos: uma consulta por processo; entre réplicas, no máximo uma por réplica.

## Falhas

| Situação | Comportamento |
|---|---|
| Redis fora, lento (> ~50 ms) ou resposta inválida na leitura | Postgres responde; `X-Cache: BYPASS`; log limitado |
| Falha no `bump` após uma escrita | Log de erro; leituras podem ver dado velho até o prazo de reserva (10 min) |
| Redis volta | Cliente reconecta sozinho; sem reinício da API |
| Redis cheio | `volatile-lru` descarta as chaves de dados menos usadas (as versões ficam) |

## Testes (TDD, Redis real)

- `cache.ts`: miss → hit; `bump` troca a chave; prazo de validade; pedidos simultâneos geram um `loader`; porta fechada → `BYPASS` com o valor do `loader`; sem URL → cache nulo.
- **Teste "na hora"**, uma linha por escrita da tabela acima: ler a rota afetada até `HIT` → escrever → ler de novo e receber `MISS` com o dado novo.
- Escrita recusada (400/409) não invalida: a leitura seguinte continua `HIT`.
- Suítes atuais (API e e2e) continuam verdes; o e2e roda com Redis.

## Medição de sucesso

Uma vez, registrada no PR: com o seed, latência p50/p95 e número de consultas ao Postgres nas rotas cacheadas, antes e depois (ferramenta de carga simples, ex. `autocannon`). Critério: com o cache cheio, as rotas cacheadas não consultam o Postgres e a p95 cai.

## Entrega (PRs encadeados)

1. Infra: Redis no compose, CI e ambiente local; ADR-0006.
2. `api/src/cache.ts` e testes.
3. Leituras no cache, escritas com `markDirty`, teste "na hora".
4. Medição e documentação (`CLAUDE.md`, `docs/06`).

## Fora do escopo

Cache da sessão do usuário, cache HTTP/CDN, fila de jobs, rate limit e tempo real com Redis (podem usar a mesma infraestrutura depois).
