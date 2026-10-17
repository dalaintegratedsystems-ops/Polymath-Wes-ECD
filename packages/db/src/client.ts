import { sql } from 'drizzle-orm';
import type { PgDatabase, PgQueryResultHKT } from 'drizzle-orm/pg-core';
import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import * as schema from './schema';

export type Schema = typeof schema;
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type Database = PgDatabase<PgQueryResultHKT, Schema, any>;
export type Transaction = Parameters<Parameters<Database['transaction']>[0]>[0];

/**
 * When the connection itself is privileged (embedded PGlite in dev and tests runs as a
 * superuser), every request transaction must first drop to the RLS-restricted role.
 * Production connects as `wes_app` directly and needs no switch.
 */
const ASSUME_ROLE = Symbol.for('wes.assumeRole');

export function assumeRoleOnEachTransaction<T extends object>(
  db: T,
  role: 'wes_app' | 'wes_worker',
): T {
  Object.defineProperty(db, ASSUME_ROLE, { value: role, enumerable: false });
  return db;
}

export function createDatabase(url: string, options: { max?: number } = {}) {
  const client = postgres(url, { max: options.max ?? 10, prepare: false, onnotice: () => {} });
  const db = drizzle(client, { schema });
  return { db: db as unknown as Database, close: () => client.end() };
}

/**
 * Identity of whoever is making the request. Becomes Postgres session settings that the
 * row-level security policies read (ADR-0003). `role` is the membership role in `centreId`
 * — verified by the API before this point — or 'system' for worker jobs.
 */
export interface RequestContext {
  userId: string | null;
  centreId: string | null;
  role: 'principal' | 'practitioner' | 'parent' | 'funder' | 'admin' | 'system' | null;
}

export const ANONYMOUS: RequestContext = { userId: null, centreId: null, role: null };

/** Run `fn` in a transaction scoped to `ctx`. All data access from the API goes through this. */
export async function withRequestContext<T>(
  db: Database,
  ctx: RequestContext,
  fn: (tx: Transaction) => Promise<T>,
): Promise<T> {
  const role = (db as unknown as Record<symbol, string | undefined>)[ASSUME_ROLE];
  return db.transaction(async (tx) => {
    if (role) await tx.execute(sql.raw(`SET LOCAL ROLE ${role}`));
    await tx.execute(sql`select
      set_config('app.user_id', ${ctx.userId ?? ''}, true),
      set_config('app.centre_id', ${ctx.centreId ?? ''}, true),
      set_config('app.role', ${ctx.role ?? ''}, true)`);
    return fn(tx);
  });
}
