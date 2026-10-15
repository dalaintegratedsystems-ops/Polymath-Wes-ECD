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
