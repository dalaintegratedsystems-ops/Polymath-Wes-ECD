import { z } from 'zod';

/**
 * Every background job type, with its payload schema. Payloads carry ids, never child
 * names or contact details — the processor loads what it needs under a request context.
 */
export const JOBS = {
  'pdf.render': z.object({
    centreId: z.uuid(),
    kind: z.enum(['policy', 'application_pack', 'printable', 'attendance_export']),
    resourceId: z.uuid(),
    requestedByUserId: z.uuid(),
  }),
  'knowledge.ingest': z.object({
    sourcePath: z.string(),
    corpusVersion: z.string(),
  }),
  'reminders.dispatch': z.object({
    dueBefore: z.iso.datetime(),
  }),
  'evals.run': z.object({
    suite: z.enum(['smoke', 'full']),
    gitSha: z.string().optional(),
  }),
} as const;

export type JobName = keyof typeof JOBS;
export type JobPayload<N extends JobName> = z.infer<(typeof JOBS)[N]>;

/** BullMQ queue per job family, so PDF rendering can't starve reminders. */
export const QUEUE_FOR: Record<JobName, string> = {
  'pdf.render': 'pdf',
  'knowledge.ingest': 'ingest',
  'reminders.dispatch': 'reminders',
  'evals.run': 'evals',
};

export function parseJob<N extends JobName>(name: N, data: unknown): JobPayload<N> {
  return JOBS[name].parse(data) as JobPayload<N>;
}
