# Arquitetura e deploy

## Visão geral

```
 celular (PWA) ──HTTPS──▶ Dokploy/Caddy (KVM 8) ──▶ garimpa (Node 22 · Hono)
   React 19 · Vite · Tailwind 4             │           ├─ /api/*   JSON, cookie de sessão (JWT HS256)
   Motion · Leaflet · TanStack Query        │           ├─ /u/*     fotos (disco, volume garimpa-uploads)
   login: Google Identity Services ─────────┘           └─ /*       build do PWA (web/dist)
                                                             │
                                                      PostgreSQL 16 (garimpa-db)
                                                      earthdistance · pg_trgm · unaccent · tsvector pt
   tiles: https://onibus.incubadora.cloud/tiles/{z}/{x}/{y}.png (próprios) → OSM como reserva
```

Um contêiner de aplicação, um de banco, um de backup. Nenhum serviço externo além do login do Google e dos tiles já hospedados.

## Pastas

| Caminho | O que é |
|---|---|
| `api/` | API Hono + TypeScript. `src/routes/*` por domínio; `src/economy.ts` (níveis, lançamentos); `src/evidence.ts` (EXIF, dHash, pontuação); `src/auth.ts` (Google, cookie, sinais de conluio); `src/seed.ts` (dados de demonstração) |
| `web/` | PWA. `src/pages/*` (Mapa, Garimpos, Perguntar, Pergunta, Responder, Ranking, Perfil, Entrar, Lugar); `src/components/*` (MapView, AnswerTicket, EvidenceChecklist…); `src/styles.css` (tokens) |
| `db/migrations/` | SQL puro, aplicado em ordem pela API na subida (`schema_migrations`) |
| `infra/` | `Dockerfile` (uma imagem: API + build do PWA), `docker-compose.yml` para o Dokploy, `Caddyfile` alternativo |
| `scripts/local-postgres.sh` | Postgres 16 local sem Docker (desenvolvimento e testes) |
| `docs/` | esta documentação |

## Rodar localmente

```bash
pnpm install
scripts/local-postgres.sh start        # postgres://postgres@127.0.0.1:54329/garimpa (e garimpa_test)
pnpm db:migrate && pnpm db:seed        # esquema + dados de demonstração (6 pessoas, 10 lugares, 8 perguntas)
pnpm dev                               # API em :8787 e Vite em :5173 (proxy de /api e /u)
```

Abra <http://localhost:5173>. Sem `GOOGLE_CLIENT_ID`, a tela de entrada mostra o login de desenvolvimento: digite `marina`, `joao`, `tais`, `rafael`, `lucas` ou `dona neide` para usar uma conta do seed, ou qualquer outro nome para criar uma conta nova.

Testes (Postgres local precisa estar de pé):

```bash
pnpm --filter garimpa-api test     # economia, evidência, fluxo ponta a ponta, conluio, denúncias, sequência diária
pnpm typecheck && pnpm build
```

## Deploy no KVM 8 (Dokploy)

1. **Projeto** `garimpa` → **Compose** apontando para este repositório, caminho `infra/docker-compose.yml`.
2. **Variáveis** (aba Environment): `POSTGRES_PASSWORD`, `SESSION_SECRET` (`openssl rand -hex 32`), `GOOGLE_CLIENT_ID`, `PUBLIC_URL=https://garimpa.incubadora.cloud`.
3. **Domínio**: `garimpa.incubadora.cloud` → serviço `garimpa`, porta `8787`, HTTPS automático. Depois, adicionar `garimpa.app.br` quando registrado.
4. Deploy. A API aplica as migrações sozinha na subida e cria a cidade de Ariquemes. Para dados de demonstração em produção **não** rode o seed.
5. **Backups**: o serviço `garimpa-backup` gera um `pg_dump` diário em volume próprio (14 dias). Copie para fora da VPS com a mesma rotina `rclone` do Traccar. As fotos ficam em `garimpa-uploads`; inclua o volume no backup semanal.
6. **Uptime Kuma**: monitor HTTP em `https://garimpa.incubadora.cloud/api/health`.

### Login com Google

Console do Google Cloud → APIs e serviços → Credenciais → **ID do cliente OAuth** (aplicativo da Web).
Origens JavaScript autorizadas: `https://garimpa.incubadora.cloud`, `https://garimpa.app.br`, `http://localhost:5173`. Não precisa de URI de redirecionamento (o botão usa popup e devolve um ID token, verificado na API contra as chaves públicas do Google).

### Tiles

O app usa os tiles próprios de Ariquemes já servidos pelo app dos ônibus (zoom 12–18). Fora dessa área, ou se o servidor estiver fora do ar, o `MapView` troca para o OpenStreetMap depois de 4 erros de tile. Para outra cidade, gere os tiles com `infra/tiles/` do repositório dos ônibus e mude `TILES_URL`.

## Segurança

- Cookie `garimpa_s`: `HttpOnly`, `SameSite=Lax`, `Secure` em produção, 30 dias.
- Fotos regravadas sem EXIF; caminho servido só no formato `ano/mes/<sha256>.jpg`.
- Limites diários por usuário em todas as rotas de escrita; tamanho máximo de upload 8 MB.
- IP e dispositivo guardados só como hash salgado (`user_signals`), para conluio.
- `DELETE /api/auth/account` anonimiza a conta (LGPD).

## Operação do dia a dia

| Tarefa | Como |
|---|---|
| Mudar valores da economia | `update settings set value = jsonb_set(value, '{pepitas,resposta_aceita}', '30') where key = 'economia';` (sem deploy) |
| Promover moderador | `update users set role = 'moderator' where handle = 'fulano';` |
| Ver denúncias abertas | `GET /api/admin/flags` (moderador) ou `select * from flags where status = 'aberta';` |
| Apagar dados de demonstração | `psql $DATABASE_URL -f db/remove-demo.sql` (o livro-razão não tem cascata; o script apaga na ordem certa) |
| Liberar carências manualmente | `select fn_vest_due();` (a API já faz a cada 10 min) |

## Evoluções previstas

- Notificações push (Web Push, VAPID) quando a sua pergunta recebe pista.
- Painel do parceiro (fase 2): reivindicar lugar, campanhas, relatório de demanda.
- Resgate via Pix (fase 2): `payouts` + conciliação com o Cofre.
- PostGIS quando houver polígonos de bairro ou área de cobertura.
