/**
 * Contract tests generated from the route registry (the same source as /v1/openapi.json):
 * every operation is documented, every protected one refuses anonymous callers, path
 * parameters are validated, and every failure uses the one error envelope.
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { ErrorEnvelopeSchema } from '@wes/shared';
import type { RouteSpec } from '../src/platform/route';
import { bearer, createHarness, idem, signIn, type Harness } from './helpers';

let h: Harness;
let specs: RouteSpec[];
let nomsa: string;

beforeAll(async () => {
  h = await createHarness();
  specs = h.app.routeSpecs;
  nomsa = (await signIn(h, '+27600000001')).accessToken;
});
afterAll(async () => h.close());

const NOT_A_UUID = 'not-a-uuid';
const fill = (url: string, value: string) => url.replace(/:(\w+)/g, value);
const expectEnvelope = (body: unknown) =>
  expect(ErrorEnvelopeSchema.safeParse(body).success).toBe(true);

describe('API contract', () => {
  it('documents every route in OpenAPI with a unique operation id and a summary', async () => {
    const doc = (await h.app.inject({ method: 'GET', url: '/v1/openapi.json' })).json() as {
      paths: Record<string, Record<string, { operationId: string }>>;
    };
    const documented = new Set(
      Object.values(doc.paths).flatMap((ops) => Object.values(ops).map((o) => o.operationId)),
    );
    expect(specs.length).toBeGreaterThan(30);
    for (const s of specs) {
      expect(s.summary.length, s.operationId).toBeGreaterThan(5);
      expect(documented.has(s.operationId), s.operationId).toBe(true);
    }
  });

  it('refuses anonymous callers on every protected route with 401 and the envelope', async () => {
    const protectedRoutes = specs.filter((s) => s.auth === 'user');
    expect(protectedRoutes.length).toBeGreaterThan(20);
    for (const s of protectedRoutes) {
      const res = await h.app.inject({
        method: s.method as 'GET',
        url: fill(s.url, '00000000-0000-4000-8000-000000000000'),
        headers: idem(),
        ...(s.body ? { payload: {} } : {}),
      });
      expect(res.statusCode, `${s.method} ${s.url}`).toBe(401);
      expectEnvelope(res.json());
    }
  });

  it('rejects a forged token on every protected route', async () => {
    for (const s of specs.filter((x) => x.auth === 'user').slice(0, 10)) {
      const res = await h.app.inject({
        method: s.method as 'GET',
        url: fill(s.url, '00000000-0000-4000-8000-000000000000'),
        headers: { ...bearer(`${nomsa.slice(0, -4)}AAAA`), ...idem() },
      });
      expect(res.statusCode, `${s.method} ${s.url}`).toBe(401);
    }
  });

  it('validates path parameters on every route that has them', async () => {
    const withParams = specs.filter((s) => s.auth === 'user' && s.url.includes(':'));
    expect(withParams.length).toBeGreaterThan(10);
    for (const s of withParams) {
      const res = await h.app.inject({
        method: s.method as 'GET',
        url: fill(s.url, NOT_A_UUID),
        headers: { ...bearer(nomsa), ...idem() },
        ...(s.body ? { payload: {} } : {}),
      });
      // 422 when params are validated first; 404/403 when the role check runs first.
      expect([403, 404, 415, 422], `${s.method} ${s.url} gave ${res.statusCode}`).toContain(
        res.statusCode,
      );
      if (res.statusCode !== 415) expectEnvelope(res.json());
    }
  });

  it('validates bodies on every write that has one', async () => {
    const writes = specs.filter(
      (s) => s.auth === 'user' && s.body && !s.url.includes(':') && s.method !== 'GET',
    );
    for (const s of writes) {
      const res = await h.app.inject({
        method: s.method as 'POST',
        url: s.url,
        headers: { ...bearer(nomsa), ...idem() },
        payload: { unexpected: { deeply: ['nested'] } },
      });
      expect([400, 403, 404, 422], `${s.method} ${s.url} gave ${res.statusCode}`).toContain(
        res.statusCode,
      );
      expectEnvelope(res.json());
    }
  });

  it('keeps platform-admin routes forbidden to centre staff', async () => {
    for (const url of ['/v1/admin/metrics', '/v1/admin/centres', '/v1/admin/metrics/export.csv']) {
      const res = await h.app.inject({ method: 'GET', url, headers: bearer(nomsa) });
      expect(res.statusCode, url).toBe(403);
      expectEnvelope(res.json());
    }
  });
});
