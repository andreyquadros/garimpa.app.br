# ADR-0006 — Cache das leituras públicas com Redis

| | |
|---|---|
| **Status** | Aceita (out/2026) · implementada |
| **Decisão** | Cache das leituras públicas da API no **Redis 8**, com invalidação imediata por **versão de grupo** e funcionamento sem cache quando o Redis cai. |

Detalhes do desenho: `docs/superpowers/specs/2026-10-17-cache-redis-design.md`.

## Contexto

Objetivos: telas mais rápidas nas leituras repetidas (mapa, busca, missões, lugares, ranking, configuração), aliviar o Postgres para crescer (mais usuários e cidades) e padronizar o Redis na stack desde já.

Requisitos que moldam a decisão: nada de dado velho depois de uma escrita; o Redis é acelerador, não ponto de falha; só entram dados iguais para qualquer pessoa; vale com várias réplicas da API; sem `REDIS_URL` nada muda (desenvolvimento e testes).

## Decisão

- **Servidor:** `redis:8.8.3-alpine` no compose, sem volume, sem porta publicada, com senha, `maxmemory 256mb` e `allkeys-lru`. Ambiente local e CI usam o mesmo contêiner, na porta 63799.
- **Invalidação por versão de grupo:** cada leitura em cache depende de grupos (`missoes`, `achados`, `ranking`, `missao:<id>`…) e a chave carrega a versão de cada um. Depois do commit, a escrita faz `INCR` nos grupos que afeta; as leituras seguintes montam outra chave e as antigas expiram.
- **Cliente único** em `api/src/cache.ts`, com prazo curto por comando e sem fila offline.
- **Prazo de reserva** de 10 minutos em toda chave (1 hora para a configuração).

## Opções comparadas

Estratégia de invalidação:

| Opção | A favor | Contra |
|---|---|---|
| **Versão por grupo** | `INCR` atômico e barato; vale para todas as réplicas; nenhuma leitura posterior ao `bump` vê dado velho; leitura concorrente grava chave órfã que expira | Chaves antigas ocupam memória até expirar (o `allkeys-lru` cuida) |
| Apagar chaves por padrão | Libera memória na hora | `SCAN`/`DEL` é caro e não é atômico: uma leitura concorrente regrava dado velho |
| Invalidação pelo banco (`LISTEN/NOTIFY`, gatilhos) | Cobre escritas feitas fora da API | Mais peças e acoplamento ao banco; perde avisos com a conexão caída |

Servidor:

| Opção | A favor | Contra |
|---|---|---|
| **Redis 8** | Padrão de mercado; imagem oficial | Licença AGPL (sem impacto no uso interno sem modificar o servidor) |
| Valkey | Fork BSD, mantido pela Linux Foundation, mesmo protocolo | Menos conhecido; sem ganho para o que o cache precisa hoje |

Trocar por Valkey é simples (mesmo protocolo e cliente), caso a licença passe a importar.

## Consequências

- **Fail-open:** com o Redis fora, lento ou com erro, a API lê do Postgres (`X-Cache: BYPASS`) e reconecta sozinha quando ele volta.
- **Prazo de reserva:** se o `bump` falhar depois de uma escrita, ou se alguma escrita esquecer de declarar grupos, a leitura pode ficar velha por até 10 minutos. Mudança manual em `settings.economia` pede `pnpm cache:bump config`.
- **Só dados públicos:** sessão, carteira, voto e "eu sigo" ficam fora do cache; o que é pessoal vem de consulta separada.
- Mais um serviço na infraestrutura (compose, CI e ambiente local), mas sem dados a guardar nem a restaurar.

## Medição

Feita uma vez, em 17/10/2026, para conferir o critério da spec: com o cache cheio, as rotas cacheadas não abrem transação no Postgres e a latência de cauda cai.

- **Máquina:** AMD Ryzen 5 4600H (12 threads), API, Postgres 18 e Redis 8.8.3 no mesmo computador (Docker para Postgres e Redis), autocannon também local.
- **Dados:** seed de demonstração, ou seja, pouquíssimos registros: 8 missões, 6 respostas e 10 lugares.
- **API:** `PORT=8790 DATABASE_URL=postgres://postgres@127.0.0.1:54329/garimpa node_modules/.bin/tsx src/main.ts`, sem `REDIS_URL` (sem cache, `X-Cache: BYPASS`) e com `REDIS_URL=redis://127.0.0.1:63799/0`.
- **Com cache:** antes de cada rodada, `pnpm cache:bump config missoes achados lugares ranking`, uma requisição de aquecimento por rota e conferência de `X-Cache: HIT` com `curl -sI`.
- **Carga (por rota):** `npx -y autocannon@8.0.0 -d 15 -c 20 <url>`, com `bbox=-63.2,-10.1,-62.9,-9.7` nas rotas do mapa.
- **Transações:** diferença de `select xact_commit from pg_stat_database where datname = 'garimpa'` lida logo antes e logo depois dos 15 s. O contador é do banco inteiro, então inclui qualquer outra atividade nesse intervalo.
- O autocannon não reporta p95: ficam p50, p97,5 e p99 (ms); req/s é a média.

| Rota | Sem cache: p50 / p97,5 / p99 | req/s | transações | Com cache: p50 / p97,5 / p99 | req/s | transações |
|---|---|---|---|---|---|---|
| `/api/map/finds` | 5 / 12 / 16 | 3.330 | 46.575 | 3 / 5 / 6 | 6.040 | 11 |
| `/api/map/open` | 5 / 8 / 10 | 3.652 | 53.949 | 3 / 5 / 5 | 6.152 | 4 |
| `/api/search?q=garrafa` | 11 / 15 / 18 | 1.707 | 73.550 | 3 / 4 / 4 | 6.414 | 4 |
| `/api/questions` | 7 / 12 / 14 | 2.568 | 39.806 | 3 / 5 / 6 | 5.282 | 2 |
| `/api/questions/<id>` | 10 / 17 / 35 | 1.806 | 53.793 | 3 / 4 / 5 | 6.024 | 5 |
| `/api/places` | 5 / 9 / 10 | 3.644 | 52.270 | 3 / 4 / 5 | 6.016 | 2 |
| `/api/ranking` | 9 / 15 / 28 | 1.983 | 31.706 | 8 / 13 / 15 | 2.431 | 2 |

Leitura dos números:

- Com o cache cheio, nenhuma rota abriu transação de forma relevante: de 2 a 11 no intervalo inteiro (atividade de fundo, não das rotas), contra 31 mil a 73 mil sem cache. A p97,5 e a p99 caíram em todas as rotas.
- O ganho de latência é modesto em valores absolutos porque o seed é minúsculo e o Postgres está na mesma máquina: cada consulta já custa poucos milissegundos. Com milhares de registros, rede entre API e banco e consultas mais pesadas, a diferença tende a crescer; esta medição não prova isso.
- `/api/ranking` quase não melhorou (p50 de 9 para 8 ms) mesmo com `X-Cache: HIT` e sem transações. A causa não foi investigada aqui; a hipótese é custo fora da consulta ao banco, mas não está confirmada.
- Rodada única, com autocannon e a API disputando a mesma CPU: servem para comparar sem cache com cache, não como capacidade absoluta.
