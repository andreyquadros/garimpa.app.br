import { mkdirSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import resetDb from './reset-db.ts';

// O Playwright sobe os `webServer` antes do `globalSetup`, e a API migra o banco ao iniciar: o banco precisa existir
// antes dela. Por isso o comando da API roda este preparo primeiro (ver playwright.config.ts).
await resetDb();

// Fotos dos testes vão para uma pasta fixa e temporária, nunca para a `uploads/` de desenvolvimento; recriada vazia.
const uploadDir = path.join(tmpdir(), 'garimpa-e2e-uploads');
rmSync(uploadDir, { recursive: true, force: true });
mkdirSync(uploadDir, { recursive: true });
