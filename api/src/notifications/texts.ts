export type NotificationText = { title: string; body: string };

const TITLE_MAX = 80;
const BODY_MAX = 160;

// O aparelho corta títulos e corpos longos de forma imprevisível; cortamos aqui, com reticências, para o texto
// ficar legível e igual na lista do app e no push.
function cut(text: string, max: number): string {
  const chars = Array.from(text);
  return chars.length <= max ? text : `${chars.slice(0, max - 1).join('')}…`;
}

function make(title: string, body: string): NotificationText {
  return { title: cut(title, TITLE_MAX), body: cut(body, BODY_MAX) };
}

export const novaEvidencia = (tituloMissao: string, lugar: string) => make(`Nova pista para ${tituloMissao}`, lugar);

export const evidenciaConfirmada = (lugar: string) => make('Sua pista foi confirmada', lugar);

export const evidenciaAceita = (lugar: string, pepitas: number) =>
  make('Foi aqui que encontrei!', `Sua pista em ${lugar} foi escolhida${pepitas > 0 ? ` (+${pepitas} pepitas)` : ''}`);

export const gorjetaRecebida = (nome: string, pepitas: number) =>
  make('Agradecimento', `${nome} agradeceu com ${pepitas} pepitas`);

// O SQL de fn_vest_due (migração 0007) monta a mesma frase; o teste garante que as duas batem.
export const pepitasLiberadas = (pepitas: number) =>
  make('Pepitas liberadas', `${pepitas} pepitas liberadas na sua carteira`);
