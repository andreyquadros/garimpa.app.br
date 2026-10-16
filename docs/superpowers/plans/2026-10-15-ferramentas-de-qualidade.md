# Ferramentas de qualidade — plano de implementação

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Biome, hooks de Git (lefthook), CI completo e Postgres local via Docker, para que as regras do `CLAUDE.md` sejam verificadas por ferramenta.

**Architecture:** Configuração na raiz do monorepo (`biome.jsonc`, `lefthook.yml`); validador de mensagens de commit em Node puro (`scripts/commit-msg.mjs`, testado com `node:test`), usado pelo hook e pelo CI; CI do GitHub Actions passa a rodar tudo.

**Tech Stack:** Biome 2.5.15, lefthook 2.1.15, Node 22 (`node:test`), pnpm 10.28, GitHub Actions, Docker `postgres:18-alpine`.

**Spec:** `CLAUDE.md`; `docs/adr/0002-fluxo-de-git.md`, `0003-biome.md`, `0004-hooks-e-ci.md`, `0005-tdd.md`.

**Branch / PR:** `infra/ferramentas-de-qualidade`, a partir da `main` depois do merge de `infra/postgres-18` e `docs/regras-de-desenvolvimento` (se ainda não entraram, encadear sobre `docs/regras-de-desenvolvimento`). A Task 8 é um segundo PR, depois do merge deste.

## Global Constraints

- Versões exatas (`pnpm add -E`): `@biomejs/biome@2.5.15`, `lefthook@2.1.15`.
- Formatação: 2 espaços, aspas simples, ponto e vírgula, `lineWidth` 120.
- Lint: regras recomendadas; toda regra desligada fica no `biome.jsonc` com o motivo.
- Commits: `tipo: descrição` (escopo opcional `tipo(escopo):`), tipos `feat fix refactor perf test docs infra ci chore style`, primeira linha com no máximo 72 caracteres, sem `Co-Authored-By` nem menção ao Claude.
- Textos de erro e mensagens em português com acentuação.
- Nada de push, PR ou merge sem confirmação do Julio.

## Review Focus

- **Rebase and merge reescreve os hashes:** o hash do commit de formatação só vale depois de entrar na `main` → Task 8 roda depois do merge e usa o hash da `main`.
- **Commit com hook pulado (`--no-verify`):** a regra de mensagem e de autoria tem de valer mesmo assim → o CI valida todas as mensagens do PR (Task 5, modo `--range`; Task 7).
- **Arquivo parcialmente em stage:** o pre-commit não pode colocar no commit trechos que a pessoa deixou fora do stage → verificação explícita na Task 6.
- **Clone novo:** os hooks precisam se instalar sozinhos no `pnpm install`, apesar de o pnpm 10 bloquear scripts de dependências → `prepare` na raiz (Task 6).
- **Mensagem gerada pelo Git** (linhas `#` do editor, `fixup!`, `Revert "..."`) não pode ser recusada → casos de teste na Task 5.

---

### Task 1: Postgres local via Docker

**Files:**
- Modify: `scripts/local-postgres.sh`
- Modify: `CLAUDE.md` (seção Comandos), `README.md` (seção Rodar), `docs/06-arquitetura-e-deploy.md` (tabela de pastas)

**Interfaces:**
- Produces: `scripts/local-postgres.sh start|stop|status|psql` com Postgres 18 em `127.0.0.1:54329`, bancos `garimpa` e `garimpa_test`, usuário `postgres` sem senha. Variáveis: `PGLOCAL_PORT` (54329), `PGLOCAL_IMAGE` (`postgres:18-alpine`), `PGLOCAL_CONTAINER` (`garimpa-pg18`).

