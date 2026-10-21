# Pepita Social

<p align="center"><img src="web/public/icons/og.png" alt="Pepita Social — O que você procura está mais perto." width="600"></p>

**Onde encontro isso em Ariquemes?** Pergunte. Quem já viu o produto numa loja responde com foto no local. O mapa guarda a resposta para a próxima pessoa. Quem ajuda ganha pepitas.

PWA colaborativa e gamificada, piloto em Ariquemes-RO, da Incubadora de Software do IFRO. Sem loja de aplicativos: um link, login com Google, instala na tela inicial. Repositório próprio: `andreyquadros/garimpa.app.br`.

| Boas-vindas | Explorar | Missões | Missão |
|---|---|---|---|
| ![Boas-vindas](docs/screenshots/demo-00-boas-vindas.png) | ![Explorar](docs/screenshots/demo-01-explorar.png) | ![Missões](docs/screenshots/demo-02-missoes.png) | ![Missão](docs/screenshots/demo-03-missao.png) |

| Evidência | Conquista | Nova missão (reuso) | Missão encontrada |
|---|---|---|---|
| ![Evidência](docs/screenshots/demo-04-evidencia.png) | ![Conquista](docs/screenshots/demo-05-conquista.png) | ![Nova missão](docs/screenshots/demo-10-nova-missao.png) | ![Encontrada](docs/screenshots/demo-06-missao-encontrada.png) |

| Carteira (carência) | Busca e reuso | Jornada | Missões (escuro) |
|---|---|---|---|
| ![Carteira](docs/screenshots/demo-07-carteira-carencia.png) | ![Busca](docs/screenshots/demo-12-busca.png) | ![Jornada](docs/screenshots/demo-09-jornada.png) | ![Escuro](docs/screenshots/demo-11-missoes-escuro.png) |

Identidade visual, mascote **Pepi** e animações: [docs/design](docs/design) (pacote de assets aplicado em `web/public/brand`).

## Testar agora

- **Demonstração sem banco nem servidor**: `pnpm --filter garimpa-web dev:demo`. Roda inteira no navegador com uma API simulada e dados de exemplo; entre como `marina`, `joao`, `tais`, `lucas` ou `dona neide` (ou qualquer nome novo) e percorra o fluxo completo: explorar, abrir uma missão, enviar evidência com foto, confirmar, aceitar, agradecer com pepitas, jornada e carteira. O selo "Demonstração" tem "Simular 7 dias" (libera as pepitas em carência) e "Reiniciar". Os dados ficam só no seu aparelho.
- **Versão real, local**: seção "Rodar" abaixo (Postgres + API + PWA em dois comandos).
- Para publicar o demo: `pnpm --filter garimpa-web build:demo` gera arquivos estáticos em `web/dist-demo`, que qualquer hospedagem de arquivos serve.
- **Versão real no KVM 8**: [docs/06-arquitetura-e-deploy.md](docs/06-arquitetura-e-deploy.md), seção Dokploy.

## Como funciona

1. **Explorar** no mapa (busca no centro). Pinos **Confirmado**, **Reconfirmar** (evidência com mais de 30 dias) e **Patrocinado** mostram onde já encontraram; a folha "Já encontraram por aqui" reaproveita descobertas. Se já existe uma missão parecida, dá para marcar "também preciso" em vez de abrir outra.
2. **Colaborar com evidência**: foto do produto na loja (GPS da foto e a sua localização contam), nota ou recibo, e a loja no mapa. Um checklist animado mostra na hora a força da evidência; o Pepi comemora quando ela entra.
3. **Confirmar**: duas pessoas confirmando no local validam a descoberta; quem abriu a missão aceita a que resolveu ("Foi aqui que encontrei"), com confete, e agradece com pepitas.
4. **Pepitas e XP**: XP mede a jornada (patentes Explorador, Garimpeiro, Guia local, Guardião e Lenda local) e nunca vira dinheiro; pepitas nascem só de descobertas aceitas ou confirmadas, ficam 7 dias em carência e, na fase 2, viram reais pelo fundo de recompensas das lojas parceiras.

## Documentação

