import { runMigrations } from './db';
import { runSeed } from './seed-core';

await runMigrations();
await runSeed();
process.exit(0);