- [ ] **Step 1:** Reescrever o script: se houver binários locais (`/usr/lib/postgresql/*/bin`, `/usr/pgsql-*/bin` ou `pg_ctl` no `PATH`), mantém o modo atual; senão usa Docker. Modo Docker: `start` cria o contêiner na primeira vez (`docker run -d --name $PGLOCAL_CONTAINER -e POSTGRES_HOST_AUTH_METHOD=trust -p 127.0.0.1:$PGLOCAL_PORT:5432 -v garimpa-pgdata-local:/var/lib/postgresql $PGLOCAL_IMAGE`), ou `docker start` se já existe; espera `pg_isready`; cria `garimpa` e `garimpa_test` se faltarem. `stop` → `docker stop`; `status` → `pg_isready` via `docker exec`; `psql` → `docker exec -it ... psql -U postgres`.
- [ ] **Step 2: Verificar.** `docker rm -f garimpa-pg18; scripts/local-postgres.sh start` imprime `postgres pronto: ...`; rodar de novo não falha; `pnpm --filter garimpa-api test` → 41 testes passam; `scripts/local-postgres.sh stop && scripts/local-postgres.sh start` mantém os dados (`pnpm db:seed` não precisa rodar de novo).
- [ ] **Step 3:** Trocar no `CLAUDE.md` as três linhas de `docker run`/`docker exec` por `scripts/local-postgres.sh start`; ajustar `README.md` ("Postgres 18 local, sem Docker" → "Postgres 18 local (binários instalados ou Docker)") e a linha do script em `docs/06`.
- [ ] **Step 4: Commit** (`git add scripts/local-postgres.sh CLAUDE.md README.md docs/06-arquitetura-e-deploy.md`)
  `infra: sobe o Postgres local em Docker quando não há binários instalados`

### Task 2: Biome configurado (sem formatar o código ainda)

**Files:**
- Create: `biome.jsonc`
- Modify: `package.json` (raiz), `pnpm-lock.yaml`

**Interfaces:**
- Produces: scripts na raiz `pnpm lint` (`biome lint .`), `pnpm format` (`biome format --write .`), `pnpm check` (`biome check --write .`), `pnpm check:ci` (`biome ci .`).

- [ ] **Step 1:** `pnpm add -Dw -E @biomejs/biome@2.5.15`.
- [ ] **Step 2:** `biome.jsonc` (JSON com comentários, para justificar regras desligadas) com: `$schema` da 2.5.15; `vcs` `{ enabled: true, clientKind: "git", useIgnoreFile: true }`; `files.includes` excluindo `**/dist`, `**/dist-demo`, `**/dev-dist`, `pnpm-lock.yaml`, `docs/**`, `web/public/**`; `formatter` `{ indentStyle: "space", indentWidth: 2, lineWidth: 120 }`; `javascript.formatter` `{ quoteStyle: "single", semicolons: "always" }` (JSX mantém aspas duplas, padrão); `linter.rules.recommended: true` com `style.noNonNullAssertion: "off"` e o motivo num comentário `//` ao lado: o `noUncheckedIndexedAccess` do tsconfig obriga `rows[0]!` após `insert ... returning`, onde a linha é garantida; `overrides` para `api/test/**` com `suspicious.noExplicitAny: "off"` (respostas JSON arbitrárias nos testes).
- [ ] **Step 3: Verificar.** `pnpm exec biome format .` lista arquivos a formatar e não toca em nada; `pnpm exec biome lint .` mostra os avisos (≈ 50, sem os 138 de `noNonNullAssertion`); nenhum arquivo de `docs/`, `dist` ou `node_modules` aparece.
- [ ] **Step 4: Commit** (`git add biome.jsonc package.json pnpm-lock.yaml`) `chore: adiciona o Biome com a configuração do projeto`

### Task 3: Formatação inicial isolada

**Files:** todos os `.ts`, `.tsx`, `.mjs`, `.json` e `.css` do projeto (só formatação).

- [ ] **Step 1:** `pnpm format`.
- [ ] **Step 2: Verificar que não mudou comportamento.** `pnpm typecheck` passa; `pnpm --filter garimpa-api test` (41) e `pnpm --filter garimpa-web test` (5) passam; `pnpm --filter garimpa-web build` passa; `git diff --stat` não mostra arquivo fora de código/config.
- [ ] **Step 3: Commit sozinho** (`git add -u`) `style: formata o código com o Biome`. Anotar o hash para a descrição do PR (ele muda no merge; ver Task 8).

### Task 4: Lint zerado

**Files:** os apontados por `pnpm lint` (hoje: `api/src/routes/answers.ts`, `api/src/routes/misc.ts`, `web/src/lib/api.ts`, `web/src/styles.css` e outros).

