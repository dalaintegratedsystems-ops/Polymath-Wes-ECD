import { Worker, type Job } from 'bullmq';
import { createDatabase } from '@wes/db';
import { processors } from './processors';
import { JOBS, QUEUE_FOR, parseJob, type JobName } from './queues';

const redisUrl = process.env.REDIS_URL ?? 'redis://localhost:6379';
const connection = { url: redisUrl, maxRetriesPerRequest: null };

const log = (msg: string, extra: Record<string, unknown> = {}) =>
  console.info(JSON.stringify({ level: 'info', msg, ...extra }));

// The worker connects as wes_worker (scoped grants, RLS still applies to centre data).
const dbUrl = process.env.DATABASE_WORKER_URL;
const database = dbUrl ? createDatabase(dbUrl, { max: 4 }) : null;

const queues = [...new Set(Object.values(QUEUE_FOR))];

const workers = queues.map(
  (queue) =>
    new Worker(
      queue,
      async (job: Job) => {
        const name = job.name as JobName;
        if (!(name in JOBS)) throw new Error(`Unknown job ${job.name} on queue ${queue}`);
        const payload = parseJob(name, job.data);
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        await (processors[name] as any)(payload, { log, db: database?.db });
      },
      { connection, concurrency: queue === 'pdf' ? 2 : 5 },
    ),
);

for (const w of workers) {
  w.on('failed', (job, err) =>
    console.error(JSON.stringify({ level: 'error', job: job?.name, err: err.message })),
  );
}
log('worker started', { queues });

const shutdown = async () => {
  await Promise.all(workers.map((w) => w.close()));
  await database?.close();
  process.exit(0);
};
process.on('SIGTERM', () => void shutdown());
process.on('SIGINT', () => void shutdown());
