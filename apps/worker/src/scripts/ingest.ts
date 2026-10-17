// Ingest knowledge/ into the database. Uses DATABASE_OWNER_URL (or DATABASE_WORKER_URL).
// Usage: pnpm --filter @wes/worker ingest [path-to-knowledge-dir]
import { fileURLToPath } from 'node:url';
import { createDatabase } from '@wes/db';
import { runIngest } from '../processors';

const url = process.env.DATABASE_WORKER_URL ?? process.env.DATABASE_OWNER_URL;
if (!url) {
  throw new Error(
    'Set DATABASE_WORKER_URL or DATABASE_OWNER_URL. With the embedded dev database, the API ingests on start-up instead.',
  );
}
const dir = process.argv[2] ?? fileURLToPath(new URL('../../../../knowledge', import.meta.url));
const { db, close } = createDatabase(url, { max: 1 });
const report = await runIngest(db, dir, (msg, extra) =>
  console.info(msg, JSON.stringify(extra ?? {}, null, 2)),
);
await close();
console.info(`Corpus ${report.corpusVersion}: ${report.results.length} source(s) processed.`);
