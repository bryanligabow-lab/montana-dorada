import { runMigrations } from './db';
import { env } from './env';
import { buildServer } from './server';
import { startReportCron } from './reports/cron';

await runMigrations();
const app = await buildServer();
startReportCron(app.log);
await app.listen({ port: env.port, host: '0.0.0.0' });
console.log(`✓ API lista en http://0.0.0.0:${env.port}`);
