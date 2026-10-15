import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { ErrorEnvelopeSchema } from '@wes/shared';
import { buildApp } from '../src/app';
import { defineRoute } from '../src/platform/route';

let app: FastifyInstance;
let writes = 0;

beforeAll(async () => {
  app = await buildApp({
    logger: false,
    config: { NODE_ENV: 'test', APP_VERSION: '0.0.0-test', RATE_LIMIT_PER_MINUTE: 1000 },
    register: async (a) => {
      // Fixture route exercising validation and idempotency.
      defineRoute(
        a,
        {
          method: 'POST',
          url: '/v1/_test/echo',
          operationId: 'testEcho',
          summary: 'Test fixture',
          tags: ['test'],
          auth: 'public',
          idempotent: true,
          body: z.object({ name: z.string().min(1) }),
          responses: { 201: { description: 'Created' } },
        },
        async ({ body }, reply) => {
          writes += 1;
          return reply.status(201).send({ hello: body.name, n: writes });
        },
      );
    },
  });
});
afterAll(async () => app.close());

describe('system', () => {
  it('reports health', async () => {
    const res = await app.inject({ method: 'GET', url: '/healthz' });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual({ status: 'ok', version: '0.0.0-test' });
    expect(res.headers['x-request-id']).toBeTruthy();
  });

  it('serves a valid-looking OpenAPI 3.1 document', async () => {
    const res = await app.inject({ method: 'GET', url: '/v1/openapi.json' });
    const doc = res.json();
    expect(doc.openapi).toBe('3.1.0');
    expect(doc.paths['/healthz'].get.operationId).toBe('getHealth');
    expect(doc.paths['/v1/meta'].get.responses['200']).toBeDefined();
    expect(doc.components.schemas.ErrorEnvelope.properties.error).toBeDefined();
    expect(doc.paths['/v1/_test/echo'].post.parameters[0].name).toBe('Idempotency-Key');
  });

  it('exposes phase-2 flags as off', async () => {
    const res = await app.inject({ method: 'GET', url: '/v1/meta' });
    expect(res.json().features.voiceNotes).toBe(false);
    expect(res.json().locales).toEqual(['en', 'af', 'xh', 'zu']);
  });

  it('sets security headers', async () => {
    const res = await app.inject({ method: 'GET', url: '/healthz' });
    expect(res.headers['content-security-policy']).toContain("default-src 'none'");
    expect(res.headers['x-content-type-options']).toBe('nosniff');
  });
});

describe('error envelope', () => {
  it('wraps 404s', async () => {
    const res = await app.inject({ method: 'GET', url: '/v1/nope' });
    expect(res.statusCode).toBe(404);
    expect(ErrorEnvelopeSchema.parse(res.json()).error.code).toBe('not_found');
  });

  it('answers 501 for phase-2 routes', async () => {
    const res = await app.inject({ method: 'GET', url: '/v1/behaviour/coach' });
    expect(res.statusCode).toBe(501);
    expect(res.json().error.code).toBe('not_implemented');
  });

  it('reports validation failures with field paths', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/v1/_test/echo',
      headers: { 'idempotency-key': 'key-validation-1' },
      payload: { name: '' },
    });
    expect(res.statusCode).toBe(422);
    expect(res.json().error.details[0].path).toBe('body.name');
  });

  it('wraps malformed JSON', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/v1/_test/echo',
      headers: { 'content-type': 'application/json', 'idempotency-key': 'key-malformed-1' },
      payload: '{nope',
    });
    expect(res.statusCode).toBe(400);
    expect(res.json().error.code).toBe('bad_request');
  });
});

describe('idempotency', () => {
  it('requires a key on idempotent writes', async () => {
    const res = await app.inject({ method: 'POST', url: '/v1/_test/echo', payload: { name: 'Nomsa' } });
    expect(res.statusCode).toBe(400);
  });

  it('replays the first response for a retried request', async () => {
    const send = () =>
      app.inject({
        method: 'POST',
        url: '/v1/_test/echo',
        headers: { 'idempotency-key': 'retry-key-0001' },
        payload: { name: 'Nomsa' },
      });
    const first = await send();
    const second = await send();
    expect(first.statusCode).toBe(201);
    expect(second.statusCode).toBe(201);
    expect(second.json()).toEqual(first.json());
    expect(second.headers['idempotent-replay']).toBe('true');
  });

  it('rejects the same key with a different body', async () => {
    const headers = { 'idempotency-key': 'retry-key-0002' };
    await app.inject({ method: 'POST', url: '/v1/_test/echo', headers, payload: { name: 'A' } });
    const res = await app.inject({ method: 'POST', url: '/v1/_test/echo', headers, payload: { name: 'B' } });
    expect(res.statusCode).toBe(409);
    expect(res.json().error.code).toBe('idempotency_conflict');
  });
});
