import { and, eq } from 'drizzle-orm';
import { schema, withRequestContext, type Database } from '@wes/db';
import { createMemoryIdempotencyStore, type IdempotencyStore } from './idempotency';

/**
 * Idempotency keys in Postgres, scoped to the user by RLS (`idempotency_own` policy), so a
 * retry from a phone that dropped off 3G replays the first response even across API restarts.
 */
export function createPostgresIdempotencyStore(db: Database): IdempotencyStore {
  const anonymous = createMemoryIdempotencyStore();
  const ctx = (userId: string) => ({ userId, centreId: null, role: null });

  return {
    async get(scope, key) {
      if (scope === 'anon') return anonymous.get(scope, key);
      return withRequestContext(db, ctx(scope), async (tx) => {
        const [row] = await tx
          .select()
          .from(schema.idempotencyKeys)
          .where(
            and(eq(schema.idempotencyKeys.userId, scope), eq(schema.idempotencyKeys.key, key)),
          );
        if (!row || row.responseStatus === null) return undefined;
        return { requestHash: row.requestHash, status: row.responseStatus, body: row.responseBody };
      });
    },
    async put(scope, key, value) {
      if (scope === 'anon') return anonymous.put(scope, key, value);
      await withRequestContext(db, ctx(scope), async (tx) => {
        await tx
          .insert(schema.idempotencyKeys)
          .values({
            key,
            userId: scope,
            method: '',
            path: '',
            requestHash: value.requestHash,
            responseStatus: value.status,
            responseBody: value.body,
          })
          .onConflictDoNothing();
      });
    },
  };
}
