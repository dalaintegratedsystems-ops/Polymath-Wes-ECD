import { sql } from 'drizzle-orm';
import type { PgDatabase, PgQueryResultHKT } from 'drizzle-orm/pg-core';
import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import * as schema from './schema';

export type Schema = typeof schema;
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type Database = PgDatabase<PgQueryResultHKT, Schema, any>;
export type Transaction = Parameters<Parameters<Database['transaction']>[0]>[0];

export function createDatabase(url: string, options: { max?: number } = {}) {
  const client = postgres(url, { max: options.max ?? 10, prepare: false });
  const db = drizzle(client, { schema });
  return { db, close: () => client.end() };
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

/** Run `fn` in a transaction scoped to `ctx`. All centre data access must go through this. */
export async function withRequestContext<T>(
  db: Database,
  ctx: RequestContext,
  fn: (tx: Transaction) => Promise<T>,
): Promise<T> {
  return db.transaction(async (tx) => {
    await tx.execute(sql`select
      set_config('app.user_id', ${ctx.userId ?? ''}, true),
      set_config('app.centre_id', ${ctx.centreId ?? ''}, true),
      set_config('app.role', ${ctx.role ?? ''}, true)`);
    return fn(tx);
  });
}
