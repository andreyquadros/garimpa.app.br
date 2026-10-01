# Domínios e nome

| | |
|---|---|
| **Decisão** | Nome **Garimpa**. Registrar `garimpa.app.br` (principal) e `garimpa.com.br` (redirecionamento) no Registro.br. Piloto no ar hoje em `garimpa.incubadora.cloud` (domínio já pago pela Incubadora). |
| **Custo** | R$ 40/ano por domínio no Registro.br (preço fixo, renovação igual). Nada em dólar. |
| **Confirmar antes de pagar** | A consulta RDAP/WHOIS estava bloqueada na rede desta sessão; a disponibilidade abaixo é um sinal indireto (nenhum site indexado respondendo nesses domínios). Confirme em <https://registro.br/> antes de registrar. |

## Por que "Garimpa"

- **É de Ariquemes.** A cidade nasceu do garimpo de cassiterita; a mina do Bom Futuro é dali. O nome conversa com a identidade local sem prender o produto à cidade (funciona em Ji-Paraná ou Porto Velho amanhã).
- **"Garimpar" já significa achar coisa boa.** É gíria nacional ("garimpei essa panela na loja X"). O usuário entende o app pelo nome.
- **Metáfora pronta para gamificação.** Pontos são **pepitas**; níveis vão de Peneira a Lenda da jazida; o mapa é o mapa do garimpo; lojas parceiras são jazidas em destaque; confirmar um achado é "bater a bateia".
- **Imperativo curto.** Duas sílabas fortes, fácil de falar e de digitar no WhatsApp.

## Candidatos verificados

Sinal usado: busca `site:dominio` (um site ativo aparece indexado). "Livre?" significa só que nada foi encontrado; não substitui a consulta oficial.

| Domínio | Sinal | Observação |
|---|---|---|
| `garimpa.app.br` | livre? | **Primeira escolha.** ".app.br" diz o que é, fica no Registro.br, R$ 40/ano. |
| `garimpa.com.br` | livre? | Registrar junto e redirecionar; evita que alguém pegue depois. |
| `garimpaqui.com.br` | livre? | Plano B ("garimpa aqui"). |
| `garimpae.com.br` | livre? | Plano C ("garimpaê"), mais informal. |
| `garimpa.app` | sem sinal | Registro Google, cobrado em dólar (≈ US$ 14–20/ano) e com HTTPS obrigatório (o Caddy já resolve). Só se quiser a extensão global. |
| `pepita.app` | livre? | Nome do ponto, não do app; guardar como ideia de submarca. |
| `achaai.com.br` | **ocupado** | Guia comercial ativo (Achaaí). Descartado também por colisão de marca. |
| `ondetem.app` | **ocupado** | Localizador de produtos de fabricantes/distribuidores. É o concorrente mais próximo em proposta; ver posicionamento no modelo de negócio. |
| `temaqui.com.br` | **ocupado** | Loja virtual inativa, mas registrado. |
| `taonde.app` | **ocupado** | Buscador de filmes em streaming. |
| `fareja.com.br` | **ocupado** | Agregador de classificados (imóveis, carros). "Fareja" era a alternativa com mascote cachorro. |
| `cadetem.com.br` / `.app` | livre? | Alternativa fora da metáfora do garimpo. |

## Marca

- Existe um app "Garimpeiros" (comunidade de promoções on-line) e o app de mobilidade "Garupa". Nenhum usa "Garimpa", mas antes de investir em identidade visual vale uma busca no INPI (classe 42, software; classe 35, publicidade/intermediação) e, se for seguir, um pedido de registro (≈ R$ 142 por classe com desconto para instituição de ensino).
- Registrar os perfis `@garimpa.app` / `@garimpaapp` no Instagram e no WhatsApp Business ao mesmo tempo que o domínio.

## Como registrar (passo a passo)

1. Entrar em <https://registro.br/>, pesquisar `garimpa.app.br` e `garimpa.com.br`.
2. Titular: a Incubadora (CNPJ do IFRO) ou pessoa física; o contato técnico pode ser o mesmo de `incubadora.cloud`.
3. Apontar DNS para o KVM 8 (registro A para o IP da VPS) ou usar o DNS do Registro.br com o mesmo registro A.
4. No Dokploy, adicionar o domínio ao serviço `web` do `garimpa`; o Caddy emite o certificado sozinho.
5. Manter `garimpa.incubadora.cloud` como redirecionamento 301 para o domínio novo.

## Fontes

- Preço e regras do Registro.br: <https://registro.br/> (R$ 40/ano para `.com.br` e `.app.br`), resumo em <https://blog.linkfl.com.br/quanto-custa-um-dominio/> e <https://techub.digital/blog/article/dominio-combr-barato-em-2026-onde-registrar-sem-tomar-susto-na-renovacao>.
- `.app` (Google Registry) e HTTPS obrigatório: <https://www.registry.google/domains/app/>.