| Documento | Conteúdo |
|---|---|
| [docs/00-visao-do-produto.md](docs/00-visao-do-produto.md) | problema, aposta, personas, métricas do piloto, riscos |
| [docs/01-dominios.md](docs/01-dominios.md) | histórico do nome (Garimpa → Pepita Social), domínios candidatos e verificados, como registrar |
| [docs/adr/0001-banco-de-dados.md](docs/adr/0001-banco-de-dados.md) | por que **PostgreSQL 18** auto-hospedado (e não Supabase, Firestore ou PocketBase) |
| [docs/03-gamificacao-arvore-de-pontos.md](docs/03-gamificacao-arvore-de-pontos.md) | XP × pepitas, tabela de eventos, níveis, conquistas, por que não onera cedo |
| [docs/04-antiplagio-e-confianca.md](docs/04-antiplagio-e-confianca.md) | primeiro achado, hash perceptual, EXIF, texto copiado, conluio, denúncias, carência |
| [docs/05-modelo-de-negocio.md](docs/05-modelo-de-negocio.md) | fase 1 (hábito), fase 2 (lojas parceiras e Cofre), fase 3, benchmark, LGPD |
| [docs/06-arquitetura-e-deploy.md](docs/06-arquitetura-e-deploy.md) | pastas, rodar local, deploy no KVM 8 com Dokploy, Google OAuth, operação |

## Stack

| Camada | Tecnologia |
|---|---|
| PWA | React 19, Vite 8, TypeScript, Tailwind 4, Motion, Leaflet (tiles próprios de Ariquemes), TanStack Query, vite-plugin-pwa |
| API | Node 22, Hono, Postgres.js, jose (Google ID token), sharp + exifr (provas), zod |
| Banco | PostgreSQL 18 com PostGIS, `pg_trgm`, `unaccent`, `tsvector('portuguese')`; livro-razão em PL/pgSQL |
| Cache | Redis 8 (leituras públicas, invalidação por versão de grupo; opcional via `REDIS_URL`), ver [ADR-0006](docs/adr/0006-cache-com-redis.md) |
| Avisos | Notificações na lista do app (Postgres) e Web Push com VAPID (`web-push`, service worker próprio; opcional via `VAPID_*`), ver [ADR-0007](docs/adr/0007-notificacoes-web-push.md) |
| Deploy | uma imagem Docker (API serve o PWA e as fotos) + Postgres + Redis + backup, via Dokploy no KVM 8 |

## Rodar

Precisa de Node 22 e pnpm. Sem pnpm: `npm i -g pnpm@10.28.0` (pode pedir `sudo`, conforme o prefixo do npm) ou use
`npx pnpm@10.28.0 <comando>` no lugar de `pnpm <comando>`.

```bash
pnpm install
scripts/local-postgres.sh start      # Postgres 18 local (binários instalados ou Docker)
scripts/local-redis.sh start         # Redis 8 local em Docker (necessário para os testes da API e o e2e)
pnpm db:migrate && pnpm db:seed      # esquema + dados de demonstração
pnpm dev                             # http://localhost:5173 (API em :8787)
pnpm --filter garimpa-api test       # testes contra o Postgres e o Redis locais
```

O script usa os binários locais do PostgreSQL só se eles tiverem PostGIS (`postgis.control`); senão cai para o Docker
(imagem `postgis/postgis:18-3.6-alpine`). `PGLOCAL_MODE=docker` ou `PGLOCAL_MODE=binarios` força um dos modos.

Para ligar o cache no `pnpm dev`, exporte `REDIS_URL=redis://127.0.0.1:63799/0`; sem a variável a API funciona sem cache.

Sem `GOOGLE_CLIENT_ID` o app oferece login de desenvolvimento: entre como `marina` para ver uma conta com histórico.

## Estado

Piloto funcional, pronto para subir no KVM 8: mapa com busca e deduplicação, perguntar, responder com prova e checklist, confirmações ponderadas, aceite com gorjeta, ranking semanal e geral, perfil com níveis e conquistas, antiplágio (hash perceptual, EXIF, texto, conluio, denúncias) e livro-razão com carência e estorno. Avisos dentro do app e push no celular quando chega evidência, confirmação, aceite, gorjeta ou liberação de pepitas. Fora do escopo desta entrega: painel do lojista e resgate via Pix (fase 2).
