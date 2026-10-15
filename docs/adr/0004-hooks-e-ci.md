# ADR-0004 — Verificações em hooks locais (lefthook) e no CI

| | |
|---|---|
| **Status** | Aceita (out/2026) · implementada |
| **Decisão** | Hooks de Git com **lefthook** para as verificações rápidas e o **CI do GitHub Actions** para a verificação completa, que bloqueia o merge. |

## Contexto

As regras de qualidade (ADR-0003, ADR-0005) e de commits (ADR-0002) só valem se forem verificadas. Erros baratos devem aparecer antes do commit; nada deve entrar na `main` sem a verificação completa.

## Decisão

- **pre-commit:** Biome nos arquivos em stage (aplica a formatação e devolve ao stage) e typecheck do pacote afetado (`api` ou `web`). Meta: poucos segundos.
- **commit-msg:** valida o formato Conventional Commits da ADR-0002 e recusa trailers `Co-Authored-By` do Claude.
- **CI no PR:** `biome ci`, typecheck, testes da API (Postgres 18) **e** do web, build do PWA e build da demo. Merge só com tudo verde.
- O teste de ponta a ponta do fluxo principal (Playwright, ADR-0005) entra no CI quando for criado.

## Opções comparadas

| Opção | A favor | Contra |
|---|---|---|
| **Hook rápido + CI** | Erro barato pego cedo, commit continua rápido | Testes completos só rodam no CI |
| Só CI | Mais simples | Erro só aparece depois do push |
| Hook completo + CI | Cada commit testado por inteiro | Dezenas de segundos por commit, com Postgres de pé |

**lefthook** em vez de husky + lint-staged: um binário, configuração num `lefthook.yml`, execução paralela.

## Consequências

- Os testes completos continuam sendo responsabilidade de quem commita (TDD) e são garantidos pelo CI.
- A proteção da `main` (exigir PR e CI verde) é configurada no GitHub pelo dono do repositório.
- O `prepare` só roda `lefthook install` dentro de um repositório git (build em Docker não tem `.git`); o Biome cobre também `jsonc` e `html`, e `test:scripts` usa o glob `scripts/*.test.mjs`.
