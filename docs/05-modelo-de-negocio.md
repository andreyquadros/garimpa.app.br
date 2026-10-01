# Modelo de negócio

## Fase 1 — hábito (meses 0–6): custo ≈ zero, receita zero

Objetivo único: Ariquemes passar a perguntar "onde tem?" no Garimpa antes de perguntar no WhatsApp.

- **Distribuição**: link compartilhável + PWA. Mutirão de fundadores da Incubadora e do IFRO; cartaz com QR nos pontos de ônibus (o app No Ponto já está lá) e nos balcões que aceitarem.
- **Semente de conteúdo**: 200 perguntas reais coletadas com alunos e servidores na primeira semana; 10 "garimpeiros fundadores" com meta de 5 pistas/dia nas duas primeiras semanas.
- **Custo**: VPS já pago; domínio R$ 80/ano; nenhum serviço em dólar. Horas da Incubadora.
- **Pepitas**: acumulam, carteira mostra valor projetado, resgate fechado ("abre com as lojas parceiras").
- **Métrica de saída da fase**: 300 usuários ativos/mês e 40 % das perguntas resolvidas.

## Fase 2 — lojas parceiras (a partir do mês 6): receita em R$, parte vira pepita

O Garimpa junta o que o lojista mais quer e não tem: **demanda declarada e georreferenciada** ("23 pessoas procuraram fonte USB-C 65 W no Setor 02 este mês") e **prova social** (fotos de clientes na loja dele).

| Plano | Preço/mês | O que inclui |
|---|---|---|
| **Bronze** | R$ 99 | Lugar verificado (selo, horário, WhatsApp, "Como chegar"); responde oficialmente a perguntas; alerta por WhatsApp quando alguém procura algo do seu ramo |
| **Prata** | R$ 299 | Bronze + destaque dourado no mapa para até 20 termos de produto (aparece primeiro na busca por aqueles termos, sempre marcado como "parceira"); relatório mensal de demanda do bairro |
| **Ouro** | R$ 699 | Prata + missões patrocinadas ("primeiros 20 a confirmar o produto X ganham 30 pepitas") + campanha de lançamento de produto + 100 termos |

Regras que protegem a confiança do usuário: destaque nunca substitui um achado da comunidade; respostas oficiais carregam selo "loja" e **não** rendem pepitas ao lojista; pino de parceira é dourado com borda, visivelmente diferente.

### O Cofre

- **30 % de toda receita de parceiros** vai para o `fund_ledger` (Cofre). É dele que saem os Pix dos resgates.
- Conversão-alvo 100 pepitas = R$ 1,00; pagamento mensal, mínimo R$ 20, pro rata se o Cofre não cobrir. Transparência: a tela da carteira mostra o saldo do Cofre e a taxa do mês.
- 70 % restantes: custo de operação (VPS maior, backups, suporte), impostos, equipe, reserva.

### Conta de padaria (mês 12)

| | Conservador | Base |
|---|---|---|
| Parceiros | 6 Bronze, 4 Prata, 1 Ouro | 15 Bronze, 10 Prata, 3 Ouro |
| Receita/mês | R$ 2 489 | R$ 6 572 |
| Cofre (30 %) | R$ 747 | R$ 1 972 |
| Passivo de pepitas/mês (400–900 perguntas resolvidas) | ≈ R$ 380 | ≈ R$ 850 |
| Resultado para operação (70 %) | R$ 1 742 | R$ 4 600 |

Em ambos os cenários o Cofre cobre o passivo; o excedente do Cofre acumula para meses fracos.

## Fase 3 — outras cidades e dados (ano 2)

- Replicar em Ji-Paraná, Cacoal, Vilhena, Porto Velho: `cities` já é tabela, `city_id` em tudo.
- **Relatório de demanda local** para associações comerciais, Sebrae e prefeituras (agregado, anônimo): "o que a cidade procura e não acha". Produto de dados vendido por assinatura institucional.
- Integração com estoque de redes (API) para "confirmado pela loja hoje".

## Benchmark e posicionamento

- **ondetem.app** lista produtos a partir de fabricantes/distribuidores: visão de cima para baixo, sem prova de prateleira, sem comunidade. O Garimpa é de baixo para cima: a prova vem de quem está na loja.
- **Grupos de WhatsApp "onde encontro"**: a resposta existe, mas não é buscável nem georreferenciada, e ninguém é recompensado. O Garimpa é a memória desses grupos.
- **Google Maps / guias comerciais (Achaaí)**: cadastram lojas, não produtos; não respondem "onde tem X".

## Jurídico e LGPD (checklist do piloto)

- Termos: pepitas são pontos de programa de incentivo, sem valor até o resgate ser aberto; o operador pode alterar a tabela com aviso de 30 dias.
- Fotos: sem metadados ao publicar; rosto de terceiros não é objetivo da foto; botão de denúncia e remoção em 48 h.
- Dados pessoais: nome e e-mail do Google, hash de IP/dispositivo para antifraude (base legal: legítimo interesse/prevenção à fraude), exclusão de conta pelo app (`DELETE /api/auth/account`).
- Resgate: CPF só na fase 2, para o Pix, com retenção mínima.
