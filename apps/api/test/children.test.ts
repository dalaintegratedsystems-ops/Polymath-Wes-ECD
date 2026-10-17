import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { SEED_IDS } from '@wes/db';
import { bearer, createHarness, idem, signIn, type Harness } from './helpers';

let h: Harness;
const tokens: Record<string, string> = {};
const C = SEED_IDS.centres;
const SIYA = { 'x-centre-id': C.siyakhula };

beforeAll(async () => {
  h = await createHarness();
  for (const [name, phone] of Object.entries({
    nomsa: '+27600000001',
    fatima: '+27600000003',
    ayanda: '+27600000005',
    lerato: '+27600000006',
  })) {
    tokens[name] = (await signIn(h, phone)).accessToken;
  }
});
afterAll(async () => h.close());

const auth = (who: string) => bearer(tokens[who]!);
const list = async (who: string) =>
  h.app.inject({ method: 'GET', url: `/v1/centres/${C.siyakhula}/children`, headers: auth(who) });

const addChild = (who: string, headers = idem()) =>
  h.app.inject({
    method: 'POST',
    url: `/v1/centres/${C.siyakhula}/children`,
    headers: { ...auth(who), ...headers },
    payload: {
      firstName: 'Mbali',
      birthMonth: '2024-03',
      guardian: { displayName: 'Nandi', phone: '083 555 0101', relationship: 'mother' },
    },
  });

describe('child register', () => {
  it('shows staff their centre’s children and writes an audit entry', async () => {
    const res = await list('nomsa');
    expect(res.statusCode).toBe(200);
    expect(res.json().children).toHaveLength(11);
    const rows = await h.db.query(
      `select action, resource_type from audit_log where actor_role = 'principal'`,
    );
    expect(rows).toContainEqual({ action: 'list', resource_type: 'child' });
  });

  it('shows a parent only their own children', async () => {
    const res = await list('ayanda');
    expect(
      res
        .json()
        .children.map((c: { firstName: string }) => c.firstName)
        .sort(),
    ).toEqual(['Amahle', 'Lwazi']);
  });

  it('gives funders no child-level access', async () => {
    expect((await list('lerato')).statusCode).toBe(403);
  });
});

