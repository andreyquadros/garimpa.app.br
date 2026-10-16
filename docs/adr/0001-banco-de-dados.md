# ADR-0001 — Banco de dados do Pepita Social

| | |
|---|---|
| **Status** | Decidido (piloto) |
| **Decisão** | **PostgreSQL 18** auto-hospedado no KVM 8 (Dokploy), com **PostGIS** para geolocalização (Revisão 2; antes `earthdistance`), `pg_trgm` + `unaccent` + `tsvector('portuguese')` para busca e deduplicação, e o livro-razão de pontos em SQL transacional. |
| **Custo** | Zero marginal: roda ao lado do Postgres do Traccar na VPS já paga. Nada em dólar, nenhum serviço que pausa ou cobra por leitura. |

## O que o app exige do banco

1. **Geo de cidade pequena**: "lugares a até 2 km", pinos dentro da área visível do mapa, distância entre a foto (EXIF) e a loja. Raio de 15 km, milhares de pontos, não milhões.
2. **Busca em português com deduplicação**: "garrafa hermética" tem de encontrar "garrafa com tampa hermética" antes de abrir pergunta nova. Isso pede *stemming* em português, remoção de acentos e similaridade por trigramas.
3. **Dinheiro de verdade mais adiante**: pepitas viram reais na fase 2. Um livro-razão com transações ACID, estornos e carência é obrigatório; "eventual consistency" aqui vira passivo financeiro.
4. **Login com Google, fotos, baixo tráfego inicial**: o custo tem de ser perto de zero enquanto houver poucos acessos, sem mudar de banco quando crescer.
5. **Hospedagem já existente**: KVM 8 (Hostinger, São Paulo) com Dokploy, Caddy e PostgreSQL, operado pela Incubadora.

## Opções comparadas

| Critério | **PostgreSQL no KVM 8** | Supabase (nuvem, grátis) | Firebase / Firestore | PocketBase |
|---|---|---|---|---|
| Geo | `earthdistance` + GiST; PostGIS quando precisar de polígonos | PostGIS pronto | Sem consulta geográfica nativa (geohash manual) | `geoPoint` + `geoDistance` (desde 0.26) |
| Busca PT-BR + dedupe | `tsvector('portuguese')`, `unaccent`, `pg_trgm` | Igual (é Postgres) | Só prefixo; precisa de Algolia/Typesense | `LIKE`; sem stemming nem trigramas |
| Ledger transacional | Funções PL/pgSQL, `for update`, estorno | Igual | Transações limitadas, sem SQL | Transações em hooks JS (SQLite) |
| Auth Google | Verificação do ID token na API (jose), 40 linhas | GoTrue pronto | Pronto | Pronto |
| Fotos | Disco do VPS servido pelo Caddy | Storage 1 GB grátis | Storage, cobra em dólar | Disco local |
| Custo com poucos acessos | **R$ 0** (VPS já paga) | R$ 0, mas o projeto **pausa após 7 dias sem uso** e são no máximo 2 projetos; Pro é US$ 25/mês | R$ 0 no Spark; qualquer estouro exige conta de faturamento em dólar | R$ 0 |
| Custo ao crescer | O mesmo até dezenas de milhares de usuários; depois réplica ou Postgres gerenciado sem reescrever | US$ 25+/mês em dólar | Cobra por leitura: um app de mapa e feed é pesado em leitura | Um processo só, sem réplica; SQLite |
| Operação | Já existe Postgres, backup diário e Uptime Kuma na VPS | Terceiro | Terceiro | Simples |
| Saída (lock-in) | Nenhum | Baixo (é Postgres) | Alto | Médio |

## Decisão e consequências

- **PostgreSQL 18 em contêiner próprio** (`garimpa-db`) no mesmo Docker Compose do Dokploy, volume persistente, backup diário com `pg_dump` para fora da VPS (mesma rotina do Traccar).
- **`earthdistance` em vez de PostGIS no piloto.** Para um raio urbano de 15 km a diferença de precisão é irrelevante, a extensão vem no pacote padrão do Postgres e os testes rodam em qualquer Postgres (incluindo o do GitHub Actions) sem imagem especial. Quando houver polígonos (bairros, área de cobertura de loja), instalar PostGIS é `create extension postgis` na imagem `postgis/postgis:18`; as colunas `lat/lng` continuam valendo.
- **Busca e dedupe no próprio banco.** Coluna gerada `tsv` com dicionário português + `unaccent`, coluna `title_norm` com índice GIN de trigramas. Nenhum serviço externo de busca no piloto.
- **Livro-razão (`ledger`) como fonte única de verdade** de XP e pepitas; `users.xp/credits` são caches mantidos pelas funções `fn_award`, `fn_vest_due`, `fn_reverse`. Toda cunhagem passa por uma função com `for update`.
- **Hash perceptual (dHash) das fotos no banco** (`bit(64)`), comparação por distância de Hamming via `fn_hamming`. Varredura linear basta até algumas centenas de milhares de fotos; se passar disso, índice BK-tree em tabela auxiliar ou `pgvector`.
- **API em Node 22 + Hono + postgres.js**, mesma linguagem do front; o deploy é um contêiner. Supabase gerenciado continua como plano B imediato: o esquema é Postgres puro e migra com `pg_dump`.

## O que foi rejeitado e por quê

