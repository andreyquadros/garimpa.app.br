# ADR-0002 — Fluxo de Git, commits e pull requests

| | |
|---|---|
| **Status** | Aceita (out/2026) |
| **Decisão** | Uma branch por tarefa, commits pequenos no padrão Conventional Commits em português, pull request no GitHub e integração por **rebase and merge**. |

## Contexto

A base do piloto foi montada rápido e o histórico tem poucos commits grandes. A versão final será desenvolvida pelo Julio com o Claude como assistente, e o histórico precisa ser fácil de revisar e de analisar depois (`git log`, `git blame`, `git bisect`).

## Decisão

- **Branches:** sempre a partir da `main` atualizada, com nome `tipo/descricao-curta` (`feat/uuidv7`, `fix/device-id-sem-storage`). Nada é commitado direto na `main`.
- **Commits:** `tipo: descrição` em português, no presente, primeira linha com até 72 caracteres; corpo com o porquê quando não for óbvio. Tipos: `feat`, `fix`, `refactor`, `perf`, `test`, `docs`, `infra`, `ci`, `chore`, `style`. Um assunto por commit; todo commit deixa lint, tipos e testes passando.
- **Autoria:** commits só no nome de quem desenvolve, sem `Co-Authored-By` nem menção ao Claude.
- **Pull requests:** um por branch, com o que mudou, por quê e como foi testado. PRs grandes são divididos em PRs encadeados. Merge só com o CI verde.
- **Integração:** rebase and merge; a branch é apagada depois.
- **Reescrita de histórico:** `git push --force-with-lease` é permitido apenas na própria branch de trabalho (para acompanhar a `main`); nunca na `main`.

## Opções comparadas

| Estratégia de merge | Histórico | Por que não (ou por que sim) |
|---|---|---|
| **Rebase and merge** | Linear, commits pequenos preservados | Escolhida: o mais fácil de ler e de usar com `git bisect` |
| Merge commit | Não linear, PR visível como bloco | Commits de merge poluem a leitura sem ganho para um time de duas pessoas |
| Squash and merge | Um commit por PR | Perde os commits pequenos, que são justamente o que se quer revisar |

## Consequências

- Antes do merge, a branch precisa estar rebaseada sobre a `main`; com PRs encadeados, o de baixo entra primeiro.
- O formato das mensagens e a ausência de co-autoria passam a ser verificados por hook (ADR-0004).
