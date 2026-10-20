import { bumpViaUrl } from './cache-bump.js';
import { loadConfig } from './config.js';
import { createDb, ensureCity, migrate } from './db.js';
import { vapidKeyLines } from './push/keys.js';
import { seedDemo } from './seed.js';

const cmd = process.argv[2];
const config = loadConfig();
const sql = createDb(config.DATABASE_URL);
try {
  if (cmd === 'migrate') {
    const applied = await migrate(sql);
    await ensureCity(sql);
    console.log(applied.length ? `aplicadas: ${applied.join(', ')}` : 'nada a aplicar');
  } else if (cmd === 'seed') {
    await migrate(sql);
    await ensureCity(sql);
    const r = await seedDemo(sql, config.UPLOAD_DIR, config.CITY_DEFAULT);
    console.log(r);
  } else if (cmd === 'cache:bump') {
    if (!config.REDIS_URL) throw new Error('REDIS_URL não definida: não há cache para invalidar.');
    const groups = process.argv.slice(3);
    const r = await bumpViaUrl(config.REDIS_URL, groups);
    if (r.ok) console.log(`grupos invalidados: ${groups.join(', ')}`);
    else {
      console.error(`Não foi possível invalidar o cache: ${r.error}`);
      process.exitCode = 1;
    }
  } else if (cmd === 'push:keys') {
    console.log(vapidKeyLines().join('\n'));
  } else {
    console.log('uso: tsx src/cli.ts migrate | seed | cache:bump <grupo...> | push:keys');
    process.exitCode = 2;
  }
} finally {
  await sql.end();
}
