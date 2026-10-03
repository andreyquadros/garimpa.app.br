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

- **Demonstração no celular, sem instalar nada**: <https://andreyquadros.github.io/garimpa.app.br/>. Roda inteira no navegador com uma API simulada e dados de exemplo; entre como `marina`, `joao`, `tais`, `lucas` ou `dona neide` (ou qualquer nome novo) e percorra o fluxo completo: explorar, abrir uma missão, enviar evidência com foto, confirmar, aceitar, agradecer com pepitas, jornada e carteira. O selo "Demonstração" tem "Simular 7 dias" (libera as pepitas em carência) e "Reiniciar". Os dados ficam só no seu aparelho.
- **Versão real, local**: seção "Rodar" abaixo (Postgres + API + PWA em dois comandos).
- Para quem mantém o repositório: o link do demo é publicado pelo workflow "Demo no GitHub Pages" a cada push em `main`; na primeira vez é preciso ativar o Pages em Settings → Pages → Source: GitHub Actions.
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
| [docs/02-adr-banco-de-dados.md](docs/02-adr-banco-de-dados.md) | por que **PostgreSQL 16** auto-hospedado (e não Supabase, Firestore ou PocketBase) |
| [docs/03-gamificacao-arvore-de-pontos.md](docs/03-gamificacao-arvore-de-pontos.md) | XP × pepitas, tabela de eventos, níveis, conquistas, por que não onera cedo |
| [docs/04-antiplagio-e-confianca.md](docs/04-antiplagio-e-confianca.md) | primeiro achado, hash perceptual, EXIF, texto copiado, conluio, denúncias, carência |
| [docs/05-modelo-de-negocio.md](docs/05-modelo-de-negocio.md) | fase 1 (hábito), fase 2 (lojas parceiras e Cofre), fase 3, benchmark, LGPD |
| [docs/06-arquitetura-e-deploy.md](docs/06-arquitetura-e-deploy.md) | pastas, rodar local, deploy no KVM 8 com Dokploy, Google OAuth, operação |

## Stack

| Camada | Tecnologia |
|---|---|
| PWA | React 19, Vite 8, TypeScript, Tailwind 4, Motion, Leaflet (tiles próprios de Ariquemes), TanStack Query, vite-plugin-pwa |
| API | Node 22, Hono, Postgres.js, jose (Google ID token), sharp + exifr (provas), zod |
| Banco | PostgreSQL 16 com `earthdistance`, `pg_trgm`, `unaccent`, `tsvector('portuguese')`; livro-razão em PL/pgSQL |
| Deploy | uma imagem Docker (API serve o PWA e as fotos) + Postgres + backup, via Dokploy no KVM 8 |

## Rodar

```bash
pnpm install
scripts/local-postgres.sh start      # Postgres 16 local, sem Docker
pnpm db:migrate && pnpm db:seed      # esquema + dados de demonstração
pnpm dev                             # http://localhost:5173 (API em :8787)
pnpm --filter garimpa-api test       # testes contra o Postgres local
```

Sem `GOOGLE_CLIENT_ID` o app oferece login de desenvolvimento: entre como `marina` para ver uma conta com histórico.

## Estado

Piloto funcional, pronto para subir no KVM 8: mapa com busca e deduplicação, perguntar, responder com prova e checklist, confirmações ponderadas, aceite com gorjeta, ranking semanal e geral, perfil com níveis e conquistas, antiplágio (hash perceptual, EXIF, texto, conluio, denúncias) e livro-razão com carência e estorno. Fora do escopo desta entrega: notificações push, painel do lojista e resgate via Pix (fase 2).
