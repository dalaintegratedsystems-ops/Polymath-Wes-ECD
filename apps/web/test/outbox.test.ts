import 'fake-indexeddb/auto';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { WesOfflineDb } from '../lib/offline/db';
import { enqueue, flush, type Sender } from '../lib/offline/outbox';

let db: WesOfflineDb;

beforeEach(() => {
  db = new WesOfflineDb(`test-${crypto.randomUUID()}`);
});
afterEach(async () => {
  await db.delete();
});

const write = (n: number) => ({
  method: 'POST' as const,
  path: '/v1/centres/c/attendance',
  body: { n },
});

describe('offline outbox', () => {
  it('replays writes in order with a stable idempotency key', async () => {
    const a = await enqueue(db, write(1));
    await enqueue(db, write(2));
    const send = vi.fn<Sender>(async () => ({ status: 201 }));

    const result = await flush(db, send);

    expect(result).toEqual({ sent: 2, conflicts: 0, remaining: 0 });
    expect(send.mock.calls.map(([i]) => (i.body as { n: number }).n)).toEqual([1, 2]);
    expect(send.mock.calls[0]![0].idempotencyKey).toBe(a.idempotencyKey);
  });

  it('stops at a network failure and keeps the rest for later', async () => {
    await enqueue(db, write(1));
    await enqueue(db, write(2));
    const send = vi.fn().mockRejectedValueOnce(new TypeError('Failed to fetch'));

    const result = await flush(db, send);

    expect(result.sent).toBe(0);
    expect(result.remaining).toBe(2);
    expect(send).toHaveBeenCalledOnce();
    const [first] = await db.outbox.orderBy('createdAt').toArray();
    expect(first?.attempts).toBe(1);
  });

  it('parks conflicts for the user instead of retrying them forever', async () => {
    await enqueue(db, write(1));
    await enqueue(db, write(2));
    const send = vi
      .fn()
      .mockResolvedValueOnce({ status: 409, body: { error: { code: 'conflict' } } })
      .mockResolvedValueOnce({ status: 201 });

    const result = await flush(db, send);

    expect(result).toEqual({ sent: 1, conflicts: 1, remaining: 1 });
    const second = await flush(db, send);
    expect(second.sent).toBe(0); // conflicted item is not resent
  });
});