- **Firestore**: sem consulta geográfica nem busca textual, modelo de cobrança por leitura em dólar e lock-in alto. Serviria para o login, mas a verificação do token do Google na própria API dispensa até isso.
- **Supabase gerenciado**: tecnicamente ótimo (é Postgres), mas a camada grátis pausa o projeto após uma semana sem acesso, o que num piloto público é inaceitável, e o plano pago é em dólar. Fica como saída de emergência.
- **PocketBase**: o mais barato de operar, mas busca pobre para deduplicar perguntas em português e SQLite como base de um ledger que vai pagar pessoas é arriscado.
- **Supabase auto-hospedado**: 8+ contêineres (Kong, GoTrue, PostgREST, Realtime, Storage, Studio) para o que a API resolve em poucas rotas; peso desnecessário na VPS compartilhada.

## Dimensionamento do piloto

| Grandeza | Estimativa 12 meses |
|---|---|
| Usuários | 2–5 mil cadastrados, 300–800 ativos/mês |
| Perguntas / respostas | 5 mil / 12 mil |
| Fotos | 15 mil × ~250 KB = ~4 GB em disco |
| Banco | < 1 GB |
| Carga | < 5 req/s de pico; um contêiner de API e um de Postgres sobram |

## Revisão 1 — PostgreSQL 16 → 18 (out/2026)

- **Motivo:** a base é nova e ainda não há dados em produção, então a troca não custa migração. O 18 traz `uuidv7()` nativo (ids ordenados por tempo, índices menores em `ledger` e `evidences`), `RETURNING old.*/new.*`, I/O assíncrono e *skip scan* em índices compostos.
- **Compatibilidade:** esquema, funções PL/pgSQL e extensões (`earthdistance`, `cube`, `pg_trgm`, `unaccent`) rodam sem mudança; os 41 testes da API passam no 18.6.
- **Atenção no Docker:** a imagem `postgres:18` guarda os dados em `/var/lib/postgresql/18/docker` e declara o volume em `/var/lib/postgresql`. O compose monta o volume nesse diretório; montar em `/var/lib/postgresql/data`, como no 16, faz o banco subir vazio fora do volume.
- **Adoção dos recursos novos** (`uuidv7()` como padrão das chaves, `RETURNING old/new` no lugar de `xmax = 0`) fica para migrações próprias.

## Revisão 2 — `earthdistance` → PostGIS (out/2026)

- **Status:** implementada (migrações 0005 e 0006).
- **Motivo:** a troca nunca vai custar tão pouco: não há dados em produção, a stack está em revisão e o banco acabou de mudar de versão. Várias ideias em discussão dependem de PostGIS: importar lojas do OpenStreetMap, agrupar pinos no servidor, servir tiles vetoriais próprios (`ST_AsMVT`) e trocar a cidade "ponto + raio" por um polígono (bairros, várias cidades).
- **O motivo original deixou de valer:** o `earthdistance` foi escolhido para rodar em qualquer imagem do Postgres, sem imagem especial no CI. Com o banco em contêiner no CI, no ambiente local e no deploy (ADR-0004), usar PostGIS é trocar a imagem.
- **Problema encontrado no esquema atual:** o índice GiST `places_earth` não é usado por nenhuma consulta. Elas filtram com `earth_distance(...) <= raio` ou `lat between ... and lng between ...`, formas que não aproveitam o índice; `lat`/`lng` também não têm índice comum. Toda consulta de mapa percorre a tabela inteira.
- **Decisão:**
  - imagem `postgis/postgis:18-3.6-alpine` (existe no Docker Hub) no compose, no CI e no ambiente local;
  - coluna `geog geography(Point, 4326)` gerada a partir de `lat`/`lng` em `places` e `questions`, com índice GiST; `lat`/`lng` continuam existindo para não reescrever a API de uma vez;
  - consultas reescritas para `ST_DWithin` (raio), `&&` com `ST_MakeEnvelope` (área visível do mapa) e `<->` (mais perto primeiro), cada uma coberta por teste antes da troca (ADR-0005);
  - `earthdistance` e `cube` saem do esquema;
  - polígono de área em `cities` no lugar de `radius_m` fica para quando houver bairros ou uma segunda cidade.
- **Consequências:** a imagem do banco fica algumas centenas de MB maior; a cada atualização de versão do Postgres, a versão do PostGIS precisa existir nos dois lados do `pg_upgrade`; em todo código geográfico, a ordem é **longitude, latitude** (`ST_MakePoint(lng, lat)`). A imagem do PostGIS deriva da oficial do Postgres; o caminho do volume da Revisão 1 foi conferido (feito): ela herda o `PGDATA` de `postgres:18-alpine`.
- **Volume novo × existente:** num volume **novo**, o script de inicialização da imagem (`10_postgis.sh`) também instala `postgis_topology`, `fuzzystrmatch` e `postgis_tiger_geocoder` (schemas extras); um volume existente só recebe o que a migração 0005 cria. Aceito.
- **Superusuário:** `create extension postgis` exige superusuário; no compose isso é o caso, mas vale conferir em bancos gerenciados.
- **Plano B (Supabase):** a frase "o esquema é Postgres puro e migra com `pg_dump`" é anterior a esta revisão. O Supabase continua servindo de plano B porque oferece PostGIS.
