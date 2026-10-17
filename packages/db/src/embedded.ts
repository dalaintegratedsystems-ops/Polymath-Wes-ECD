/**
 * Embedded Postgres (PGlite, with pgvector) for local development without Docker and for
 * end-to-end tests. Data persists in `dataDir` (omit for in-memory). The connection runs as
 * a superuser, so request transactions drop to `wes_app` to keep row-level security in force.
 */
import { mkdirSync } from 'node:fs';
import { assumeRoleOnEachTransaction, type Database } from './client';
import { MIGRATIONS_FOLDER } from './paths';
import * as schema from './schema';

export async function createEmbeddedDatabase(dataDir?: string) {
  const { PGlite } = await import('@electric-sql/pglite');
  const { vector } = await import('@electric-sql/pglite-pgvector');
  const { drizzle } = await import('drizzle-orm/pglite');
  const { migrate } = await import('drizzle-orm/pglite/migrator');

  if (dataDir) mkdirSync(dataDir, { recursive: true });
  const pg = await PGlite.create({ dataDir, extensions: { vector } });
  const owner = drizzle(pg, { schema });
  await migrate(owner, { migrationsFolder: MIGRATIONS_FOLDER });

  // Separate handle so seeding (owner) and requests (wes_app) can't be confused.
  const app = assumeRoleOnEachTransaction(drizzle(pg, { schema }), 'wes_app');

  return {
    db: app as unknown as Database,
    ownerDb: owner as unknown as Database,
    close: () => pg.close(),
  };
}