- [ ] **Step 1:** `pnpm exec biome lint --write .` (só correções seguras: `useLiteralKeys`, `useTemplate`...). Rodar typecheck e testes. Commit: `refactor: aplica as correções automáticas do lint`.
- [ ] **Step 2:** Corrigir à mão o restante, um commit por regra ou grupo afim (ex.: `fix: corrige dependências dos hooks do React apontadas pelo lint`, `refactor: troca any por unknown no cliente da API`). Para `useExhaustiveDependencies` e qualquer mudança de comportamento: TDD (teste do componente que falha antes da correção). Quando a regra não se aplica ao caso (ex.: `noImportantStyles` necessário para sobrescrever o Leaflet), usar `// biome-ignore lint/<grupo>/<regra>: <motivo>` na linha.
- [ ] **Step 3: Verificar.** `pnpm check:ci` sai com 0; typecheck, testes da API e do web e build passam.

### Task 5: Validador de mensagem de commit

**Files:**
- Create: `scripts/commit-msg.mjs`, `scripts/commit-msg.test.mjs`
- Modify: `package.json` (raiz: script `"test:scripts": "node --test scripts/"`)

**Interfaces:**
- Produces: `export function validateCommitMessage(message: string): string[]` — lista de erros em português (vazia = válida). CLI: `node scripts/commit-msg.mjs <arquivo>` (usado pelo hook) e `node scripts/commit-msg.mjs --range <base>..<head>` (usado pelo CI; valida cada commit do intervalo via `git log --format=%H%x00%B%x1e`); sai com 1 e imprime `<hash curto>: <erro>` quando houver erro.

- [ ] **Step 1: Escrever os testes** (`node:test` + `node:assert/strict`):
  - `'feat: adiciona o uuidv7'` → `[]`; `'fix(api): corrige o teto diário'` → `[]`; `'feat!: troca o formato do id'` → `[]`.
  - `'adiciona o uuidv7'` → 1 erro (formato); `'feature: x'` → 1 erro (tipo desconhecido); `'feat:'` e `'feat: '` → 1 erro (descrição vazia).
  - primeira linha com 73 caracteres → 1 erro; com 72 → `[]`.
  - corpo com `Co-Authored-By: Claude <noreply@anthropic.com>` → 1 erro; idem com `co-authored-by: claude opus` (sem diferenciar maiúsculas) e com qualquer `noreply@anthropic.com`; corpo com `Generated with [Claude Code]` → 1 erro.
  - `Co-Authored-By: Andrey <andrey@exemplo.com>` → `[]`.
  - linhas começando com `#` são ignoradas (mensagem `'feat: x\n# Please enter...'` → `[]`); mensagem só com comentários → 1 erro (vazia).
  - `'fixup! feat: x'`, `'squash! feat: x'`, `'Revert "feat: x"'` → `[]`.
- [ ] **Step 2:** `node --test scripts/` → falha (`validateCommitMessage` não existe).
- [ ] **Step 3:** Implementar `validateCommitMessage` e a CLI em `scripts/commit-msg.mjs`. Regex da primeira linha: `^(feat|fix|refactor|perf|test|docs|infra|ci|chore|style)(\([a-z0-9-]+\))?!?: \S`.
- [ ] **Step 4:** `node --test scripts/` → todos passam. `node scripts/commit-msg.mjs --range main..HEAD` na branch atual → sai com 0.
- [ ] **Step 5: Commit** (`git add scripts/commit-msg.mjs scripts/commit-msg.test.mjs package.json`) `feat: valida o formato e a autoria das mensagens de commit`

### Task 6: Hooks com lefthook

**Files:**
- Create: `lefthook.yml`
- Modify: `package.json` (raiz: `"prepare": "lefthook install"`), `pnpm-lock.yaml`

**Interfaces:**
- Consumes: `scripts/commit-msg.mjs <arquivo>` (Task 5); scripts do Biome (Task 2).

- [ ] **Step 1:** `pnpm add -Dw -E lefthook@2.1.15`.
- [ ] **Step 2:** `lefthook.yml`:
  - `pre-commit` (paralelo): `biome` com `glob: "*.{ts,tsx,mjs,js,json,css}"`, `run: pnpm exec biome check --write --no-errors-on-unmatched --files-ignore-unknown=true {staged_files}`, `stage_fixed: true`; `typecheck-api` com `glob: "api/**/*.ts"`, `run: pnpm --filter garimpa-api typecheck`; `typecheck-web` com `glob: "web/**/*.{ts,tsx}"`, `run: pnpm --filter garimpa-web typecheck`.
  - `commit-msg`: `run: node scripts/commit-msg.mjs {1}`.
