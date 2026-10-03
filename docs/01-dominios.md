# Domínios e nome

> **Atualização (3/10/2026):** o produto passou a se chamar **Pepita Social** (identidade visual do pacote Pepitaz, mascote Pepi). O repositório, os pacotes e o domínio técnico continuam `garimpa.app.br` até a decisão final de domínio; candidatos verificados para o novo nome: **`pepita.social`** (principal) e **`pepita.app.br`** (reserva), ver seção "Plano B" abaixo. O texto a seguir é o histórico da decisão original.

| | |
|---|---|
| **Decisão** | Nome **Garimpa**. Domínio principal **`garimpa.app.br`** (Registro.br, R$ 40/ano), disponível em 1º/10/2026 segundo consulta do autor no Registro.br. O piloto segue em `garimpa.incubadora.cloud` até o apontamento. |
| **Correção** | A versão anterior deste documento dizia que `garimpa.com.br` estava "livre?". **Estava errado.** O domínio está registrado, delegado e com zona DNS mantida (detalhes abaixo). O sinal usado antes (busca `site:`) só enxerga sites indexados; um domínio registrado sem site indexado passa despercebido. O mesmo erro valia para `garimpaqui.com.br` (empresa ativa) e `garimpa.app` (registrado). |
| **Registrar agora** | `garimpa.app.br` (principal) + `pepita.app.br` e `cassita.app.br` (reservas do plano B). R$ 120 no primeiro ano. |
| **Risco de marca** | Médio. "Garimpa" é usado por várias empresas ativas no Brasil (leilões, ofertas locais, e-commerce, SaaS). O INPI não pôde ser consultado nesta rede; fazer a busca antes de imprimir qualquer material. Plano B de nome pronto abaixo. |
| **Custo recorrente** | R$ 40/ano por domínio no Registro.br (ou R$ 184 por 5 anos). Nada em dólar. |

## Como verifiquei e o que cada rótulo significa

Verificações feitas em 1º de outubro de 2026. Nesta rede o proxy bloqueia registro.br, RDAP, WHOIS, DNS-over-HTTPS, archive.org, crt.sh, INPI e os próprios sites candidatos (`https://garimpa.com.br` e `https://www.garimpa.com.br` devolveram "bloqueado pelo proxy", assim como `https://registro.br/`). A busca na web funciona e **consultas DNS comuns funcionam** (resolvedores 8.8.8.8 e 1.1.1.1). Por isso o sinal principal passou a ser o DNS, não a busca.

| Rótulo | O que significa | Força |
|---|---|---|
| **Fato: ocupado** | O nome tem delegação (registros NS e SOA) na zona do registro. Só existe delegação para domínio registrado. | Confirmação |
| **Fato: disponível** | Consulta oficial no Registro.br, feita pelo autor. | Confirmação |
| **Sinal: provavelmente livre** | NXDOMAIN para NS, SOA e A (o nome não existe na zona). Domínio registrado quase sempre aparece na zona (DNS próprio, DNS do Registro.br ou DNS automático `a/b.auto.dns.br`), mas um domínio congelado por falta de pagamento ou em processo de liberação também some dela. | Forte, não oficial |
| **Não verificado** | Não consegui ver o conteúdo nem consultar a base oficial. | Nenhuma |

Controle: um nome inventado (`exemplo-inexistente-xyz123.com.br`) devolveu NXDOMAIN; `garimpa.app.br` devolveu o mesmo, coerente com a disponibilidade confirmada pelo autor.

Para repetir fora desta rede:

```bash
dig NS garimpa.app.br @8.8.8.8 +short            # vazio = não delegado
whois -h whois.registro.br garimpa.com.br        # titular, criação, expiração
curl -s https://rdap.registro.br/domain/garimpa.com.br | jq .events
```

## Por que "Garimpa"

