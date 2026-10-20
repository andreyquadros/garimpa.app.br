# Notificações (lista no app + Web Push) — design

| | |
|---|---|
| **Status** | Proposto (out/2026) |
| **Escopo** | Entrega 1: infraestrutura de notificações e os avisos de resposta. "Missão perto de mim" fica para a entrega 2, com spec própria. |
| **ADR** | ADR-0007 "Notificações com Web Push e fila no Postgres" (criada na implementação, a partir desta spec) |

## Objetivo

Trazer a pessoa de volta ao app quando algo que ela fez recebe resposta: uma pista na missão dela, a evidência dela confirmada, aceita ou agradecida, e pepitas liberadas.

## Requisitos

1. **Toda notificação fica guardada** e aparece numa lista no app (sininho com contador de não lidas). O push no celular é um dos canais, não o único.
2. **Gravou o evento, o aviso existe:** a notificação é gravada na mesma transação da escrita que a origina.
3. **Ninguém é avisado da própria ação.**
4. **Push opcional e degradável:** sem chaves VAPID configuradas, sem permissão do navegador ou sem aparelho inscrito, a lista no app continua funcionando.
5. **Sem serviço externo além do push do navegador** (Web Push padrão; nada de Firebase).
6. **Seguro com várias réplicas da API:** cada notificação é enviada uma vez.
7. **LGPD:** excluir a conta apaga notificações e inscrições; sair da conta remove a inscrição do aparelho; notificações com mais de 90 dias são apagadas.
8. **Nada pessoal no cache** (ADR-0006): as rotas novas não usam `cached`.

## Dados (migração nova)

### `notifications` — lista no app e fila de envio

| Coluna | Tipo / regra |
|---|---|
| `id` | `uuid` (padrão do esquema atual) |
| `user_id` | destinatário; `references users(id) on delete cascade` |
| `kind` | `nova_evidencia`, `evidencia_confirmada`, `evidencia_aceita`, `gorjeta_recebida`, `pepitas_liberadas` |
| `title`, `body` | texto pronto para exibir, em português |
| `url` | destino do toque, caminho do app (ex.: `/m/<id>`, `/carteira`) |
| `topic` | agrupamento no aparelho (ex.: `missao-<id>`); nulo quando não agrupa |
| `ref_type`, `ref_id` | origem (`pergunta`, `resposta`, `gorjeta`, `ledger`) |
| `created_at` | `now()` |
| `read_at` | nulo até ser lida |
| `push_state` | `pendente` (padrão), `enviado`, `sem_assinatura`, `desativado`, `falhou` |
| `push_attempts` | inteiro, padrão 0 |
| `push_next_at` | quando tentar o envio; padrão `now()` |

Índices: `(user_id, created_at desc)`; `(push_next_at) where push_state = 'pendente'`.

### `push_subscriptions` — um registro por aparelho/navegador

| Coluna | Tipo / regra |
|---|---|
| `id` | `uuid` |
| `user_id` | `references users(id) on delete cascade` |
| `endpoint` | `text unique` |
| `p256dh`, `auth` | chaves da inscrição |
| `user_agent` | texto curto, para depuração |
| `created_at`, `last_success_at` | |
| `failures` | inteiro, padrão 0 |

## Eventos

| Evento (onde nasce) | Quem recebe | `kind` | Texto (modelo) | `url` / `topic` |
|---|---|---|---|---|
| Nova evidência — `POST /questions/:id/answers` | autor da missão e quem segue (`question_followers`), menos quem respondeu | `nova_evidencia` | "Nova pista para *<título>*: <lugar>" | `/m/<qid>` / `missao-<qid>` |
| Evidência muda para `confirmada` — `POST /answers/:id/confirm` (só na transição, não a cada voto) | autor da evidência | `evidencia_confirmada` | "Sua pista em <lugar> foi confirmada" | `/m/<qid>` / `missao-<qid>` |
| Evidência aceita — `POST /questions/:id/accept` | autor da evidência | `evidencia_aceita` | "Foi aqui que encontrei! Sua pista em <lugar> foi escolhida" (+ "+N pepitas" quando houver) | `/m/<qid>` / `missao-<qid>` |
| Gorjeta — `POST /answers/:id/tip` | quem recebeu | `gorjeta_recebida` | "<nome> agradeceu com N pepitas" | `/m/<qid>` / `missao-<qid>` |
| Pepitas liberadas — `fn_vest_due()` | dono | `pepitas_liberadas` | "N pepitas liberadas na sua carteira" | `/carteira` / `pepitas` |

