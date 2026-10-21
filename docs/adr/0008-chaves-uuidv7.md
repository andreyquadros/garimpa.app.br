# ADR-0008 — Chaves em UUID v7

| | |
|---|---|
| **Status** | Aceita (out/2026) · implementada |
| **Decisão** | As chaves `uuid` passam a nascer com `uuidv7()`, nativo do PostgreSQL 18, como padrão da coluna. |

## Contexto

As 12 tabelas com chave `uuid` (`users`, `places`, `questions`, `answers`, `evidences`, `tips`, `flags`, `partners`,
`campaigns`, `payouts`, `notifications`, `push_subscriptions`) geravam o id com `gen_random_uuid()`, que é v4 e
totalmente aleatório. Cada inserção cai num ponto qualquer do índice da chave primária: com volume, isso espalha
páginas pela árvore, piora o cache do Postgres e aumenta a escrita no WAL. O UUID v7 (RFC 9562) começa pelo instante
de criação em milissegundos, então as inserções vão para o fim do índice, como num `bigserial`, sem perder as
vantagens do uuid (id não sequencial para quem tenta adivinhar, geração sem coordenação).

Não há dados em produção, então nenhum id existente precisa ser convertido.

## Decisão

- Migração `0008_uuidv7.sql` troca o padrão das 12 colunas para `uuidv7()`. Tipo, formato e validação (`z.string().uuid()`
  aceita v7) não mudam; a API e o app não precisam de alteração.
- `ledger` e `fund_ledger` continuam com `bigserial`: já são sequenciais e nunca aparecem em URL.
- Toda tabela nova com chave `uuid` usa `default uuidv7()`. O teste `api/test/chaves-uuidv7.test.ts` lê o catálogo e
  reprova qualquer coluna `uuid` com `gen_random_uuid()`.

## Opções comparadas

| Opção | A favor | Contra |
|---|---|---|
| **`uuidv7()` no banco** | Nativo no PostgreSQL 18, sem extensão nem dependência; mesmo tipo e formato; inserções no fim do índice | O id revela o instante de criação |
| Manter v4 (`gen_random_uuid()`) | Nada a fazer; não revela nada | Índice fragmentado conforme a base cresce |
| `bigserial` | Menor (8 bytes) e sequencial | Ids adivinháveis nas URLs (`/m/123`); troca de tipo em todas as chaves estrangeiras |
| Gerar v7 na API (biblioteca em Node) | Id conhecido antes do `insert` | Dependência nova e duas fontes de id (inserções em SQL, seed e `fn_*` usariam outra) |

## Consequências

- **Instante de criação visível:** quem tem o id consegue extrair quando a linha foi criada (`uuid_extract_timestamp`).
  Para missões, lugares e evidências a data já aparece na tela. Para usuários, revela quando a conta foi criada; aceito
  como baixo risco.
- **Ordem:** o v7 do Postgres só é estritamente crescente dentro de uma mesma conexão. Paginação continua ordenando por
  `created_at` e usando o id só como desempate (como o cursor das notificações).
- **Bancos já existentes de desenvolvimento** mantêm as linhas antigas em v4; as novas saem em v7. Os dois convivem
  sem problema, e os bancos de teste e de e2e são recriados a cada execução.