- **É de Ariquemes.** A cidade nasceu do garimpo de cassiterita; a mina do Bom Futuro é dali. O nome conversa com a identidade local sem prender o produto à cidade (funciona em Ji-Paraná ou Porto Velho amanhã).
- **"Garimpar" já significa achar coisa boa.** É gíria nacional ("garimpei essa panela na loja X"). O usuário entende o app pelo nome antes de abrir.
- **Metáfora pronta para a gamificação.** Pontos são **pepitas**; níveis vão de Peneira a Guardião do mapa; o mapa é o mapa do garimpo; lojas parceiras são jazidas em destaque; confirmar um achado é "bater a bateia". O vocabulário vale mesmo que o nome mude (ver plano B).
- **Imperativo curto.** Duas sílabas fortes, fácil de falar, de digitar no WhatsApp e de gritar no balcão ("garimpa aí").
- **O lado ruim, dito com clareza.** Por ser palavra comum, "Garimpa" já é usada por muita gente (ver "Risco de marca"). Isso dificulta a exclusividade, mas também dificulta que alguém nos proíba de usar. Compensamos com tagline fixa ("Onde encontro isso em Ariquemes?") e identidade visual própria.

## Tabela de domínios

### Principal e proteção

| Domínio | Situação | Como verifiquei | Uso proposto |
|---|---|---|---|
| `garimpa.app.br` | **Fato: disponível** | Autor consultou o Registro.br em 1º/10/2026; DNS: NXDOMAIN (coerente). | **Principal.** Registrar hoje. |
| `www.garimpa.app.br` | Segue o principal | — | Registro A para o mesmo IP; o Dokploy redireciona para o apex. |
| `garimpa.com.br` | **Fato: ocupado** | Delegado a `dns1/dns2.ycorn.net`; A → `144.126.141.245` (reverso `vs100.ycorn.net`, hospedagem Ycorn); MX apontando para si mesmo e SPF configurado; serial SOA `2026100100` (zona mantida ativamente). Nenhuma página indexada; HTTP bloqueado nesta rede. | Nenhum. Não é nosso: remover de qualquer material e configuração. Anotar a expiração via WHOIS e revisitar. |
| `garimpaapp.com.br`, `garimpa-app.com.br`, `appgarimpa.com.br`, `garimpaapp.app.br` | Sinal: provavelmente livres | NXDOMAIN | Não registrar. Ninguém digita; sem ganho. |
| `usegarimpa.com.br` | Sinal: provavelmente livre | NXDOMAIN | Opcional, só se o handle social acabar sendo `usegarimpa`. |
| `garimpa.net.br`, `garimpa.tec.br`, `garimpa.dev.br`, `garimpa.blog.br`, `garimpa.eco.br` | Sinal: provavelmente livres | NXDOMAIN | Não registrar agora. Reavaliar com tração (R$ 40 cada). |
| `garimparo.com.br`, `garimpa-ro.com.br` | Sinal: provavelmente livres | NXDOMAIN | Não. A expansão é pela tabela `cities`, não por domínio. |
| `garimpa.ind.br` | Sinal: livre, mas restrito | NXDOMAIN; categoria exclusiva de indústrias | Não se aplica. |
| `garimpa.ro.gov.br` e parecidos | Não é opção | `.gov.br` e `.ro.gov.br` são exclusivos de órgãos públicos | Descartar; não existe "domínio do estado" para app privado. |

### Quem mais usa "garimpa" no DNS (colisões de nome)

| Domínio | Situação | Como verifiquei | Observação |
|---|---|---|---|
| `garimpa.app` | **Fato: ocupado** | Delegado à Cloudflare, com registros A (`www` também). Conteúdo não verificado (bloqueado). | A versão anterior dizia "sem sinal". Em dólar e já tomado: descartado. |
| `garimpa.digital` | **Fato: ocupado** | Cloudflare, registros A. | Descartado. |
| `garimpa.com` | **Fato: ocupado** | NS `afternic.com` (mercado secundário da GoDaddy): provavelmente à venda. | Não comprar. |
| `garimpa.net` | **Fato: ocupado** | NS Vercel. | — |
| `garimpa.io`, `garimpa.site`, `garimpa.store` | **Fato: ocupados** | NS `dns-parking.com` (estacionamento da Hostinger). | — |
| `garimpa.online` | **Fato: ocupado** | Google Cloud DNS, MX Zoho. | — |
| `garimpa.shop` | **Fato: ocupado** | A → Shopify; é a Garimpa Shop (`garimpashop.com.br`). | — |
| `garimpa.co`, `garimpa.org` | Sinal: provavelmente livres | NXDOMAIN | Em dólar, sem ganho. Não. |
| `garimpaqui.com.br` | **Fato: ocupado** | DNS do Registro.br (`d/e.sec.dns.br`), MX Google. Garimpaqui Comércio Ltda, Chapecó-SC, CNPJ 54.037.966/0001-22, lojas em SC e PR, 34 mil seguidores. | **Era o "plano B" da versão anterior. Inválido.** `garimpaqui.app.br` dá NXDOMAIN, mas colide com a marca: descartado. |
| `garimpae.com.br`, `garimpae.app.br` | Sinal: provavelmente livres | NXDOMAIN; porém `garimpae.com` é a loja "Garimpaê", ativa. | Descartados por colisão. |
| `garimpaja.com.br`, `ogarimpa.com.br`, `garimpaoficial.com.br` | **Fato: ocupados** | HostGator / DNS automático do Registro.br. | Mostram como o espaço "garimpa" está cheio. |
| `garimpo.app.br`, `garimpo.app`, `garimpo.com.br` | **Fato: ocupados** | AWS / Locaweb. `garimpo.app` é o app de investimentos "Garimpo" (Google Play, `app.garimpo.mobile`). | Risco de confusão fonética Garimpa × Garimpo. Nome sempre acompanhado da tagline. |

