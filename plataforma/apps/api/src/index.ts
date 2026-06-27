import { runMigrations } from './db';
import { runSeed } from './seed-core';
import { env } from './env';
import { buildServer } from './server';
import { startReportCron } from './reports/cron';

await runMigrations();
// Carga inicial idempotente (negocios + usuario OWNER). No tumba el arranque si falla.
try {
  await runSeed();
} catch (e) {
  console.error('Seed al arranque falló (se continúa):', e);
}
const app = await buildServer();
startReportCron(app.log);
await app.listen({ port: env.port, host: '0.0.0.0' });
console.log(`✓ API lista en http://0.0.0.0:${env.port}`);
