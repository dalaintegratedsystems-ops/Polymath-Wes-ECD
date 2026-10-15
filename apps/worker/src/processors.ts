import type { JobName, JobPayload } from './queues';

export interface ProcessorContext {
  log: (msg: string, extra?: Record<string, unknown>) => void;
}

type Processor<N extends JobName> = (payload: JobPayload<N>, ctx: ProcessorContext) => Promise<void>;

/**
 * Processor per job. Milestone 0 ships no-op processors that only log; each is filled in
 * by the milestone that owns it (PDF: M3/M4, ingestion: M2, reminders: M3, evals: M2/M7).
 */
export const processors: { [N in JobName]: Processor<N> } = {
  'pdf.render': async (p, ctx) => ctx.log('pdf.render not implemented yet (M3)', { kind: p.kind }),
  'knowledge.ingest': async (p, ctx) =>
    ctx.log('knowledge.ingest not implemented yet (M2)', { corpusVersion: p.corpusVersion }),
  'reminders.dispatch': async (_p, ctx) => ctx.log('reminders.dispatch not implemented yet (M3)'),
  'evals.run': async (p, ctx) => ctx.log('evals.run not implemented yet (M2)', { suite: p.suite }),
};
