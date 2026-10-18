# ADR-0006 — Cache das leituras públicas com Redis

| | |
|---|---|
| **Status** | Aceita (out/2026) · implementação pendente |
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
- Esta ADR nasce antes do código: o status passa a "Aceita" simples quando o cache entrar em produção.
