import { resolve } from 'node:path';
import { createEmbeddingProvider, ingestCorpus } from '@wes/agent';
import { storeKnowledgeSource, type Database } from '@wes/db';
import type { JobName, JobPayload } from './queues';

export interface ProcessorContext {
  log: (msg: string, extra?: Record<string, unknown>) => void;
  /** Worker database connection (wes_worker role). Absent in unit tests of stub jobs. */
  db?: Database;
}

type Processor<N extends JobName> = (
  payload: JobPayload<N>,
  ctx: ProcessorContext,
) => Promise<void>;

/** Ingest the curated corpus into the knowledge tables (idempotent: unchanged files are skipped). */
export async function runIngest(db: Database, dir: string, log: ProcessorContext['log']) {
  const report = await ingestCorpus({
    dir: resolve(dir),
    embedder: createEmbeddingProvider(),
    store: (s) =>
      storeKnowledgeSource(db, {
        ...s,
        chunks: s.chunks.map((c) => ({
          ordinal: c.ordinal,
          heading: c.heading,
          citation: c.citation,
          content: c.content,
          tokenCount: c.tokenCount,
          embedding: c.embedding,
        })),
      }),
  });
  log('knowledge ingested', { corpusVersion: report.corpusVersion, results: report.results });
  return report;
}

/**
 * Processor per job. PDF rendering and reminders arrive in Milestone 3; evals run in CI (M2)
 * and on a schedule later.
 */
export const processors: { [N in JobName]: Processor<N> } = {
  'pdf.render': async (p, ctx) => ctx.log('pdf.render not implemented yet (M3)', { kind: p.kind }),
  'knowledge.ingest': async (p, ctx) => {
    if (!ctx.db) throw new Error('knowledge.ingest needs a database connection');
    await runIngest(ctx.db, p.sourcePath, ctx.log);
  },
  'reminders.dispatch': async (_p, ctx) => ctx.log('reminders.dispatch not implemented yet (M3)'),
  'evals.run': async (p, ctx) => ctx.log('evals.run runs in CI for now', { suite: p.suite }),
};