### Plano B e submarcas

| Domínio | Situação | Como verifiquei | Uso proposto |
|---|---|---|---|
| `pepita.app.br` | Sinal: provavelmente livre | NXDOMAIN | **Registrar agora** (reserva do plano B 1 e nome da moeda do jogo). |
| `pepitas.app.br` | Sinal: provavelmente livre | NXDOMAIN; `pepita.com.br` (produtora Pepita) e `pepitas.com.br` estão ocupados. | Opcional. |
| `pepita.app`, `pepitas.app` | Sinal: provavelmente livres | NXDOMAIN | Só se o plano B for adotado (dólar). |
| `cassita.app.br` | Sinal: provavelmente livre | NXDOMAIN; `cassita.com.br` e `cassita.app` também; busca na web sem colisão (só "Casita", grafia diferente). | **Registrar agora** (reserva do plano B 2). |
| `ondeachei.app.br` | Sinal: provavelmente livre | NXDOMAIN; `ondeachei.com.br` ocupado (ElevaHost). | Plano B 3; não registrar por ora. |
| `cadetem.app.br`, `cadetem.com.br`, `cadetem.app` | Sinal: provavelmente livres | NXDOMAIN | Alternativa fora da metáfora; não registrar por ora. |
| `garimpei.app.br` | **Fato: ocupado** | Cloudflare, com verificação de site do Google; `garimpei.com.br` registrado (DNS automático). | Descartado; existem ainda "Garimpei UP" e "garimpei.shop". |
| `bateia.app.br` | **Fato: ocupado** | Cloudflare, A `187.77.192.45`, MX Google. `bateia.net.br` é uma consultoria de dados; `bateia.app` estacionado; `bateia.com.br` delegado. | A melhor metáfora, mas tomada. Fica como vocabulário do jogo. |
| `jazida.app.br`, `jazida.app` | Sinal: provavelmente livres | NXDOMAIN; porém Jazida.com (Greenstone Mineração de Dados, Brasília; SaaS de direito minerário com 30 mil usuários) é marca forte de software. | Descartados por colisão em software. |
| `lavra.app.br`, `lavra.com.br`, `peneira.app.br`, `peneira.com.br`, `achei.app.br` | **Fato: ocupados** | DNS automático do Registro.br (`a/b.auto.dns.br`): registrados e estacionados. | Descartados. |
| `achado.app.br`, `achados.app.br`, `achadinho.app.br`, `encontrei.app.br`, `achaaqui.app.br`, `temaqui.app.br` | **Fato: ocupados** | Cloudflare / Vercel / Hostinger / KingHost / Registro.br. | Todo o vocabulário "achar/encontrar" em `.app.br` já foi tomado: motivo para registrar as reservas hoje. |
| `jamari.app.br` | Sinal: provavelmente livre | NXDOMAIN; `jamari.com.br` registrado (estacionado). | Nome geográfico (rio Jamari): marca fraca. Não. |

## Quem está em garimpa.com.br

O que deu para apurar sem abrir o site:

