import setup from './global-setup.ts';

// O Playwright sobe os `webServer` antes do `globalSetup`, e a API migra o banco ao iniciar: o banco precisa existir
// antes dela. Por isso o comando da API roda este preparo primeiro (ver playwright.config.ts).
await setup();
