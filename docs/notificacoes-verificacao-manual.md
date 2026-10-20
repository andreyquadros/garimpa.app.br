# Notificações — verificação manual em aparelho

Os testes automáticos não cobrem o serviço de push real. Antes de liberar, confira em aparelhos de verdade (ADR-0007).

Preparação: gere as chaves com `pnpm push:keys`, coloque `VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY` e `VAPID_SUBJECT` no ambiente da API e abra o app por **https** (produção ou túnel; `localhost` só vale no próprio computador). Use duas contas: A abre a missão, B responde.

## Android (Chrome)

- [ ] Com A, publique uma missão: aparece o cartão de avisos; toque em **Ativar avisos** e aceite a permissão.
- [ ] Em Carteira, a chave **Avisos no celular** está ligada.
- [ ] Com B, envie uma evidência: em até ~10 s chega o push no aparelho de A, com título e texto da evidência.
- [ ] Tocar no aviso abre o app direto na missão.
- [ ] O sino mostra a contagem; abrir `/notificacoes` lista o aviso e marca como lido.
- [ ] Desligar a chave em Carteira: uma nova evidência não gera push, mas continua na lista.

## iPhone (iOS 16.4 ou mais novo)

- [ ] No Safari (app **não** instalado), o cartão mostra as instruções de "Adicionar à Tela de Início" e não oferece o botão de permissão.
- [ ] Instale o app na tela inicial, abra por ele e repita: publicar missão, ativar avisos, B envia evidência, o push chega.
- [ ] Tocar no aviso abre o app na missão.

## Permissão negada

- [ ] Em um aparelho, bloqueie as notificações do site (ou toque em **Agora não** e depois negue na configuração).
- [ ] Uma nova evidência de B aparece no sino e em `/notificacoes`, sem push e sem erro na tela.
- [ ] Carteira explica que os avisos estão bloqueados no aparelho.
- [ ] **Agora não** no cartão some com ele por 30 dias.

## Sair da conta

- [ ] Sair no aparelho de A e ter B enviando outra evidência: nenhum push chega nesse aparelho.
