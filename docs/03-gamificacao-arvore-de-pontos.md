# Gamificação e árvore de pontos

## Duas moedas, de propósito

| | **XP (experiência)** | **Pepitas** |
|---|---|---|
| Mede | reputação e constância | valor entregue a outra pessoa |
| Nasce de | qualquer ação útil, inclusive perguntar e aparecer todo dia | só de eventos **validados por terceiros** (aceite, confirmação, gorjeta) |
| Vira dinheiro | **nunca** | sim, na fase 2, via Cofre |
| Transferível | não | gorjeta (de orçamento ou do saldo) |
| Expira | não | 12 meses sem atividade |
| Serve para | níveis, ranking, peso da confirmação, desbloqueios | resgate em R$, destaque de perfil |

Separar as duas é o que permite ser generoso com XP (o jogo fica vivo) sem criar passivo financeiro, e ser rigoroso com pepitas (só o que foi provado conta).

## Tabela de eventos

Valores vivem em `settings.economia` no banco (editáveis sem deploy) e são espelhados em `api/src/economy.ts`.

| Evento | XP | Pepitas | Quem valida | Observação |
|---|---|---|---|---|
| Perguntar | 5 | – | ninguém | máx. 10/dia |
| "Também quero" em pergunta existente | 2 | – | ninguém | +5 de bônus à pergunta por pessoa que acompanha (teto 100); sair devolve os 5; XP uma vez por pergunta, máx. 10/dia |
| Pista com prova **forte** (score ≥ 60) | 15 | – | algoritmo da prova | prova fraca: 5 XP |
| Pista **aceita** por quem perguntou | 50 | **50** + bônus | quem perguntou | 25 % se não for o primeiro achado no lugar; sem pepitas se todas as fotos forem reaproveitadas (`foto_reutilizada`) |
| Primeiro achado no lugar (ao ser aceito) | 10 | 10 | quem perguntou | |
| Pista **confirmada** por 2 pessoas no local | 20 | **20** | comunidade | 25 % se não for o primeiro achado |
| Confirmar pista de alguém | 3 | – | ninguém | máx. 30/dia |
| Sua confirmação validada (pista virou confirmada) | 5 | 5 | comunidade | |
| Aceitar uma resposta (fechar o garimpo) | 10 | – | – | |
| Gorjeta recebida | ⌊valor/5⌋ | valor | quem deu | orçamento de 20 por pergunta; máx. 30/dia cunhadas. Do próprio saldo: a partir do nível 2, mínimo 5 |
| Cadastrar lugar novo no mapa | 4 | – | – | máx. 15/dia |
| Dia seguido garimpando (streak) | 2 × dias, teto 14 | – | – | |
| Conquista (badge) | 20–100 | – | – | |

Tudo que cunha pepitas tem **carência de 7 dias** (14 para contas com confiança < 0,4 ou quando quem paga e quem recebe usaram a mesma rede; 3 a partir de 800 XP). Durante a carência a pepita aparece como "+N em carência" e pode ser estornada por denúncia procedente. Teto de **300 pepitas cunhadas por pessoa por dia** (`fn_cap_take('pepitas_cunhadas')`, cobrado de quem recebe em aceite, confirmação e gorjeta do orçamento): ao estourar, a ação acontece e o XP é pago, mas o lançamento sai com 0 pepitas e `teto_diario: true`. Se um estorno chegar depois de a pepita ter sido gasta, o saldo fica negativo (dívida) e a conta só volta a gastar depois de cobri-la.

## Níveis (patentes)

| Nível | Patente | XP | Lema | O que desbloqueia |
|---|---|---|---|---|
| 1 | Explorador | 0 | O primeiro passo é descobrir. | abrir missões, enviar evidências, confirmar |
| 2 | Garimpeiro | 100 | Você já sabe seguir boas pistas. | confirmações com mais peso; agradecer com o próprio saldo |
| 3 | Guia local | 350 | Sua experiência orienta a cidade. | cadastra lugares sem revisão; título no ranking |
| 4 | Guardião | 900 | Ajude a manter pistas confiáveis. | carência das pepitas cai para 3 dias; revisa denúncias |
| 5 | Lenda local | 1 800 | Uma referência para a comunidade. | missões de parceiros em primeira mão; nome no mapa |


Progressão calibrada para um usuário ativo (3 evidências aceitas por semana) chegar a Garimpeiro na primeira semana, Guia local em um mês e Guardião em um semestre.

## Conquistas

Fundador · Primeiro achado · Olho de lince (5 primeiros achados) · Bateia (10 confirmações) · Bom de prova (10 provas fortes) · Maratonista (7 dias) · Mão aberta (10 gorjetas) · Cartógrafo (5 lugares) · Garimpeiro da semana (topo do ranking, concedido toda segunda pela rotina `runTick`).

## Momentos de prazer (onde a animação acontece)

A regra é **uma cerimônia por evento que importa**, e silêncio no resto.

1. **"Foi aqui que achei"** (aceite): confete dourado, carimbo "Achado" cai sobre o ticket, toast "+50 pepitas para a Marina", e a folha de gorjeta sobe sozinha com 5/10/20.
2. **Checklist da prova** ao enviar foto: cada item aparece com um tique em sequência (foto limpa, GPS, data, sua localização) e a barra "força da prova" cresce. O usuário entende na hora por que vale mais tirar a foto no local.
3. **Subida de nível**: anel se fecha, confete, nome do nível e o que ele libera.
4. **Pepitas no topo do mapa**: o contador anima do valor antigo para o novo sempre que muda.
5. **Pino em destaque**: o lugar selecionado flutua levemente; os demais ficam parados.

## Economia: por que não onera cedo

- **XP é grátis.** Toda a camada de engajamento (níveis, ranking, badges, streak) não gera passivo.
- **Pepita só nasce de valor provado.** Sem resposta aceita ou confirmada, não há cunhagem. Spam não rende.
- **Gorjeta é do orçamento da pergunta**, não do bolso de quem perguntou, e limitada a 20 por pergunta e 30 por dia por pessoa: inflação previsível (≈ R$ 0,20 por pergunta resolvida na conversão-alvo).
- **Conversão flutuante pelo Cofre.** 100 pepitas = R$ 1,00 é a meta; o pagamento mensal usa `min(meta, saldo do Cofre ÷ pepitas resgatáveis)`. Se o Cofre tiver menos do que o passivo, paga-se pro rata e o restante segue na carteira. O app nunca deve mais do que tem.
- **Mínimo de resgate 2 000 pepitas (R$ 20)**, janela mensal, Pix com CPF do titular da conta Google. Isso elimina micro-saques e concentra o pagamento em quem realmente contribui.
- **Expiração de 12 meses** sem atividade (breakage) e carência de 7 dias limitam o estoque de pepitas "mortas".

### Ordem de grandeza

Piloto com 400 perguntas resolvidas/mês ⇒ ≈ 400 × (50 + 10 + 10 de gorjeta média) + confirmações (≈ 25/pergunta) ≈ **38 mil pepitas/mês ≈ R$ 380/mês** de passivo na meta de conversão. Um único parceiro no plano Prata (R$ 299/mês, 30 % ao Cofre ≈ R$ 90) não cobre; cinco parceiros Prata e dois Ouro cobrem com folga. Até lá, o resgate fica fechado e a carteira mostra o valor projetado. Parâmetros em `settings.economia` permitem reduzir `resposta_aceita` para 30 ou subir `pepitas_por_real` para 150 sem deploy.
