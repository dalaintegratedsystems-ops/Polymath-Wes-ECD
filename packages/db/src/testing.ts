/**
 * Test database harness.
 *
 * - With TEST_DATABASE_URL set (CI, or local Docker): creates a throwaway database on that
 *   server, migrates it, and drops it on close. Real Postgres 16 + pgvector.
 * - Otherwise: PGlite (Postgres 16 compiled to WASM, with pgvector) in-process, so RLS and
 *   seed tests run anywhere without Docker.
 *
 * `asRole` runs queries as the RLS-restricted `wes_app` role with a request context set,
 * exactly as the API does.
 */
import { randomBytes } from 'node:crypto';
import { assumeRoleOnEachTransaction, type RequestContext, type Database } from './client';
import { MIGRATIONS_FOLDER } from './paths';
import * as schema from './schema';

type Row = Record<string, unknown>;
export type Query = (sql: string, params?: unknown[]) => Promise<Row[]>;

export interface TestDb {
  /** Owner connection (bypasses RLS): setup, seed and assertions. */
  db: Database;
  /** Same database as the API sees it: every transaction runs as wes_app under RLS. */
  appDb: Database;
  /** Run SQL as the owner (bypasses RLS). For setup and assertions. */
  query: Query;
  /** Run `fn` inside a transaction as `wes_app` with the given request context. */
  asRole<T>(
    ctx: RequestContext,
    fn: (q: Query) => Promise<T>,
    dbRole?: 'wes_app' | 'wes_worker',
  ): Promise<T>;
  close(): Promise<void>;
}

const CONTEXT_SQL = `select set_config('app.user_id', $1, true),
                            set_config('app.centre_id', $2, true),
                            set_config('app.role', $3, true)`;

const ctxParams = (ctx: RequestContext) => [ctx.userId ?? '', ctx.centreId ?? '', ctx.role ?? ''];

export async function createTestDb(): Promise<TestDb> {
  const url = process.env.TEST_DATABASE_URL;
  return url ? createPostgresTestDb(url) : createPgliteTestDb();
}

async function createPgliteTestDb(): Promise<TestDb> {
  const { PGlite } = await import('@electric-sql/pglite');
  const { vector } = await import('@electric-sql/pglite-pgvector');
  const { drizzle } = await import('drizzle-orm/pglite');
  const { migrate } = await import('drizzle-orm/pglite/migrator');

  const pg = await PGlite.create({ extensions: { vector } });
  const db = drizzle(pg, { schema });
  await migrate(db, { migrationsFolder: MIGRATIONS_FOLDER });

  const appDb = assumeRoleOnEachTransaction(
    drizzle(pg, { schema }),
    'wes_app',
  ) as unknown as Database;
  return {
    db: db as unknown as Database,
    appDb,
    query: async (sql, params) => (await pg.query<Row>(sql, params)).rows,
    asRole: (ctx, fn, dbRole = 'wes_app') =>
      pg.transaction(async (tx) => {
        await tx.query(`SET LOCAL ROLE ${dbRole}`);
        await tx.query(CONTEXT_SQL, ctxParams(ctx));
        return fn(async (sql, params) => (await tx.query<Row>(sql, params)).rows);
      }),
    close: () => pg.close(),
  };
}

async function createPostgresTestDb(adminUrl: string): Promise<TestDb> {
  const { default: postgres } = await import('postgres');
  const { drizzle } = await import('drizzle-orm/postgres-js');
  const { migrate } = await import('drizzle-orm/postgres-js/migrator');

  const dbName = `wes_test_${randomBytes(6).toString('hex')}`;
  const admin = postgres(adminUrl, { max: 1 });
  await admin.unsafe(`CREATE DATABASE ${dbName}`);

  const url = new URL(adminUrl);
  url.pathname = `/${dbName}`;
  const client = postgres(url.toString(), { max: 4, prepare: false, onnotice: () => {} });
  const db = drizzle(client, { schema });
  await migrate(db, { migrationsFolder: MIGRATIONS_FOLDER });

  const appDb = assumeRoleOnEachTransaction(
    drizzle(client, { schema }),
    'wes_app',
  ) as unknown as Database;
  return {
    db: db as unknown as Database,
    appDb,
    query: async (sql, params) => (await client.unsafe(sql, params as never[])) as unknown as Row[],
    asRole: (ctx, fn, dbRole = 'wes_app') =>
      client.begin(async (tx) => {
        await tx.unsafe(`SET LOCAL ROLE ${dbRole}`);
        await tx.unsafe(CONTEXT_SQL, ctxParams(ctx));
        return fn(
          async (sql, params) => (await tx.unsafe(sql, params as never[])) as unknown as Row[],
        );
      }) as Promise<never>,
    close: async () => {
      await client.end();
      await admin.unsafe(`DROP DATABASE IF EXISTS ${dbName} WITH (FORCE)`);
      await admin.end();
    },
  };
}
