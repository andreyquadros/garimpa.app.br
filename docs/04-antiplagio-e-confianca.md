# Antiplágio, antifraude e confiança

Objetivo: tornar **mais barato achar de verdade do que fingir que achou**. Nenhuma medida sozinha resolve; a soma delas, com carência e estorno, resolve.

## 1. Só uma pessoa é "a primeira" em cada lugar

Índice único parcial `answers(question_id, place_id) where is_first_for_place`. A primeira resposta apontando um lugar leva 100 % das pepitas; qualquer resposta posterior para o **mesmo lugar** entra como confirmação e vale 25 %. Copiar a resposta de alguém deixa de compensar.

## 2. A foto é verificada antes de ser aceita

Pipeline do upload (`api/src/evidence.ts`):

1. **EXIF lido antes de ser apagado**: GPS e data de captura. A imagem publicada é regravada pelo `sharp` sem metadados (privacidade de quem fotografou).
2. **Hash perceptual (dHash 8×8, 64 bits)** armazenado em `bit(64)`, comparado por distância de Hamming com todas as fotos já enviadas:
   - **≤ 6 bits** (mesma foto; um reenvio pelo WhatsApp fica em ~3): de **outra pessoa** → upload recusado na hora; da **mesma pessoa** → aceito, marcado `foto_reutilizada`, −30 na nota, não rende pepitas;
   - **7–12 bits** (parecida; recompressão agressiva fica em ~9): aceito com aviso `foto_parecida`, −20 na nota, depende de confirmação;
   - fotos distintas ficam acima de 18 bits (`test/evidence.test.ts`). Recortes grandes escapam do hash e ficam para a comunidade e as denúncias.
3. **SHA-256** para o caso trivial de reenvio do mesmo arquivo.
4. **Pontuação da prova (0–100)**, transparente para o usuário no checklist:

| Sinal | Pontos |
|---|---|
| Foto enviada | +20 |
| Nota fiscal ou recibo | +15 |
| GPS da foto a ≤ 300 m da loja | +30 (≤ 1 km: +10; > 1 km: −20 e `longe_do_local`) |
| Data da foto nos últimos 30 dias | +15 (senão `foto_antiga`) |
| Localização do aparelho no envio a ≤ 500 m | +20 (≤ 2 km: +5; > 2 km: −10 e `enviada_de_longe`) |
| Foto já usada pela mesma pessoa | −30 |
| Foto parecida com a de outra pessoa | −20 |

Score ≥ 60 = **prova forte**: 15 XP imediatos; < 60 = prova fraca: 5 XP e as pepitas dependem de confirmação da comunidade.

## 3. Texto copiado

`note_norm` (normalizado, sem acento) comparado por trigramas com as outras respostas da mesma pergunta. Similaridade > 0,85 com resposta de outra pessoa: marca `texto_copiado`; se for também o mesmo lugar, a resposta é recusada ("confirme a dela em vez de repetir").

## 4. Conluio entre contas

Cada ação grava `user_signals(ip_hash, device_hash)` (hash com sal, sem IP em claro). Ao aceitar, confirmar ou dar gorjeta:

- **mesmo dispositivo** entre quem paga e quem recebe → pepitas **não são cunhadas** (XP continua), meta `conluio: mesmo_dispositivo`;
- **mesmo IP nas últimas 24 h** (família, mesmo Wi-Fi do campus) → pepitas entram com **14 dias de carência**, tempo para denúncias chegarem.

Responder a própria pergunta e confirmar a própria resposta são proibidos pela API.

## 5. Confirmações ponderadas

Cada voto pesa **1** para contas normais, **0,5** para contas suspeitas (confiança < 0,4) e **1,5** para veteranas (≥ 0,8). Soma ≥ 2 a favor (e mais a favor que contra) confirma: duas pessoas comuns, ou uma veterana e uma suspeita. Três contra, sendo mais que o dobro dos a favor, escondem a resposta e estornam o que ela rendeu.

## 6. Confiança da conta (0–1)

`fn_recompute_trust`: conta nova vale 0,45; +0,06 por resposta aceita (até 8), +0,02 por confirmada (até 10), +0,05 com 7 dias de conta, −0,20 por denúncia procedente. Abaixo de 0,4 (só quem já teve denúncia procedente) a carência dobra (14 dias) e o voto pesa metade.

## 7. Denúncias com consequência

Motivos: plágio, foto falsa, lugar errado, spam, ofensivo. Três denúncias abertas de contas com confiança ≥ 0,6 escondem a resposta e estornam (`fn_reverse`) autor e confirmadores, até um moderador (nível 5+ ou papel `moderator`) decidir. Decisão "procede" rejeita e recalcula a confiança do autor; "improcede" devolve a resposta.

## 8. Limites diários atômicos

`fn_cap_take` no fuso de Porto Velho: 10 perguntas, 20 pistas, 30 confirmações, 40 envios, 30 pepitas de gorjeta, 15 lugares, 300 pepitas cunhadas. Concorrência coberta por `on conflict … do update` (teste `limite diário é atômico`).

## 9. Carência e estorno como rede final

Toda pepita nasce em `carencia` e só vira `disponivel` depois de 7 dias (`fn_vest_due`). Dentro desse prazo, qualquer um dos mecanismos acima pode estornar com um lançamento espelho; o livro-razão nunca é apagado, só compensado.

## O que fica para depois

- OCR de nota fiscal (CNPJ × lugar) quando a fase 2 tiver lojistas que exijam.
- Índice BK-tree ou `pgvector` para o hash perceptual quando passar de ~200 mil fotos.
- Verificação por telefone para resgate acima de R$ 200/mês.
- Auditoria aleatória: 2 % das respostas aceitas vão para fila de revisão humana.