- [ ] **Step 3:** `pnpm install` → `.git/hooks/pre-commit` e `commit-msg` existem (instalados pelo `prepare`).
- [ ] **Step 4: Verificar a recusa.** `git commit --allow-empty -m "teste sem tipo"` → recusado com a mensagem de erro; `git commit --allow-empty -m "chore: teste" -m "Co-Authored-By: Claude <noreply@anthropic.com>"` → recusado.
- [ ] **Step 5: Verificar a formatação e o stage parcial.** Num arquivo `.ts`, estragar a formatação de uma função e, em outro trecho do mesmo arquivo, fazer uma mudança que fica fora do stage (`git add -p` só do primeiro trecho). Commitar: o commit precisa conter só o primeiro trecho, formatado, e o segundo trecho continua fora do stage. Se o lefthook levar o trecho não preparado para o commit, trocar o comando por `pnpm exec biome check --staged --no-errors-on-unmatched` (sem `--write`, só recusa), registrar a troca em "Consequências" da ADR-0004 e repetir o teste. Desfazer o commit de teste (`git reset --soft HEAD~1` e descartar as mudanças de teste).
- [ ] **Step 6: Commit** (`git add lefthook.yml package.json pnpm-lock.yaml`) `chore: adiciona hooks de pre-commit e commit-msg com lefthook`

### Task 7: CI completo e documentação

**Files:**
- Modify: `.github/workflows/ci.yml`, `CLAUDE.md`, `docs/adr/0003-biome.md`, `docs/adr/0004-hooks-e-ci.md`

**Interfaces:**
- Consumes: `pnpm check:ci` (Task 2), `pnpm test:scripts` e `--range` (Task 5).

- [ ] **Step 1:** No job `test`, depois do `pnpm install`: `actions/checkout` com `fetch-depth: 0`; passo "Mensagens de commit" só em `pull_request`: `node scripts/commit-msg.mjs --range origin/${{ github.base_ref }}..HEAD`; `pnpm check:ci`; `pnpm test:scripts`; depois dos testes da API, `pnpm --filter garimpa-web test`. Manter typecheck, build e build:demo.
- [ ] **Step 2: Verificar localmente** cada comando do CI na ordem (`pnpm check:ci && pnpm test:scripts && pnpm typecheck && pnpm --filter garimpa-api test && pnpm --filter garimpa-web test && pnpm --filter garimpa-web build && pnpm --filter garimpa-web build:demo`) → tudo passa. O CI de verdade é conferido no PR.
- [ ] **Step 3:** `CLAUDE.md`: tirar a frase "Biome, lefthook ... ainda não implantados"; acrescentar aos comandos `pnpm check` (formata e corrige), `pnpm lint`, `pnpm test:scripts`; dizer que os hooks se instalam no `pnpm install`. ADR-0003 e ADR-0004: status "Aceita (out/2026) · implementada".
- [ ] **Step 4: Commits separados:** `ci: roda lint, mensagens de commit e testes do web no CI` (`ci.yml`) e `docs: atualiza os comandos e o status das ADRs de qualidade` (`CLAUDE.md`, ADRs).
- [ ] **Step 5:** Mostrar ao Julio o resumo do PR (o que, por quê, como foi testado, hash do commit de formatação) e pedir confirmação para push e PR.

### Task 8 (depois do merge): ignorar a formatação no `git blame`

**Files:**
- Create: `.git-blame-ignore-revs`

- [ ] **Step 1:** Na `main` atualizada, achar o hash do commit `style: formata o código com o Biome` (`git log --format=%H --grep '^style: formata o código com o Biome' main`).
- [ ] **Step 2:** Branch `chore/blame-ignora-formatacao`; criar `.git-blame-ignore-revs` com um comentário (`# style: formata o código com o Biome`) e o hash completo.
- [ ] **Step 3: Verificar.** `git blame --ignore-revs-file .git-blame-ignore-revs api/src/economy.ts | head` mostra os commits anteriores à formatação.
- [ ] **Step 4: Commit** `chore: ignora o commit de formatação no git blame`; pedir confirmação para push e PR.
