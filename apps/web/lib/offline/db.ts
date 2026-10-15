import Dexie, { type EntityTable } from 'dexie';

/**
 * On-device storage (IndexedDB via Dexie). Loaded lazily so it never weighs on first paint.
 *
 * - drafts: unsent work (a policy answer, a half-finished register) that survives reloads.
 * - outbox: API writes made offline, replayed in order with their idempotency keys (ADR-0005).
 */
export interface Draft {
  key: string;
  value: unknown;
  updatedAt: number;
}

export interface OutboxItem {
  id?: number;
  method: 'POST' | 'PATCH' | 'PUT' | 'DELETE';
  path: string;
  body: unknown;
  idempotencyKey: string;
  createdAt: number;
  attempts: number;
  lastError?: string;
  /** Set when the server rejected it with a conflict the user must resolve. */
  conflict?: { status: number; serverBody: unknown };
}

export class WesOfflineDb extends Dexie {
  drafts!: EntityTable<Draft, 'key'>;
  outbox!: EntityTable<OutboxItem, 'id'>;

  constructor(name = 'wes') {
    super(name);
    this.version(1).stores({
      drafts: 'key, updatedAt',
      outbox: '++id, createdAt, idempotencyKey',
    });
  }
}
