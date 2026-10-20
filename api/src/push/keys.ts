import webpush from 'web-push';

// Linhas prontas para colar no .env (usadas pelo comando `push:keys`).
export function vapidKeyLines(): string[] {
  const { publicKey, privateKey } = webpush.generateVAPIDKeys();
  return [
    `VAPID_PUBLIC_KEY=${publicKey}`,
    `VAPID_PRIVATE_KEY=${privateKey}`,
    '# Defina também VAPID_SUBJECT=mailto:contato@seudominio.com.br (ou uma URL https:) para ligar o push.',
  ];
}