- **Pepitas liberadas** nasce no banco: uma migração nova recria `fn_vest_due()` para também inserir, na mesma transação, **uma** notificação por pessoa com a soma liberada (só quando a soma > 0). Continua devolvendo a contagem de lançamentos, como hoje.
- Os textos ficam num módulo único da API (`api/src/notifications/texts.ts`), não espalhados nas rotas.
- Os avisos das rotas são gravados pela função `notify(tx, rows)` (inserção em lote) dentro da transação da rota. Rotas que hoje gravam fora de transação passam a gravar evento e aviso juntos.

## Envio (Web Push)

- Biblioteca `web-push` (versão exata, com pelo menos duas semanas de lançamento), chaves **VAPID**: `VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY`, `VAPID_SUBJECT` (`mailto:`). Comando `pnpm push:keys` gera o par.
- **Sem as três variáveis:** push desligado. Notificações novas entram como `push_state = 'desativado'` e o remetente não roda.
- **Remetente** na própria API, a cada **5 s**: lote de até 50 com `select … where push_state = 'pendente' and push_next_at <= now() order by push_next_at for update skip locked`, numa transação curta por lote.
  - Para cada notificação, envia a todas as inscrições do destinatário. Payload JSON `{ id, title, body, url, topic }`; `TTL` 24 h; cabeçalho `Topic` = `topic` (quando houver); `urgency: normal`.
  - Pelo menos uma entrega → `enviado` (e `last_success_at` da inscrição).
  - Destinatário sem inscrição → `sem_assinatura`.
  - Resposta 404/410 de uma inscrição → a inscrição é apagada.
  - Outro erro (rede, 5xx, 429) → `push_attempts + 1` e `push_next_at` em 1 min, 5 min, 30 min, 2 h; na 5ª falha → `falhou`.
- O envio passa por uma interface `PushTransport` (`send(subscription, payload, options) → { statusCode }`), cuja implementação de produção usa `web-push`. Nos testes, uma implementação controlada.
- Atraso esperado entre a ação e o push: até ~5 s.

## API

| Rota | Comportamento |
|---|---|
| `GET /api/push/key` | `{ publicKey: string \| null }` |
| `POST /api/push/subscriptions` | Corpo `{ endpoint, keys: { p256dh, auth } }` (zod; `endpoint` https). Inscreve o aparelho para a pessoa logada; se o `endpoint` já pertence a outra conta, passa a ser só desta. 201 |
| `DELETE /api/push/subscriptions` | Corpo `{ endpoint }`; remove só se for da pessoa logada. 200 |
| `GET /api/notifications?before=<created_at>` | Páginas de 30, do mais novo para o mais antigo: `{ items, unread, nextBefore }` |
| `POST /api/notifications/read` | Corpo `{ ids?: string[] }`; sem `ids`, marca todas. Só afeta as da pessoa logada. `{ unread }` |

Todas exigem login. Nenhuma usa cache.

- `DELETE /auth/account` passa a apagar notificações e inscrições da pessoa.
- A tarefa periódica (`runTick`) apaga notificações com mais de 90 dias.

## App (web)

- `vite-plugin-pwa` em modo `injectManifest`, com `web/src/sw.ts`:
  - mantém o precache atual (`precacheAndRoute(self.__WB_MANIFEST)`);
  - `push`: `showNotification(title, { body, icon, badge, tag: topic, data: { url, id } })` e avisa as janelas abertas (`postMessage`) para atualizar o contador;
  - `notificationclick`: foca uma janela do app e navega para `url`, ou abre uma nova.
  - Modo demonstração: inalterado (sem service worker).
