// Só aceitamos endpoints dos serviços de push dos navegadores: o servidor faz um POST para esse endereço, então uma
// URL arbitrária viraria SSRF (acesso a rede interna). Comparação por sufixo com o ponto para recusar
// `fcm.googleapis.com.evil.example`.
const EXACT_HOSTS = ['fcm.googleapis.com', 'updates.push.services.mozilla.com'];
const HOST_SUFFIXES = ['.push.apple.com', '.notify.windows.com', '.push.services.mozilla.com'];

export function isAllowedPushEndpoint(url: string): boolean {
  let u: URL;
  try {
    u = new URL(url);
  } catch {
    return false;
  }
  if (u.protocol !== 'https:') return false;
  const host = u.hostname.toLowerCase();
  return EXACT_HOSTS.includes(host) || HOST_SUFFIXES.some((s) => host.endsWith(s));
}
