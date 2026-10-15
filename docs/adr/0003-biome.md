# ADR-0003 — Lint e formatação com Biome

| | |
|---|---|
| **Status** | Aceita (out/2026) · implementada (falta o .git-blame-ignore-revs, depois do merge) |
| **Decisão** | **Biome** como ferramenta única de lint e formatação para `api/` e `web/`, com um `biome.jsonc` na raiz. |

## Contexto

O projeto não tem lint nem formatador; só o `tsc` verifica tipos. O estilo atual é consistente (2 espaços, aspas simples, ponto e vírgula), mas denso: cerca de 875 de 6 mil linhas passam de 120 caracteres.

## Decisão

- Formatação: 2 espaços, aspas simples, ponto e vírgula, **largura de linha 120**.
- Lint: regras recomendadas do Biome. Regras desligadas ficam no `biome.jsonc` com o motivo; nada é silenciado sem justificativa.
- A primeira formatação do código entra **sozinha**, num commit `style:` sem mudança de comportamento, e o hash, tirado da `main` depois do merge (o rebase and merge reescreve os hashes), vai para `.git-blame-ignore-revs`.
- O CI roda `biome ci`.

## Opções comparadas

| Opção | A favor | Contra |
|---|---|---|
| **Biome** | Uma ferramenta, muito rápida, configuração mínima; cobre TS, React e JSON | Menos plugins que o ESLint |
| ESLint + Prettier | Padrão mais difundido, muitos plugins | Duas ferramentas e mais configuração |
| Nenhuma | Zero esforço agora | Estilo e erros comuns dependem só de atenção |

## Consequências

- O commit de formatação inicial é grande; quem revisar o PR olha só os commits seguintes.
- Avisos de lint do código atual são corrigidos em commits `fix:`/`refactor:` próprios.