- **Fatos (DNS público):** registrado e delegado à Ycorn (`dns1/dns2.ycorn.net`), hospedagem brasileira de baixo custo do Grupo Global Nation, com escritório em Nova Roma do Sul-RS e operação também em Portugal. Registro A em `144.126.141.245` (reverso `vs100.ycorn.net`), MX e SPF configurados (o SPF autoriza IPs de provedores portugueses), serial SOA de 1º/10/2026 (zona atualizada). O contato técnico da zona (campo SOA) aponta para a Ciberatlântida, agência web de Braga, Portugal.
- **Não verificado:** o conteúdo do site. Os buscadores não trazem nenhuma página indexada em `garimpa.com.br`; archive.org, crt.sh e o próprio site estão bloqueados nesta rede. Pode ser um site pequeno, um "em construção" ou só e-mail.
- **Hipótese, não confirmada:** administração a partir de Portugal. Existe uma empresa portuguesa "Garimpa, Lda" (Seixal, 2010, revestimentos e instalações prediais); a ligação com o domínio é só coerente com os indícios acima.
- **O que fazer:** rodar o WHOIS fora desta rede (titular, data de criação e de expiração). Não contatar o titular agora: não precisamos do `.com.br` e a abordagem só valoriza o domínio. Se expirar, ele passa pelo processo de liberação do Registro.br e pode ser pedido lá.

## Risco de marca ("Garimpa" no INPI)

**Não foi possível consultar o INPI nesta rede** (`busca.inpi.gov.br` bloqueado; buscas na web não retornam processos com o radical "GARIMP"). Antes de imprimir cartazes ou QR, fazer a busca oficial: <https://busca.inpi.gov.br/pePI/> → Marca → Pesquisa por radical `GARIMP` → classes **42** (software), **35** (publicidade, intermediação comercial), **9** (aplicativos) e **38**. Anotar número, situação e titular de cada processo. Repetir para `GARIMPO`.

O que a busca na web encontrou (sinais indiretos de uso da palavra como marca):

| Quem | O que faz | Por que importa |
|---|---|---|
| **Garimpa Leilões Ltda-ME** (São Paulo, CNPJ 53.257.836/0001-32, dez/2023) — "Garimpa leilão" | Garimpa leilões de carros e motos; 259 mil seguidores no Instagram e 397 mil no TikTok | A marca "Garimpa" mais visível do país hoje. Setor diferente, mas classe 35 em comum. |
| **Garimpa Ofertas** (`garimpaofertas.com.br`) | Ofertas de lojas parceiras organizadas por cidade (Cantagalo, Cordeiro, Macuco, Rio) | **A mais próxima da nossa proposta** (comércio local, "lojas parceiras"). Maior risco de confusão na classe 35. |
| **Garimpa Shop** (`garimpashop.com.br`, `garimpa.shop`) | E-commerce de utilidades | Classe 35. |
| **Garimpa Links** (`garimpalinks.com.br`) e **garimpa.pro** | SaaS de links de afiliado; geração de leads | Classe 42 (software), mesma nossa. |
| Garimpa Carros, Garimpa Vinil, Acervo Garimpa, Lila Garimpa, Garimpaai, Garimpaqui (SC/PR) | Vistoria, discos, móveis, moda, varejo | Mostram que "Garimpa + palavra" coexiste em dezenas de negócios. |
| "Garimpa" inoculante biológico (Villa Verde Agro / UNESP) | Insumo agrícola | Classe 1; sem colisão prática. |
| **Garimpo** (app de investimentos, `garimpo.app`), **Garimpeiros** (app de promoções), **Garimppa** (brechós) | Apps | Confusão fonética nas lojas de aplicativos e no boca a boca. |

**Leitura jurídica, em uma frase:** "Garimpa" é flexão de "garimpar"; para um app de achar produto é uma marca **evocativa**, não puramente descritiva. É registrável, mas **fraca**: o INPI costuma conceder esse tipo de marca "sem exclusividade do elemento nominativo" e o STJ entende que marcas evocativas de uso comum convivem com semelhantes (art. 124, VI, da Lei 9.279/96). Na prática: dificilmente alguém nos impede de usar "Garimpa", e dificilmente impedimos os outros.

**Estratégia:**

