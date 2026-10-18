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
import { WhatsAppCloudAdapter } from '@wes/channels';
import {
  createConsoleOtpSender,
  createFileOtpSender,
  createWhatsAppOtpSender,
  type AppDeps,
  type OtpSender,
} from './platform/deps';

export function createWhatsApp(config: Config): WhatsAppCloudAdapter | undefined {
  if (
    !config.WHATSAPP_PHONE_NUMBER_ID ||
    !config.WHATSAPP_ACCESS_TOKEN ||
    !config.WHATSAPP_APP_SECRET
  ) {
    return undefined;
  }
  return new WhatsAppCloudAdapter({
    phoneNumberId: config.WHATSAPP_PHONE_NUMBER_ID,
    accessToken: config.WHATSAPP_ACCESS_TOKEN,
    appSecret: config.WHATSAPP_APP_SECRET,
    baseUrl: config.WHATSAPP_GRAPH_URL,
    graphVersion: config.WHATSAPP_GRAPH_VERSION,
  });
}

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
  if (config.OTP_DELIVERY === 'sms') {
    // Never fall back to logging PINs when real delivery was asked for.
    throw new Error(
      'OTP_DELIVERY=sms needs an SMS provider (<<SMS_PROVIDER_CREDENTIALS>>); use whatsapp.',
    );
  }
  const whatsapp = createWhatsApp(config);
  let otpSender: OtpSender;
  if (config.OTP_DELIVERY === 'whatsapp') {
    otpSender = createWhatsAppOtpSender(whatsapp!, {
      template: config.WHATSAPP_OTP_TEMPLATE,
      language: config.WHATSAPP_TEMPLATE_LANGUAGE,
    });
  } else {
    const consoleSender = createConsoleOtpSender(log);
    otpSender = config.OTP_OUTBOX_FILE
      ? createFileOtpSender(config.OTP_OUTBOX_FILE, consoleSender)
      : consoleSender;
  }
  const now = () => new Date();
  const agent = createAgentServices(process.env, now);
  log(`Wes is running in ${agent.config.mode} mode (embeddings: ${agent.embedder.name}).`);
  if (whatsapp) log('WhatsApp channel is on.');
  const base = { crypto, otpSender, agent, now, blobs: createBlobStore(config), whatsapp };

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
