import { createHash } from 'node:crypto';
import type { FastifyInstance } from 'fastify';
import { AppError } from '@wes/shared';

/**
 * Idempotency for writes (CLAUDE.md §4). Phones on 3G retry; a retried POST must not
 * create a second attendance record or consent. Routes opt in with `idempotent: true`.
 *
 * Milestone 0 ships the contract and an in-memory store. Milestone 1 swaps in the
 * Postgres-backed store (table `idempotency_keys`, scoped per user).
 */
export interface StoredResponse {
  requestHash: string;
  status: number;
  body: unknown;
}

export interface IdempotencyStore {
  get(scope: string, key: string): Promise<StoredResponse | undefined>;
  put(scope: string, key: string, value: StoredResponse): Promise<void>;
}

export function createMemoryIdempotencyStore(): IdempotencyStore {
  const map = new Map<string, StoredResponse>();
  return {
    get: async (scope, key) => map.get(`${scope}:${key}`),
    put: async (scope, key, value) => {
      map.set(`${scope}:${key}`, value);
    },
  };
}

const KEY_PATTERN = /^[A-Za-z0-9_-]{8,128}$/;

export function registerIdempotency(app: FastifyInstance, store: IdempotencyStore): void {
  app.addHook('preHandler', async (request, reply) => {
    if (!request.routeOptions.config.idempotent) return;
    const key = request.headers['idempotency-key'];
    if (typeof key !== 'string' || !KEY_PATTERN.test(key)) {
      throw new AppError('bad_request', 'Send an Idempotency-Key header (8–128 letters, digits, - or _).');
    }
    // Until auth lands (M1) the scope is the route; afterwards it is the user id.
    const scope = `${request.method} ${request.routeOptions.url}`;
    const requestHash = createHash('sha256').update(JSON.stringify(request.body ?? null)).digest('hex');
    const existing = await store.get(scope, key);
    if (existing) {
      if (existing.requestHash !== requestHash) {
        throw new AppError('idempotency_conflict', 'This Idempotency-Key was already used for a different request.');
      }
      reply.header('idempotent-replay', 'true');
      return reply.status(existing.status).send(existing.body);
    }
    request.idempotency = { scope, key, requestHash };
  });

  app.addHook('onSend', async (request, reply, payload) => {
    const ctx = request.idempotency;
    if (ctx && reply.statusCode < 500) {
      const body = typeof payload === 'string' ? JSON.parse(payload) : payload;
      await store.put(ctx.scope, ctx.key, { requestHash: ctx.requestHash, status: reply.statusCode, body });
    }
    return payload;
  });
}

declare module 'fastify' {
  interface FastifyRequest {
    idempotency?: { scope: string; key: string; requestHash: string };
  }
}