describe('consent journey', () => {
  let childId: string;

  it('starts an intake that is not yet a child record', async () => {
    const res = await addChild('nomsa');
    expect(res.statusCode).toBe(201);
    expect(res.json()).toMatchObject({ firstName: 'Mbali', status: 'awaiting_consent' });
    childId = res.json().id;
    const [row] = await h.db.query('select count(*)::int n from children where id = $1', [childId]);
    expect(row?.n).toBe(0);
    const [g] = await h.db.query(
      `select phone_ciphertext from guardians where display_name = 'Nandi'`,
    );
    expect(String(g?.phone_ciphertext)).not.toContain('835550101');
  });

  it('replays a retried intake instead of creating a duplicate', async () => {
    const headers = idem();
    const a = await addChild('nomsa', headers);
    const b = await addChild('nomsa', headers);
    expect(b.json().id).toBe(a.json().id);
    expect(b.headers['idempotent-replay']).toBe('true');
    // Clean up the extra intake.
    await h.app.inject({
      method: 'POST',
      url: `/v1/children/${a.json().id}/consents/revoke`,
      headers: { ...auth('nomsa'), ...SIYA, ...idem() },
    });
  });

  it('sends the guardian a PIN, masked in the response', async () => {
    const res = await h.app.inject({
      method: 'POST',
      url: `/v1/children/${childId}/consents/otp`,
      headers: { ...auth('nomsa'), ...SIYA },
    });
    expect(res.statusCode).toBe(202);
    expect(res.json().sentTo).toBe('+27 83 *** **01');
    expect(h.otp.last('+27835550101')).toMatch(/^\d{6}$/);
  });

  it('rejects a wrong PIN', async () => {
    const real = h.otp.last('+27835550101')!;
    const res = await h.app.inject({
      method: 'POST',
      url: `/v1/children/${childId}/consents`,
      headers: { ...auth('nomsa'), ...SIYA, ...idem() },
      payload: {
        purposes: ['child_record'],
        method: 'guardian_otp',
        code: real === '999999' ? '000000' : '999999',
      },
    });
    expect(res.statusCode).toBe(422);
  });

  it('creates the child record once the guardian’s PIN is entered', async () => {
    const res = await h.app.inject({
      method: 'POST',
      url: `/v1/children/${childId}/consents`,
      headers: { ...auth('nomsa'), ...SIYA, ...idem() },
      payload: {
        purposes: ['child_record', 'parent_messages'],
        method: 'guardian_otp',
        code: h.otp.last('+27835550101'),
      },
    });
    expect(res.statusCode).toBe(201);
    expect(res.json()).toMatchObject({ childId, method: 'guardian_otp', revokedAt: null });
    const children = (await list('nomsa')).json().children;
    expect(children.find((c: { id: string }) => c.id === childId)?.status).toBe('active');
    expect(children).toHaveLength(12);
  });

  it('refuses to record consent twice', async () => {
    await h.app.inject({
      method: 'POST',
      url: `/v1/children/${childId}/consents/otp`,
      headers: { ...auth('nomsa'), ...SIYA },
    });
    const res = await h.app.inject({
      method: 'POST',
      url: `/v1/children/${childId}/consents`,
      headers: { ...auth('nomsa'), ...SIYA, ...idem() },
      payload: { purposes: ['child_record'], method: 'guardian_otp', code: '123456' },
    });
    expect(res.statusCode).toBe(409);
  });

  it('hides the child from another centre’s principal', async () => {
    const res = await h.app.inject({
      method: 'POST',
      url: `/v1/children/${childId}/consents/otp`,
      headers: { ...auth('fatima'), ...SIYA },
    });
    expect(res.statusCode).toBe(404);
  });
});

describe('withdrawing consent', () => {
  const revoke = (who: string, id: string) =>
    h.app.inject({
      method: 'POST',
      url: `/v1/children/${id}/consents/revoke`,
      headers: { ...auth(who), ...SIYA, ...idem() },
    });

  it('deletes the child’s records but keeps anonymous headcounts', async () => {
    const child3 = SEED_IDS.child(3);
    expect((await revoke('nomsa', child3)).statusCode).toBe(204);
    const [c] = await h.db.query('select count(*)::int n from children where id = $1', [child3]);
    const [a] = await h.db.query(
      'select count(*)::int n from attendance_records where child_id = $1',
      [child3],
    );
    const [g] = await h.db.query('select count(*)::int n from guardians where id = $1', [
      SEED_IDS.guardian(3),
    ]);
    const [d] = await h.db.query(
      'select count(*)::int n from attendance_daily_counts where centre_id = $1',
      [C.siyakhula],
    );
    expect([c?.n, a?.n, g?.n]).toEqual([0, 0, 0]);
    expect(d?.n).toBe(5);
    const [k] = await h.db.query(
      `select revoked_at from consents where guardian_id is null and child_id is null limit 1`,
    );
    expect(k?.revoked_at).not.toBeNull();
  });

  it('lets a parent withdraw consent for their own child, and only theirs', async () => {
    expect((await revoke('ayanda', SEED_IDS.child(5))).statusCode).toBe(403);
    expect((await revoke('ayanda', SEED_IDS.child(1))).statusCode).toBe(204);
    const remaining = (await list('ayanda'))
      .json()
      .children.map((c: { firstName: string }) => c.firstName);
    expect(remaining).toEqual(['Amahle']);
  });

  it('audits withdrawals', async () => {
    const rows = await h.db.query(
      `select count(*)::int n from audit_log where action = 'consent_revoked'`,
    );
    expect(rows[0]?.n).toBeGreaterThanOrEqual(2);
  });
});