- **Sininho** no cabeçalho (`Shell`) com o número de não lidas; atualiza ao voltar ao app, a cada 60 s com o app aberto e na chegada de push.
- **`/notificacoes`**: lista (não lidas destacadas), "Marcar todas como lidas", paginação; tocar marca como lida e abre o `url`.
- **Pedido de permissão contextual:** nunca ao abrir o app. Cartão "Quer ser avisado quando responderem?" depois de **publicar uma missão** ou **enviar uma evidência**; botão **Ativar avisos** → `Notification.requestPermission()` → `pushManager.subscribe({ userVisibleOnly: true, applicationServerKey })` → `POST /api/push/subscriptions`. "Agora não" esconde o cartão por 30 dias (localStorage). Permissão negada no navegador: não insiste.
- **Carteira:** opção **Avisos no celular** (liga/desliga), mostrando o estado real (ativo, negado no navegador, indisponível).
- **iPhone sem o app instalado** (Safari iOS fora do modo `standalone`): o cartão explica como adicionar à tela inicial em vez de pedir permissão.
- **Sair da conta:** cancela a inscrição do aparelho e chama `DELETE /api/push/subscriptions` antes do logout.
- Sem `publicKey` (push desligado no servidor): nada de cartão nem opção; o sininho continua.

## Testes

- **API (TDD, Postgres real):**
  - destinatários de cada evento da tabela, sem autoaviso; seguidores incluídos; `evidencia_confirmada` só na transição; `pepitas_liberadas` com uma linha por pessoa e a soma certa;
  - escrita recusada (400/409) não grava notificação;
  - rotas: paginação, `unread`, marcar lidas só as próprias, inscrição criada/reatribuída/removida, exclusão de conta apaga tudo, limpeza de 90 dias;
  - remetente com `PushTransport` controlado: `enviado`, `sem_assinatura`, 404/410 apaga a inscrição, erro → nova tentativa com a espera prevista, `falhou` na 5ª, dois remetentes simultâneos nunca enviam a mesma notificação, push desligado → `desativado`;
  - um teste com `web-push` real contra um servidor HTTP local, conferindo `TTL`, `Topic` e `Content-Encoding: aes128gcm`.
- **Web:** lógica pura em `web/src/lib/` (estado da permissão, detecção de iPhone sem instalar, regra dos 30 dias) com teste unitário; sininho e lista com Testing Library.
- **E2e:** no fluxo principal, depois da evidência, a autora vê o sininho com 1, abre `/notificacoes`, toca no aviso e chega à missão.
- **Verificação manual em aparelho real** registrada no PR: Android (Chrome) e iPhone com o app instalado recebem o push e o toque abre a missão; com permissão negada, só a lista funciona.

## Documentação

- ADR-0007: decisão (fila no Postgres + Web Push/VAPID), alternativas (envio direto na rota; Firebase Cloud Messaging), consequências (atraso de até ~5 s; iPhone só com o app instalado; push desligado sem chaves).
- `CLAUDE.md`: `pnpm push:keys`; regra "evento que avisa alguém grava a notificação na mesma transação, com o texto em `api/src/notifications/texts.ts`".
- `docs/06`: variáveis VAPID e como gerá-las para o Dokploy.

## Entrega (PRs encadeados)

1. Spec e plano.
2. Banco e eventos: tabelas, `notify` nas escritas, `fn_vest_due` com avisos, rotas da lista, limpeza de 90 dias, exclusão de conta.
3. Push na API: inscrições, chaves VAPID, `PushTransport`, remetente.
4. App: service worker, sininho, `/notificacoes`, pedido de permissão, opção na Carteira, logout.
5. Documentação e ADR-0007.

## Fora do escopo

"Missão perto de mim" (entrega 2), preferências por tipo de aviso, e-mail, horário de silêncio, app nativo.
