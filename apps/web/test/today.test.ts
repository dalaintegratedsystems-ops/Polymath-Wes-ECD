import { describe, expect, it } from 'vitest';
import { sastNow } from '../lib/today';

describe('sastNow', () => {
  it('uses South African time regardless of server timezone', () => {
    // 22:30 UTC on Wednesday is 00:30 SAST on Thursday.
    const r = sastNow(new Date('2026-10-14T22:30:00Z'));
    expect(r.hour).toBe(0);
    expect(r.weekdayKey).toBe('thu');
    expect(r.dateLabel).toBe('Thursday 15 October');
  });
});
