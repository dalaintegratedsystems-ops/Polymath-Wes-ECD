/**
 * Release step: runs before each API revision starts (an init container in Azure).
 * Idempotent, so it is safe on every start:
 *   1. apply database migrations as the owner (admin) role
 *   2. give the wes_app / wes_worker roles their login passwords from Key Vault
 *   3. ingest the curated knowledge corpus (unchanged documents are skipped)
 *   4. optionally load demo data into an empty staging database
 * The owner credential is only ever given to this step, never to the running API.
 */
import { existsSync } from 'node:fs';
import { drizzle } from 'drizzle-orm/postgres-js';
import { migrate } from 'drizzle-orm/postgres-js/migrator';
import postgres from 'postgres';
import { createEmbeddingProvider, ingestCorpus } from '@wes/agent';
import {
  MIGRATIONS_FOLDER,
  createDatabase,
  createFieldCrypto,
  seed,
  storeKnowledgeSource,
} from '@wes/db';

const log = (msg: string) => console.info(JSON.stringify({ level: 'info', step: 'release', msg }));

const ownerUrl = process.env.DATABASE_OWNER_URL;
if (!ownerUrl) throw new Error('DATABASE_OWNER_URL is required for the release step');
const ssl = /sslmode=(require|verify-full)/.test(ownerUrl) ? ('require' as const) : undefined;

// 1. Migrations
const client = postgres(ownerUrl, { max: 1, onnotice: () => {}, ...(ssl ? { ssl } : {}) });
await migrate(drizzle(client), { migrationsFolder: MIGRATIONS_FOLDER });
log('migrations applied');

// 2. Role passwords (roles are created NOLOGIN by migration 0001)
for (const [role, envName] of [
  ['wes_app', 'APP_DB_PASSWORD'],
  ['wes_worker', 'WORKER_DB_PASSWORD'],
] as const) {
  const password = process.env[envName];
  if (!password) continue;
  if (!/^[A-Za-z0-9]{24,128}$/.test(password))
    throw new Error(`${envName} must be 24–128 letters or digits`);
  await client.unsafe(`ALTER ROLE ${role} WITH LOGIN PASSWORD '${password}'`);
  log(`${role} can log in`);
}
await client.end();

// 3. Knowledge corpus
const { db, close } = createDatabase(ownerUrl, { max: 2 });
const dir = process.env.KNOWLEDGE_DIR ?? '/app/knowledge';
if (existsSync(`${dir}/sources.yaml`)) {
  const report = await ingestCorpus({
    dir,
    embedder: createEmbeddingProvider(),
    store: (src) =>
      storeKnowledgeSource(db, {
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
    `knowledge ${report.corpusVersion}: ${report.results.map((r) => `${r.slug}=${r.outcome}`).join(', ')}`,
  );
}

// 4. Demo data (staging only, empty database only)
if (process.env.DEMO_SEED === 'true' && process.env.APP_ENV !== 'production') {
  const [{ n }] = (await db.execute(`select count(*)::int as n from centres`)) as unknown as [
    { n: number },
  ];
  if (n === 0) {
    await seed(db, createFieldCrypto());
    log('demo data loaded');
  }
}
await close();
log('release complete');