1. Buscar no INPI (acima). Se existir marca **nominativa** "GARIMPA" registrada ou pedida nas classes 42, 35 ou 9 para software, intermediação ou comércio, **trocar para o plano B antes de investir em identidade**. Se só houver marcas mistas em outros ramos (leilão, agro, moda), seguir.
2. Depositar marca **mista** (logotipo + "Garimpa") na classe 42 e, se couber no orçamento, na 35. Taxa de pedido: R$ 355, ou **R$ 142 com desconto de 60 %** (pessoa física, MEI/ME/EPP, instituições de ensino e pesquisa, entidades sem fins lucrativos; o IFRO e a Incubadora se enquadram). Fontes de 2026 informam que, desde 20/09/2025, essa taxa única já inclui a concessão e os dez primeiros anos; confirmar na tabela de retribuições do INPI antes de pagar.
3. Usar sempre nome + tagline ("Garimpa: onde encontro isso em Ariquemes?") e um símbolo próprio (pepita ou bateia). Nunca "Garimpa Ofertas", "Garimpa Promoções" ou variações que lembrem os concorrentes.
4. Depois do depósito, acompanhar a Revista da Propriedade Industrial (semanal) para oposições.

## Plano B de nome

Se "Garimpa" conflitar, a gamificação não muda (pepitas, bateia, jazidas continuam no jogo); muda só a marca.

| Nome | Domínios sugeridos | Por quê | Risco |
|---|---|---|---|
| **1. Pepita** | `pepita.app.br` (reservar agora), `pepitas.app.br`, `pepita.app` | Já é a moeda do app, então a marca e o jogo falam a mesma língua. Curto, carinhoso, mantém a metáfora do garimpo. Para o serviço "achar produto", "pepita" não descreve nada: marca mais distintiva que "Garimpa". | Médio. A produtora **Pepita** (São Paulo, fundada por Julio Santi em 2021) faz "games, cinema, apps" e tem a marca "Pepita Viajera" registrada: possível sobreposição na classe 42/41. Há ainda a cantora Pepita e o Atelier Pepita (sem relação com software). |
| **2. Cassita** | `cassita.app.br` (reservar agora), `cassita.com.br`, `cassita.app` | Nome de fantasia tirado de **cassiterita**, o minério que fez Ariquemes. Sem significado dicionarizado: é a marca mais fácil de registrar e defender das três. Soa como apelido, tem três sílabas e continua local sem ser geográfico. | Baixo. Nenhuma colisão encontrada na busca (só "Casita", lojas infantis, grafia diferente). Exige explicar a origem uma vez; a história da cidade ajuda. |
| **3. Onde Achei** | `ondeachei.app.br` (`ondeachei.com.br` está ocupado) | Diz exatamente o que o app faz e é a frase do botão de aceite ("Foi aqui que achei"). Zero curva de entendimento. | Médio. Marca descritiva, sem exclusividade possível; confunde com o concorrente **Ondetem.app** (Gofind); o `.com.br` é de terceiros. Só se clareza valer mais que marca. |

Descartados com motivo: **Bateia** (`bateia.app.br` ocupado; consultoria Bateia em `bateia.net.br`), **Jazida** (Jazida.com, SaaS de mineração com clientes como Vale e Rio Tinto), **Lavra** e **Peneira** (domínios registrados), **Garimpei** (domínio e marcas em uso), **Garimpaqui** e **Garimpaê** (empresas ativas), **Jamari** (geográfico, marca fraca).

## Perfis sociais a reservar

Instagram e TikTok não puderam ser consultados nesta rede: **tudo abaixo é a verificar**, na mesma hora do registro do domínio.

| Canal | Tentar nesta ordem | Observação |
|---|---|---|
| Instagram | `@garimpa.app.br`, `@garimpaapp`, `@garimpa.app`, `@garimpa.ro` | `@garimpa` sozinho quase certamente está tomado (palavra comum); `@garimpaleilao` tem 259 mil seguidores, evitar nomes que lembrem leilão. |
| TikTok | mesmos handles | `@garimpa.leilao` tem 397 mil seguidores. |
| WhatsApp Business | número da Incubadora, nome de exibição "Garimpa" | É o canal principal do piloto (cartazes e grupos). |
| YouTube / X | `@garimpaapp` | Baixa prioridade; reservar se estiver livre. |
| GitHub | organização `garimpa` **já existe** (vazia, de terceiros; fato, verificado em github.com/garimpa) | O repositório fica em `andreyquadros/garimpa.app.br`; se quiser organização, `garimpa-app`. |
| E-mail | `contato@garimpa.app.br` | O Registro.br não hospeda e-mail. Opções sem custo: Zoho Mail gratuito (registros MX no DNS do Registro.br) ou encaminhamento (ImprovMX; o Cloudflare Email Routing exige mover o DNS para a Cloudflare). |
| Lojas de aplicativos (futuro) | título "Garimpa: onde encontro isso?" | Diferencia de "Garimpo" (investimentos) e "Garimpeiros" (promoções). |

