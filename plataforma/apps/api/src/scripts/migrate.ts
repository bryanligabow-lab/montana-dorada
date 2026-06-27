import { runMigrations } from '../db';

await runMigrations();
console.log('✓ Migraciones aplicadas');
process.exit(0);
