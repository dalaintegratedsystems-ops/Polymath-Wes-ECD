import type { OutboxItem, WesOfflineDb } from './db';

export type Sender = (item: OutboxItem) => Promise<{ status: number; body?: unknown }>;

const MAX_ATTEMPTS = 8;

function newKey(): string {
  return `${Date.now().toString(36)}-${crypto.randomUUID()}`;
}

/** Queue a write. The idempotency key is fixed now, so every retry is the same request. */
export async function enqueue(
  db: WesOfflineDb,
  write: Pick<OutboxItem, 'method' | 'path' | 'body'>,
): Promise<OutboxItem> {
  const item: OutboxItem = {
    ...write,
    idempotencyKey: newKey(),
    createdAt: Date.now(),
    attempts: 0,
  };
  item.id = await db.outbox.add(item);
  return item;
}

export interface FlushResult {
  sent: number;
  conflicts: number;
  remaining: number;
}

/**
 * Replay queued writes oldest-first. Stops at the first network failure (we're probably
 * offline again) so order is preserved. 409/412 responses are kept as conflicts for the
 * user to resolve; other 4xx are dropped as unrecoverable after recording the error.
 */
export async function flush(db: WesOfflineDb, send: Sender): Promise<FlushResult> {
  let sent = 0;
  let conflicts = 0;
  const items = await db.outbox
    .orderBy('createdAt')
    .filter((i) => !i.conflict)
    .toArray();

  for (const item of items) {
    let res: { status: number; body?: unknown };
    try {
      res = await send(item);
    } catch (err) {
      await db.outbox.update(item.id!, { attempts: item.attempts + 1, lastError: String(err) });
      break;
    }

    if (res.status < 300) {
      await db.outbox.delete(item.id!);
      sent += 1;
    } else if (res.status === 409 || res.status === 412) {
      await db.outbox.update(item.id!, { conflict: { status: res.status, serverBody: res.body } });
      conflicts += 1;
    } else if (res.status >= 500 || res.status === 429) {
      const attempts = item.attempts + 1;
      if (attempts >= MAX_ATTEMPTS) {
        await db.outbox.update(item.id!, {
          attempts,
          conflict: { status: res.status, serverBody: res.body },
        });
        conflicts += 1;
      } else {
        await db.outbox.update(item.id!, { attempts, lastError: `HTTP ${res.status}` });
        break;
      }
    } else {
      await db.outbox.update(item.id!, { conflict: { status: res.status, serverBody: res.body } });
      conflicts += 1;
    }
  }

  const remaining = await db.outbox.count();
  return { sent, conflicts, remaining };
}
