# ADR-001 — Banco de dados do Pepita Social

| | |
|---|---|
| **Status** | Decidido (piloto) |
| **Decisão** | **PostgreSQL 16** auto-hospedado no KVM 8 (Dokploy), com `earthdistance` para geolocalização, `pg_trgm` + `unaccent` + `tsvector('portuguese')` para busca e deduplicação, e o livro-razão de pontos em SQL transacional. PostGIS fica como atualização opcional. |
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

- **PostgreSQL 16 em contêiner próprio** (`garimpa-db`) no mesmo Docker Compose do Dokploy, volume persistente, backup diário com `pg_dump` para fora da VPS (mesma rotina do Traccar).
- **`earthdistance` em vez de PostGIS no piloto.** Para um raio urbano de 15 km a diferença de precisão é irrelevante, a extensão vem no pacote padrão do Postgres e os testes rodam em qualquer Postgres (incluindo o do GitHub Actions) sem imagem especial. Quando houver polígonos (bairros, área de cobertura de loja), instalar PostGIS é `create extension postgis` na imagem `postgis/postgis:16`; as colunas `lat/lng` continuam valendo.
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
