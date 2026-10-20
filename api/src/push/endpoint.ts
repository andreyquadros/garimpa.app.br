// Só aceitamos endpoints dos serviços de push dos navegadores: o servidor faz um POST para esse endereço, então uma
// URL arbitrária viraria SSRF (acesso a rede interna). Comparação por sufixo com o ponto para recusar
// `fcm.googleapis.com.evil.example`; porta explícita e credenciais na URL também são recusadas.
const EXACT_HOSTS = ['fcm.googleapis.com', 'updates.push.services.mozilla.com'];
const HOST_SUFFIXES = ['.push.apple.com', '.notify.windows.com', '.push.services.mozilla.com'];

// Devolve a forma canônica (href) quando o endpoint é permitido; assim a mesma inscrição não vira duas linhas por
// diferença de maiúsculas e o web-push enxerga uma URL padronizada.
export function normalizePushEndpoint(url: string): string | null {
  let u: URL;
  try {
    u = new URL(url);
  } catch {
    return null;
  }
  if (u.protocol !== 'https:' || u.port || u.username || u.password) return null;
  const host = u.hostname.toLowerCase();
  const ok = EXACT_HOSTS.includes(host) || HOST_SUFFIXES.some((s) => host.endsWith(s));
  return ok ? u.href : null;
}

export function isAllowedPushEndpoint(url: string): boolean {
  return normalizePushEndpoint(url) !== null;
}