## Regras e preços

| Item | Valor / regra | Fonte |
|---|---|---|
| `.app.br`, `.com.br`, `.net.br`, `.tec.br`, `.dev.br`, `.blog.br` | **R$ 40/ano** no Registro.br. Tabela por período: 1 ano R$ 40; 2 anos R$ 76; 3 anos R$ 112; 5 anos R$ 184; 10 anos R$ 364 (R$ 36 por ano adicional). Renovação pelo mesmo valor. | Registro.br (página bloqueada nesta rede); tabela reproduzida pela Homehost e pela LinkFL. Um blog cita R$ 174 para 5 anos; vale o carrinho do Registro.br. |
| Quem pode registrar `.app.br` | Categoria genérica "aplicativos", criada em 20/07/2020 junto com `dev.br`, `tec.br`, `log.br` e outras: **pessoa física (CPF) ou jurídica (CNPJ)**, sem comprovação de atividade. Nome de 2 a 26 caracteres. Estrangeiros precisam de procurador no Brasil. **Não há exigência de HTTPS** pelo registro (a obrigação do `.app` do Google vem da lista de pré-carregamento HSTS dos navegadores, não do Registro.br); usaremos HTTPS de qualquer forma. | NIC.br (release de 2020), Canaltech, páginas de revenda (HostGator, SAN Internet). Página oficial de categorias bloqueada nesta rede: confirmar em registro.br/dominio/categorias/. |
| `.app` (Google Registry) | Google não vende direto; via registradores. A preço de custo: Cloudflare US$ 14,18/ano (registro e renovação iguais); Porkbun US$ 8,75 no primeiro ano e US$ 14,93 na renovação; registradores de marca cobram US$ 20–30. HTTPS obrigatório (HSTS preload). **`garimpa.app` já está registrado**, então é só referência. | registry.google/domains/app (bloqueado aqui), Wikipedia `.app`, tldprice.org, HostingCompass. |
| `.digital` | Cloudflare US$ 23/ano a preço de custo; Namecheap US$ 2,48 no primeiro ano e US$ 53,98 na renovação; Dynadot renova a US$ 34,14. **`garimpa.digital` já está registrado.** | Namecheap, Dynadot, lista de preços da Cloudflare. |
| Transferência de titularidade `.br` | Gratuita (procedimento administrativo no painel do Registro.br, com documentos do titular atual e do novo). Permite registrar hoje no CPF do responsável e passar depois para o CNPJ da Incubadora/IFRO. | Homehost, e-Consulters. |
| Marca no INPI | R$ 355 por classe, ou R$ 142 com desconto de 60 % (ver "Risco de marca"). | Tabela de taxas do INPI 2026 (Registrar Sua Marca, Consolide). |

## Plano de registro imediato

Registrar hoje, nesta ordem, no Registro.br (R$ 120 no total; ou R$ 184 só o principal por 5 anos, para não cair por esquecimento):

1. **`garimpa.app.br`**: o produto. Disponibilidade confirmada pelo autor; cada dia é um risco a mais num espaço de nomes em que `achei`, `achado`, `achados`, `achadinho`, `encontrei`, `achaaqui` e `temaqui` já foram levados em `.app.br`.
2. **`pepita.app.br`**: nome da moeda (aparece na carteira, nos rankings e nos cartazes "ganhe pepitas") e reserva do plano B 1. Pode servir de link curto da carteira (`pepita.app.br/@marina`).
3. **`cassita.app.br`**: reserva do plano B 2, a marca mais defensável se "Garimpa" cair no INPI. Custa menos que uma tiragem de cartazes.

