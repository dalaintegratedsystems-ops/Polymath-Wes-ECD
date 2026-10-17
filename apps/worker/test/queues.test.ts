import { describe, expect, it, vi } from 'vitest';
import { processors } from '../src/processors';
import { JOBS, QUEUE_FOR, parseJob } from '../src/queues';

describe('job registry', () => {
  it('maps every job to a queue and a processor', () => {
    for (const name of Object.keys(JOBS)) {
      expect(QUEUE_FOR[name as keyof typeof QUEUE_FOR]).toBeTruthy();
      expect(typeof processors[name as keyof typeof processors]).toBe('function');
    }
  });

  it('rejects payloads that do not match the schema', () => {
    expect(() => parseJob('pdf.render', { centreId: 'nope' })).toThrow();
  });

  it('runs a stub processor', async () => {
    const log = vi.fn();
    await processors['evals.run'](parseJob('evals.run', { suite: 'smoke' }), { log });
    expect(log).toHaveBeenCalledOnce();
  });
});

describe('knowledge ingestion', () => {
  it('ingests the corpus once and skips unchanged files on re-run', async () => {
    const { createTestDb } = await import('@wes/db/testing');
    const { runIngest } = await import('../src/processors');
    const t = await createTestDb();
    const dir = new URL('../../../knowledge', import.meta.url).pathname.replace(
      /^\/([A-Za-z]:)/,
      '$1',
    );
    const log = vi.fn();
    const first = await runIngest(t.db, dir, log);
    expect(first.results[0]).toMatchObject({ slug: 'placeholder-ncf', outcome: 'inserted' });
    expect(first.results[0]!.chunks).toBeGreaterThan(0);
    const second = await runIngest(t.db, dir, log);
    expect(second.results[0]!.outcome).toBe('unchanged');
    await t.close();
  }, 120_000);
});
