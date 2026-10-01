import { loadConfig } from './config.js';
import { createDb, migrate, ensureCity } from './db.js';
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
  } else {
    console.log('uso: tsx src/cli.ts migrate | seed');
    process.exitCode = 2;
  }
} finally {
  await sql.end();
}
