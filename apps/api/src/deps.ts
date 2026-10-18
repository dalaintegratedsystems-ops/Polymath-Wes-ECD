import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { sql } from 'drizzle-orm';
import { ingestCorpus } from '@wes/agent';
import {
  createDatabase,
  createEmbeddedDatabase,
  createFieldCrypto,
  schema,
  seed,
  storeKnowledgeSource,
} from '@wes/db';
import type { Config } from './config';
import { createAgentServices } from './platform/agent';
import {
  createAzureBlobStore,
  createFilesystemBlobStore,
  createMemoryBlobStore,
  type BlobStore,
} from './platform/blob';
import { createConsoleOtpSender, createFileOtpSender, type AppDeps } from './platform/deps';

export function createBlobStore(config: Config): BlobStore {
  if (config.BLOB_DRIVER === 'azure') {
    return createAzureBlobStore({
      accountUrl: config.BLOB_ACCOUNT_URL!,
      container: config.BLOB_CONTAINER,
      clientId: config.AZURE_CLIENT_ID,
    });
  }
  if (config.BLOB_DRIVER === 'memory') return createMemoryBlobStore();
  return createFilesystemBlobStore(config.BLOB_DIR);
}

/**
 * Production wiring: Postgres as wes_app. Development without DATABASE_URL: an embedded,
 * persistent Postgres (PGlite) seeded with demo data on first start, so `pnpm dev` works
 * without Docker. Row-level security applies in both.
 */
export async function createDeps(config: Config, log: (msg: string) => void) {
  const crypto = createFieldCrypto();
  if (config.OTP_DELIVERY !== 'console') {
    // Never fall back to logging PINs when real delivery was asked for.
    throw new Error(
      `OTP_DELIVERY=${config.OTP_DELIVERY} is not available yet (WhatsApp and SMS arrive in Milestone 6).`,
    );
  }
  const consoleSender = createConsoleOtpSender(log);
  const otpSender = config.OTP_OUTBOX_FILE
    ? createFileOtpSender(config.OTP_OUTBOX_FILE, consoleSender)
    : consoleSender;
  const now = () => new Date();
  const agent = createAgentServices(process.env, now);
  log(`Wes is running in ${agent.config.mode} mode (embeddings: ${agent.embedder.name}).`);
  const base = { crypto, otpSender, agent, now, blobs: createBlobStore(config) };

  if (config.DATABASE_URL) {
    const { db, close } = createDatabase(config.DATABASE_URL);
    return { deps: { ...base, db } satisfies AppDeps, close };
  }
  if (config.APP_ENV === 'staging' || config.APP_ENV === 'production') {
    throw new Error('DATABASE_URL is required outside development');
  }

  const embedded = await createEmbeddedDatabase(config.EMBEDDED_DB_DIR);
  const [row] = await embedded.ownerDb
    .select({ n: sql<number>`count(*)::int` })
    .from(schema.centres);
  if (!row || row.n === 0) {
    await seed(embedded.ownerDb, crypto);
    log(`Embedded database created at ${config.EMBEDDED_DB_DIR} and seeded with demo data.`);
  }
  // Keep the dev knowledge base in step with knowledge/ (unchanged files are skipped).
  const dir = resolve(process.env.KNOWLEDGE_DIR ?? '../../knowledge');
  if (existsSync(resolve(dir, 'sources.yaml'))) {
    const report = await ingestCorpus({
      dir,
      embedder: agent.embedder,
      store: (src) =>
        storeKnowledgeSource(embedded.ownerDb, {
          ...src,
          chunks: src.chunks.map((c) => ({
            ordinal: c.ordinal,
            heading: c.heading,
            citation: c.citation,
            content: c.content,
            tokenCount: c.tokenCount,
            embedding: c.embedding,
          })),
        }),
    });
    log(
      `Knowledge corpus ${report.corpusVersion}: ${report.results.map((r) => `${r.slug} (${r.outcome})`).join(', ')}`,
    );
  }
  return { deps: { ...base, db: embedded.db } satisfies AppDeps, close: embedded.close };
}
