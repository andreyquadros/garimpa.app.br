import { z } from 'zod';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
export const REPO_ROOT = path.resolve(here, '..', '..'); // garimpa/

const bool = z
  .string()
  .optional()
  .transform((v) => (v == null ? undefined : ['1', 'true', 'yes', 'sim'].includes(v.toLowerCase())));

const schema = z.object({
  NODE_ENV: z.string().default('development'),
  PORT: z.coerce.number().default(8787),
  DATABASE_URL: z.string().default('postgres://postgres@127.0.0.1:54329/garimpa'),
  SESSION_SECRET: z.string().min(16).default('garimpa-dev-secret-troque-em-producao'),
  GOOGLE_CLIENT_ID: z.string().optional(),
  ALLOW_DEV_LOGIN: bool,
  UPLOAD_DIR: z.string().default(path.join(REPO_ROOT, 'uploads')),
  PUBLIC_URL: z.string().default('http://localhost:5173'),
  CITY_DEFAULT: z.string().default('ariquemes'),
  SERVE_WEB_DIR: z.string().optional(),
  TRUST_PROXY: bool,
  INTERNAL_TOKEN: z.string().optional(),
  MAX_UPLOAD_MB: z.coerce.number().default(8),
});

export type Config = ReturnType<typeof loadConfig>;

export function loadConfig(env: NodeJS.ProcessEnv = process.env) {
  const parsed = schema.parse(env);
  const production = parsed.NODE_ENV === 'production';
  // O segredo padrão está no repositório: com ele qualquer sessão (inclusive de moderador) pode ser forjada.
  if (production && parsed.SESSION_SECRET.startsWith('garimpa-dev-secret')) {
    throw new Error('SESSION_SECRET obrigatório em produção (gere com: openssl rand -hex 32).');
  }
  return {
    ...parsed,
    production,
    allowDevLogin: parsed.ALLOW_DEV_LOGIN ?? !production,
    trustProxy: parsed.TRUST_PROXY ?? production,
    secure: production && parsed.PUBLIC_URL.startsWith('https://'),
  };
}
