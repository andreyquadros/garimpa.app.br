# Pepita Social — regras de desenvolvimento

PWA colaborativa de Ariquemes-RO: alguém abre uma **missão** ("onde encontro X?"), outra pessoa responde com uma
**evidência** (foto na loja), a comunidade confirma e quem ajudou ganha XP e **pepitas**. A base atual é um protótipo:
a stack pode mudar; as regras de negócio mudam pouco. Detalhes em `README.md` e `docs/`.

Monorepo pnpm: `api/` (Node 22, Hono, Postgres.js, zod), `web/` (React 19, Vite, Tailwind 4, TanStack Query, Leaflet),
`db/migrations/` (SQL puro, aplicado em ordem), `infra/` (Docker, compose para o Dokploy), `docs/`.

## Comandos

```bash
pnpm install
docker run -d --name garimpa-pg18 -e POSTGRES_HOST_AUTH_METHOD=trust -e POSTGRES_DB=garimpa_test \
  -p 127.0.0.1:54329:5432 postgres:18-alpine        # Postgres 18 local (depois: docker start garimpa-pg18)
docker exec garimpa-pg18 createdb -U postgres garimpa  # só na primeira vez
pnpm db:migrate && pnpm db:seed                       # esquema + dados de demonstração
pnpm dev                                              # web em :5173, API em :8787 (login dev: "marina")
pnpm typecheck                                        # tipos de api e web
pnpm --filter garimpa-api test                        # testes da API (precisa do Postgres em :54329)
pnpm --filter garimpa-web test                        # testes do web
pnpm --filter garimpa-web build                       # build do PWA
```

Biome, lefthook e o teste de ponta a ponta estão decididos (ADRs 0003 a 0005) mas ainda não implantados; quando
entrarem, os comandos vêm para cá.

## Git (ADR-0002)

- Uma branch por tarefa, a partir da `main` atualizada: `tipo/descricao-curta` (ex.: `feat/uuidv7`).
  Nunca commitar direto na `main`.
- Commits pequenos, um assunto cada, no formato `tipo: descrição` em português, no presente, primeira linha com até
  ~70 caracteres; corpo com o porquê quando não for óbvio. Tipos: `feat`, `fix`, `refactor`, `perf`, `test`, `docs`,
  `infra`, `ci`, `chore`, `style`.
- Código, infra e documentação em commits separados quando forem mudanças distintas.
- Todo commit deixa tipos, lint e testes passando. Teste e implementação vão juntos no mesmo commit.
- **Nunca** adicionar `Co-Authored-By`, "Generated with Claude" ou qualquer atribuição ao Claude em commits ou PRs.
- PR no GitHub, um por branch, com: o que mudou, por quê, como foi testado (comandos) e pendências.
  PR grande vira PRs encadeados. Merge por **rebase and merge**, só com CI verde; branch apagada depois.
- Push, abrir PR e fazer merge: **só com confirmação do Julio**.
- `git push --force-with-lease` é liberado só na própria branch de trabalho (para rebasear sobre a `main`).
  Nunca forçar push na `main`.

## Qualidade e testes (ADR-0003, ADR-0004, ADR-0005)

- **TDD em tudo:** vermelho → verde → refatorar. O teste é escrito antes e precisa falhar pelo motivo esperado.
- **API:** testes contra PostgreSQL 18 real, sem simular o banco. Regras de economia e antifraude são verificadas
  pelos efeitos no livro-razão (`ledger`).
- **Interface:** Testing Library + `user-event`, testando comportamento (o que a pessoa vê e faz), sem snapshots.
  Lógica pura em `web/src/lib/` com teste unitário. Aspecto visual se verifica rodando o app; o PR diz como.
- **Bug:** primeiro o teste que reproduz e falha, depois a correção.
- **Estilo:** 2 espaços, aspas simples, ponto e vírgula, linha de até 120 caracteres (Biome, quando implantado).
- Nunca dizer que algo funciona sem ter rodado a verificação e visto o resultado.

## Idioma e comentários

- Identificadores técnicos em **inglês**; termos do negócio sem boa tradução ficam em **português**
  (`pepitas`, `carencia`, `gorjeta`, `conluio`).
- Em português, com acentuação correta: comentários, commits, PRs, documentação e textos para o usuário.
- Comentários explicam o **porquê** (regra de negócio, risco de fraude, limitação), não o que a linha faz.

## Documentação e decisões

- `docs/03` (gamificação), `docs/04` (antiplágio e confiança) e `docs/05` (modelo de negócio) são a **fonte de
  verdade das regras de negócio**. PR que muda uma regra (valores da economia, antifraude, fluxo de missão) atualiza o
  documento no mesmo PR, num commit `docs:` próprio. `DEFAULT_ECONOMY` (`api/src/economy.ts`) e a tabela do
  `docs/03` precisam bater.
- Decisão cara de desfazer (stack, banco, infra, biblioteca central, modelo de dados, autenticação, antifraude) ganha
  uma ADR em `docs/adr/NNNN-titulo.md`: status, decisão, contexto, opções comparadas, consequências.
  Mudança pequena numa decisão vira seção "Revisão N" na ADR; mudança grande, ADR nova que substitui a antiga.
- Migrações já aplicadas não são editadas (só comentários); mudança de esquema é sempre uma migração nova.

## Glossário

| Negócio | No código | Na tela |
|---|---|---|
| Missão (pedido de "onde encontro X?") | `questions`, `question` | Missão |
| Resposta com evidência (aponta uma loja) | `answers`, `answer` | Evidência, pista |
| Prova (foto do produto, nota, recibo) | `evidences`, `evidence` | Prova |
| Achado (resposta aceita ou confirmada) | `answers.status in ('aceita','confirmada')` | Achado, descoberta |
| Primeiro achado (primeira resposta válida para o lugar) | `is_first_for_place` | Primeiro achado |
| Lugar / loja | `places` | Loja, lugar |
| Também preciso (seguir uma missão) | `question_followers`, `tambem_quero` | Também preciso |
| Confirmação (voto de quem foi ao local) | `confirmations` | Confirmar |
| Aceite (quem abriu escolhe a resposta) | `accepted_answer_id`, `resposta_aceita` | Foi aqui que encontrei |
| XP (progresso; nunca vira dinheiro) | `xp` | XP |
| Pepitas (crédito; vira dinheiro na fase 2) | `credits`, `credits_pending` | Pepitas |
| Carência (prazo antes de liberar pepitas) | `ledger.state = 'carencia'`, `vests_at` | Carência |
| Livro-razão (todo lançamento de XP e pepitas) | `ledger`, `fn_award`, `fn_reverse` | Carteira |
| Estorno / devolução | `fn_reverse`, `fn_unreverse`, `estorno`, `devolucao` | — |
| Gorjeta (agradecimento em pepitas) | `tips`, `gorjeta_*` | Agradecer |
| Bônus da missão (cresce com "também preciso") | `questions.bounty` | bônus |
| Patente (nível por XP) | `LEVELS`, `levelFor` | Patente |
| Conluio (contas combinadas para cunhar pepitas) | `collusionBetween`, `conluio` | — |
| Confiança da conta (0 a 1) | `users.trust`, `fn_recompute_trust` | — |
| Denúncia | `flags` | Denunciar |
| Cofre (fundo das lojas parceiras, fase 2) | `fund_ledger`, `payouts` | — (ainda não existe) |
