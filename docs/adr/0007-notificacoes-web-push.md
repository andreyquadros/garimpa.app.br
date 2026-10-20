# ADR-0007 — Notificações com fila no Postgres e Web Push

| | |
|---|---|
| **Status** | Aceita (out/2026) · implementada |
| **Decisão** | Cada aviso é gravado em `notifications` na mesma transação do evento; um enviador separado entrega por **Web Push (VAPID)**, direto aos serviços de push dos navegadores, sem Firebase. |

Detalhes do desenho: `docs/superpowers/specs/2026-10-20-notificacoes-design.md`.

## Contexto

Quem abre uma missão não volta ao app só para ver se alguém respondeu. Os avisos trazem a pessoa de volta no momento certo: nova evidência, evidência confirmada, aceite, gorjeta e liberação de pepitas.

Requisitos que moldam a decisão: nunca perder um aviso por falha de rede ou queda da API; o aviso só existe se o evento foi confirmado (commit); funcionar com várias réplicas da API; sem dependência de serviço externo pago; o app precisa continuar útil sem push (permissão negada, iPhone sem o app instalado, chaves não configuradas).

## Decisão

- **Uma tabela, duas funções:** `notifications` serve de lista no app e de fila de envio (`status`: `pendente`, `enviado`, `falhou`, `desativado`). `push_subscriptions` guarda uma inscrição por aparelho (migração `0007_notificacoes.sql`).
- **Gravação na transação:** `notify(tx, rows)` (`api/src/notifications/store.ts`) roda dentro da transação da escrita; os textos ficam em `api/src/notifications/texts.ts` (título até 80, corpo até 160 caracteres). `fn_vest_due()` também cria um aviso `pepitas_liberadas` por pessoa. Quem foi banido nunca é avisado.
- **Eventos:** nova evidência (autor da missão e seguidores, menos quem respondeu), evidência confirmada (só na transição), aceita, gorjeta e pepitas liberadas.
- **Enviador:** a cada 5 s, só com VAPID configurada. Pega até 50 linhas numa transação curta (`FOR UPDATE SKIP LOCKED` e reserva de 5 minutos, cobrindo o pior caso de 10 envios em série por worker com timeout de 10 s), envia **fora** da transação (5 em paralelo) e grava o resultado com atualizações protegidas. `TTL` de 86400 s, `Topic` por missão (32 hex do uuid; um aviso novo da mesma missão substitui o anterior no aparelho) e urgência normal. Resposta 404 ou 410 apaga a inscrição; outras falhas tentam de novo após 1 min, 5 min, 30 min e 2 h, e a quinta falha marca `falhou`. Erro inesperado numa notificação é isolado (log e a linha segue `pendente` até a reserva vencer), e o lote só retorna quando todos os envios terminaram. Inscrição que chega à 10ª falha seguida é apagada.
- **Sem VAPID:** o push fica desligado, `runTick` converte `pendente` em `desativado` e a lista dentro do app funciona normalmente. Isso desvia da spec, que mandava gravar já como `desativado`: o plano grava sempre `pendente` (inclusive no `fn_vest_due`, que não conhece a configuração da API) e o enviador converte; o efeito para a pessoa é o mesmo e a linha fica `pendente` por no máximo um ciclo.
- **Chaves:** `pnpm push:keys` imprime `VAPID_PUBLIC_KEY=` e `VAPID_PRIVATE_KEY=`; `VAPID_SUBJECT` precisa ser `mailto:` ou `https:`.
- **Rotas:** `GET /api/notifications?before=<cursor>` (cursor opaco `<µs>_<uuid>`), `POST /api/notifications/read`, `GET /api/push/key`, `POST` e `DELETE /api/push/subscriptions`.
- **Trava de endpoints:** só `https`, sem porta nem usuário na URL, apenas hosts de push do Google, Mozilla, Apple e Microsoft; o endpoint é guardado normalizado. Evita que a API seja usada para disparar requisições a hosts arbitrários.
- **App:** service worker próprio (`web/src/sw.ts`, `injectManifest`) que sempre mostra uma notificação, mesmo com carga inválida, e só abre caminhos internos ao tocar; sino com contagem (consulta a cada 60 s, ao voltar o foco e ao receber mensagem do push); página `/notificacoes`; cartão de permissão depois de publicar missão ou enviar evidência ("Agora não" silencia por 30 dias); instruções para iPhone sem o app instalado; chave "Avisos no celular" na Carteira. Ao sair da conta o app cancela o push, apaga o cache de runtime `api` e limpa o cache de consultas.
- **Retenção:** limpeza de 90 dias; excluir a conta apaga notificações e inscrições.

## Opções comparadas

Como enviar:

| Opção | A favor | Contra |
|---|---|---|
| **Fila no Postgres + enviador** | Aviso gravado junto com o evento (atômico); sobrevive a queda; várias réplicas sem coordenação extra (`SKIP LOCKED`); a lista do app vem de graça | Atraso de até ~5 s; o enviador precisa de cuidado com reserva e tentativas |
| Envio direto na rota | Sem atraso | Chamada externa lenta dentro da requisição ou da transação; falha do serviço de push derruba ou atrasa a escrita; aviso perdido se a API cair depois do commit |
| Fila externa (Redis, broker) | Latência baixa | Outro ponto de falha e de consistência: Redis é só cache aqui (ADR-0006) e não participa da transação |

Provedor:

| Opção | A favor | Contra |
|---|---|---|
| **Web Push com VAPID** | Padrão aberto; sem conta nem SDK de terceiro; mesmo mecanismo no Chrome, Firefox, Safari e Edge | iPhone só recebe com o app instalado na tela inicial (iOS 16.4+) |
| Firebase Cloud Messaging | Painel e métricas; SDK nativo se houver app de loja | Projeto e credenciais do Google; SDK no front; dados de aparelho em serviço de terceiro; sem ganho para um PWA |

## Consequências

- **Atraso:** o push chega até ~5 s depois do evento (mais o tempo do serviço de push); a lista no app é imediata.
- **iPhone:** só recebe push com o app instalado; fora disso o app mostra instruções e a lista continua valendo.
- **Push desligado sem chaves:** sem `VAPID_*` não há envio, e as notificações aparecem só no app. As variáveis precisam estar no compose/Dokploy; trocar o par depois invalida as inscrições existentes.
- **Entrega "pelo menos uma vez":** se a API cair depois de enviar e antes de gravar `enviado`, ou se a reserva vencer durante um envio lento, o aparelho pode receber o aviso duas vezes. O `Topic` por missão faz o segundo substituir o primeiro na maioria dos casos. Evitar duplicata exigiria confirmação do serviço de push, que o protocolo não dá.
- **Risco aceito:** o endpoint de push é uma URL secreta (capacidade). Quem souber o endpoint de outra pessoa poderia registrá-lo na própria conta e, com isso, tirar a inscrição dela e silenciar o push. A lista dentro do app não é afetada. Aceito: o endpoint não é exposto pela API e a trava de hosts limita o estrago.
- **Escrita nova que avisa alguém** segue a regra do `CLAUDE.md`: `notify` na mesma transação, com o texto em `texts.ts`.
- **Verificação em aparelho real** é manual: `docs/notificacoes-verificacao-manual.md`.
