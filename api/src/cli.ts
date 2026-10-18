import { createCache } from './cache.js';
import { bumpGroups } from './cache-bump.js';
import { loadConfig } from './config.js';
import { createDb, ensureCity, migrate } from './db.js';
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
    const cache = createCache(config.REDIS_URL);
    try {
      await bumpGroups(cache, process.argv.slice(3));
    } finally {
      await cache.close();
    }
    console.log(`grupos invalidados: ${process.argv.slice(3).join(', ')}`);
  } else {
    console.log('uso: tsx src/cli.ts migrate | seed | cache:bump <grupo...>');
    process.exitCode = 2;
  }
} finally {
  await sql.end();
}