Não registrar agora: `.net.br`, `.tec.br`, `.dev.br`, `.blog.br`, `usegarimpa`, `garimparo` (ninguém digita; o risco de alguém ocupar para prejudicar um app local é desprezível; reavaliar quando houver tração). Não comprar `garimpa.com` (mercado secundário) nem abordar o dono de `garimpa.com.br`.

Se o Registro.br avisar que algum nome está "em processo de liberação", pedir mesmo assim: havendo mais de um interessado no período, a disputa é por ticket.

## Passo a passo: registro e apontamento para o KVM 8 (Dokploy)

1. **Registrar.** Entrar em <https://registro.br/>, pesquisar `garimpa.app.br`, "Registrar". Titular: opção rápida é o CPF do responsável pela Incubadora (transferência para o CNPJ depois, sem custo); opção institucional é o CNPJ do IFRO pela conta que já administra `ifro.edu.br` (mais lenta). E-mail de contato institucional. Pagamento por Pix, boleto ou cartão; ligar a **renovação automática**. Repetir para `pepita.app.br` e `cassita.app.br`.
2. **DNS no próprio Registro.br** (gratuito, já com DNSSEC): no domínio, "Configurar endereçamento" → "Utilizar DNS do Registro.br" → "Modo avançado" (a ativação leva até 2 h) → "Nova entrada":
   - `garimpa.app.br` tipo **A** → IP público do KVM 8 (o mesmo que responde hoje por `garimpa.incubadora.cloud`);
   - `www` tipo **A** → mesmo IP;
   - se o KVM 8 tiver IPv6, as mesmas entradas em **AAAA**;
   - "Salvar alterações"; propagação de minutos a 2 h.
   Não é preciso mover o DNS para a Cloudflare; só faça isso se quiser o encaminhamento de e-mail deles.
3. **Dokploy.** Projeto `garimpa` → Compose → aba **Domains** → **Add Domain**: host `garimpa.app.br`, serviço `garimpa`, porta interna `8787`, HTTPS ligado, certificado **Let's Encrypt**. Repetir para `www.garimpa.app.br` com redirecionamento para o apex. Portas 80 e 443 abertas no firewall do VPS. O proxy do Dokploy (Traefik) emite o certificado sozinho; o `infra/Caddyfile` é a alternativa se o Caddy estiver na frente.
4. **Variáveis.** `PUBLIC_URL=https://garimpa.app.br` (o cookie de sessão só fica `Secure` com `https://` aqui) e redeploy.
5. **Login com Google.** No Console do Google Cloud, origem JavaScript autorizada `https://garimpa.app.br` (o doc 06 já lista).
6. **Redirecionamento.** `garimpa.incubadora.cloud` → 301 para `https://garimpa.app.br` (no Dokploy, pelo recurso de redirect do domínio antigo; ou no Caddy). Manter por pelo menos 12 meses: está em QR e grupos.
7. **Conferir.** `curl -I https://garimpa.app.br/api/health` (200, certificado válido), instalar o PWA no celular, atualizar o monitor do Uptime Kuma e a URL do OG/compartilhamento.
8. **Agenda.** Data de renovação dos domínios, busca no INPI (antes do material impresso) e depósito da marca.

## Ajustes decorrentes em outros arquivos

- `infra/Caddyfile` ainda tem um bloco `garimpa.com.br { redir ... }`: remover (o domínio não é nosso) e colocar `garimpa.incubadora.cloud` com 301.
- `docs/05-modelo-de-negocio.md` cita "domínio R$ 80/ano": passa a R$ 40 a R$ 120/ano, conforme as reservas.
- `docs/06-arquitetura-e-deploy.md` já prevê `garimpa.app.br`; nada a mudar.

## Fontes

Registro.br e `.br`

