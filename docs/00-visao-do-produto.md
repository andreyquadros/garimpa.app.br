# Garimpa — visão do produto

**Uma frase.** Alguém em Ariquemes digita "onde encontro garrafa com tampa hermética?"; quem já viu o produto numa loja responde com foto no local; a cidade ganha um mapa vivo de onde as coisas estão, e quem ajuda ganha pepitas que, com lojas parceiras, viram dinheiro.

## O problema

- Comprar na Amazon ou no Mercado Livre leva de 7 a 20 dias para chegar em Rondônia. Muita coisa a pessoa precisa **hoje**.
- O comércio local tem o produto, mas ninguém sabe em qual das 300 lojas. Ligar é lento, o Google Maps não indexa prateleira, os grupos de WhatsApp perdem a resposta em uma hora.
- Quem sabe (porque viu, porque trabalha perto, porque comprou ontem) não tem motivo para parar e contar.

## A aposta

1. **Pergunta curta, resposta com prova.** Uma resposta só vale se vier com evidência: foto do produto na prateleira (de preferência com GPS), nota fiscal, recibo ou foto da fachada. Prova é o que separa o Garimpa de um grupo de WhatsApp.
2. **Nunca perguntar duas vezes.** Antes de abrir uma pergunta, o app mostra perguntas parecidas e os lugares já confirmados. O mapa com busca é a página inicial; a pergunta é o último recurso.
3. **Jogo com regras claras.** XP e níveis medem reputação (nunca viram dinheiro); pepitas medem valor entregue e só nascem de eventos validados por outra pessoa. Carência de 7 dias, limites diários e antiplágio mantêm a economia honesta.
4. **Zero atrito para entrar.** Link compartilhável, PWA instalável, login com Google. Nada de loja de aplicativos no piloto.
5. **Custo zero até ter gente.** Roda no KVM 8 da Incubadora com Postgres próprio e tiles próprios; nenhuma conta em dólar.

## Para quem

| Persona | Momento | O que o Garimpa dá |
|---|---|---|
| **Quem precisa agora** (mãe com criança doente, pedreiro no meio da obra, estudante na véspera) | "Preciso disso hoje e não sei onde tem" | Resposta com foto e endereço em horas; o mapa já pode ter a resposta pronta |
| **Quem anda a cidade** (motoboy, entregador, vendedor externo, aposentado que passeia no centro) | Está na loja, viu o produto, tem 30 segundos | Pepitas por foto, ranking, níveis; na fase 2, dinheiro via Pix |
| **Lojista** (fase 2) | Tem estoque parado que ninguém sabe que existe | Demanda real e georreferenciada; destaque pago para os produtos que as pessoas procuram |

## Como é usar

```
 Mapa (busca no centro)  ─ digita "garrafa hermética"
      │
      ├─ já tem achado ──▶ pinos dourados · "Casa & Cozinha Jamari, 3 achados" ▶ Como chegar
      ├─ já perguntaram ─▶ "Também quero" (+2 XP, pergunta ganha +5 de bônus)
      └─ ninguém garimpou ▶ Perguntar (3 passos, +5 XP)
                                │
           Quem sabe ───────────┤  "Eu sei onde tem!" ▶ escolhe lugar ▶ foto no local ▶ checklist da prova ▶ +15 XP
                                │
           Comunidade ──────────┤  confirma (+3 XP) · 2 confirmações = achado confirmado (+20 pepitas p/ quem achou)
                                │
           Quem perguntou ──────┘  "Foi aqui que achei" ▶ confete ▶ +50 pepitas p/ quem achou ▶ gorjeta (até 20)
```

## O que não é

- Não é marketplace: ninguém compra pelo app. O app diz **onde** está; a compra é no balcão.
- Não é guia comercial de cadastro: lugares nascem das respostas, não de uma lista.
- Não é rede social: sem feed infinito, sem curtidas. Só perguntas, pistas, confirmações.

## Métricas do piloto (90 dias)

| Métrica | Meta |
|---|---|
| Perguntas respondidas com prova em até 24 h | 60 % |
| Perguntas resolvidas (resposta aceita) | 40 % |
| Pessoas que responderam pelo menos uma vez | 150 |
| Lugares no mapa com achado confirmado | 200 |
| Perguntas evitadas pelo "já garimparam isso" | 25 % das tentativas |
| Denúncias procedentes sobre total de respostas | < 3 % |

## Riscos e respostas

- **Pouca gente respondendo**: a primeira semana roda com "missões" semeadas pela Incubadora (perguntas reais de alunos) e um mutirão de garimpeiros fundadores; o ranking semanal e o badge "Garimpeiro da semana" sustentam o hábito.
- **Fraude para farmar pepitas**: ver [04-antiplagio-e-confianca.md](04-antiplagio-e-confianca.md). Até a fase 2 não há dinheiro em jogo, o que dá tempo para calibrar.
- **Lojista reclamando de foto na loja**: fotos são de produto e preço (informação pública de vitrine); o lojista pode reivindicar o lugar e virar parceiro, com resposta oficial.
- **Expectativa de dinheiro cedo**: a carteira mostra "vale R$ X quando o resgate abrir (fase 2)" desde o dia 1, sem prometer data.
