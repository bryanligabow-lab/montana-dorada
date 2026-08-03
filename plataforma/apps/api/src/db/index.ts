import path from 'node:path';
import { drizzle as drizzlePg, type NodePgDatabase } from 'drizzle-orm/node-postgres';
import { drizzle as drizzlePglite } from 'drizzle-orm/pglite';
import { PGlite } from '@electric-sql/pglite';
import pg from 'pg';
import { env } from '../env';
import * as schema from './schema';

export type DB = NodePgDatabase<typeof schema>;
export { schema };

let kind: 'pg' | 'pglite' = 'pglite';
let dbPromise: Promise<DB> | null = null;

async function init(): Promise<DB> {
  // Usa Postgres si hay DATABASE_URL o variables PG* (PGHOST/PGUSER/PGPASSWORD/...).
  if (env.databaseUrl || process.env.PGHOST) {
    kind = 'pg';
    // Con connectionString si está; si no, node-postgres lee las PG* del entorno.
    const pool = env.databaseUrl ? new pg.Pool({ connectionString: env.databaseUrl }) : new pg.Pool();
    return drizzlePg(pool, { schema });
  }
  kind = 'pglite';
  const client = new PGlite(env.pgliteDir || undefined);
  await client.waitReady;
  // El driver de PGlite expone la misma API de query que node-postgres.
  return drizzlePglite(client, { schema }) as unknown as DB;
}

export function getDb(): Promise<DB> {
  if (!dbPromise) dbPromise = init();
  return dbPromise;
}

const migrationsFolder = path.resolve(process.cwd(), 'drizzle');

/** Aplica las migraciones generadas por drizzle-kit (idempotente). */
export async function runMigrations(): Promise<void> {
  const db = await getDb();
  if (kind === 'pg') {
    const { migrate } = await import('drizzle-orm/node-postgres/migrator');
    await migrate(db, { migrationsFolder });
  } else {
    const { migrate } = await import('drizzle-orm/pglite/migrator');
    await migrate(db as never, { migrationsFolder });
  }
}