- Pagamento e tabela por período (bloqueada nesta rede): <https://registro.br/ajuda/pagamento-de-dominio/>; reprodução da tabela: <https://www.homehost.com.br/blog/dominio/registro-de-dominio-br/> e <https://blog.linkfl.com.br/quanto-custa-um-dominio/>.
- Regras e categorias (bloqueadas nesta rede): <https://registro.br/dominio/regras/>, <https://registro.br/dominio/categorias/>.
- Lançamento de `app.br`, `dev.br`, `tec.br` em 20/07/2020: <https://nic.br/noticia/releases/nic-br-oferece-novas-opcoes-de-dominios-br/> e <https://canaltech.com.br/internet/internet-brasileira-ganha-novas-opcoes-de-dominios-br-167800/>; regras de quem pode registrar `.app.br`: <https://www.hostgator.com.br/registro-de-dominio/dominio-app-br> e <https://www.saninternet.com/dominio/app-br>.
- Transferência de titularidade sem custo: <https://www.homehost.com.br/blog/dominio/transferencia-de-dominio-no-brasil/> e <https://www.e-consulters.com.br/blog/como-transferir-a-titularidade-de-um-dominio-br/>.
- Apontar domínio do Registro.br para VPS (modo avançado): <https://todasolucao.com.br/tutoriais/apontar-domnio-no-registrobr-para-uma-vps> e <https://blog.linkfl.com.br/como-configurar-dns-no-registro-br/>.
- Domínios no Dokploy: <https://docs.dokploy.com/docs/core/domains>.

`.app` e `.digital`

- Google Registry `.app` e HTTPS obrigatório: <https://www.registry.google/domains/app/>; <https://en.wikipedia.org/wiki/.app_(top-level_domain)>.
- Preços a custo: Cloudflare <https://tldprice.org/registrar/cloudflare> e <https://github.com/matteotrubini/cloudflare-registrar-domain-prices>; Porkbun `.app` <https://hostingcompass.com/en/domains/app>; `.digital` <https://www.namecheap.com/domains/registration/gtld/digital/> e <https://www.dynadot.com/domain/digital>.

Marca

- Busca oficial: <https://busca.inpi.gov.br/pePI/>. Taxas 2026: <https://registrarsuamarca.com.br/tabela-taxas-inpi-2026-atualizada/> e <https://www.consolidesuamarca.com.br/blog/quanto-custa-registrar-uma-marca>.
- Marca fraca e convivência (STJ): <https://www.conjur.com.br/2011-jun-25/expressao-comum-nao-virar-marca-exclusiva-empresa-decide-stj/>; Manual de Marcas do INPI (cap. 5): <https://manualdemarcas.inpi.gov.br/>.

Empresas e produtos citados

- Garimpa Leilões: <https://empresas.serasaexperian.com.br/consulta-gratis/GARIMPA-LEILOES-LTDA-53257836000132>, <https://www.instagram.com/garimpaleilao/>, <https://www.tiktok.com/@garimpa.leilao>.
- Garimpa Ofertas <https://garimpaofertas.com.br/>; Garimpa Shop <https://www.garimpashop.com.br/>; Garimpa Links <https://www.garimpalinks.com.br/>; garimpa.pro <https://garimpa.pro/>; Garimpa Carros <https://garimpacarros.com.br/>; Garimpa Vinil <https://www.garimpavinil.com.br/>; Acervo Garimpa <https://www.reclameaqui.com.br/empresa/acervo-garimpa/>; Lila Garimpa <https://lilagarimpa.com.br/>; Garimpaai <https://garimpaai.com.br/>; Garimpaê <https://garimpae.com/>.
- Garimpaqui Comércio Ltda: <https://cnpjcheck.com.br/empresa/garimpaqui-comercio-ltda-garimpaqui-54037966000122>.
- Inoculante Garimpa: <https://villaverdeagro.com.br/inoculante-garimpa/>.
- Garimpo (app): <https://play.google.com/store/apps/details?id=app.garimpo.mobile>; Garimpeiros: <https://play.google.com/store/apps/details?id=br.com.garimpeiros.aplicativo>; Garimppa: <https://independente.com.br/aplataforma-online-reune-brechos-e-reserva-pecas-de-segunda-mao/>.
- Ycorn: <https://ycorn.com.br/quem-somos/>; Ciberatlântida: <https://ciberatlantida.pt/>; Garimpa, Lda (Portugal): <https://www.racius.com/garimpa-lda/>.
- Jazida.com: <https://www.jazida.com/en/sobre>; Pepita (produtora): <https://pepita.com.br/en>; Bateia: <https://bateia.net.br/>; Ondetem.app / Gofind: <https://33giga.com.br/novo-app-mostra-produto-desejado-na-loja-mais-proxima/>.
- Organização `garimpa` no GitHub: <https://github.com/garimpa>.
