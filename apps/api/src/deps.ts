import { sql } from 'drizzle-orm';
import { createDatabase, createEmbeddedDatabase, createFieldCrypto, schema, seed } from '@wes/db';
import type { Config } from './config';
import { createConsoleOtpSender, createFileOtpSender, type AppDeps } from './platform/deps';

/**
 * Production wiring: Postgres as wes_app. Development without DATABASE_URL: an embedded,
 * persistent Postgres (PGlite) seeded with demo data on first start, so `pnpm dev` works
 * without Docker. Row-level security applies in both.
 */
export async function createDeps(config: Config, log: (msg: string) => void) {
  const crypto = createFieldCrypto();
  const consoleSender = createConsoleOtpSender(log);
  const otpSender = config.OTP_OUTBOX_FILE
    ? createFileOtpSender(config.OTP_OUTBOX_FILE, consoleSender)
    : consoleSender;
  const base = { crypto, otpSender, now: () => new Date() };

  if (config.DATABASE_URL) {
    const { db, close } = createDatabase(config.DATABASE_URL);
    return { deps: { ...base, db } satisfies AppDeps, close };
  }
  if (config.NODE_ENV === 'production') throw new Error('DATABASE_URL is required in production');

  const embedded = await createEmbeddedDatabase(config.EMBEDDED_DB_DIR);
  const [row] = await embedded.ownerDb
    .select({ n: sql<number>`count(*)::int` })
    .from(schema.centres);
  if (!row || row.n === 0) {
    await seed(embedded.ownerDb, crypto);
    log(`Embedded database created at ${config.EMBEDDED_DB_DIR} and seeded with demo data.`);
  }
  return { deps: { ...base, db: embedded.db } satisfies AppDeps, close: embedded.close };
}
