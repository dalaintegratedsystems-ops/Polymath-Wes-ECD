import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { SEED_IDS } from '@wes/db';
import { bearer, createHarness, idem, signIn, type Harness } from './helpers';

let h: Harness;
let nomsa: string;
let admin: string;
let thandi: string;
let fatima: string;

beforeAll(async () => {
  h = await createHarness();
  nomsa = (await signIn(h, '+27600000001')).accessToken;
  thandi = (await signIn(h, '+27600000002')).accessToken;
  fatima = (await signIn(h, '+27600000003')).accessToken;
  admin = (await signIn(h, '+27600000007')).accessToken;
});
afterAll(async () => h.close());

const C = SEED_IDS.centres;

async function addPerson(token: string, payload: Record<string, unknown>) {
  return h.app.inject({
    method: 'POST',
    url: '/v1/admin/users',
    headers: { ...bearer(token), ...idem() },
    payload,
  });
}

const passwordSignIn = (username: string, password: string) =>
  h.app.inject({ method: 'POST', url: '/v1/auth/password', payload: { username, password } });

describe('admin-managed accounts', () => {
  let sipho = '';
  let temp = '';

  it('lets a principal add a practitioner with a username and shows the password once', async () => {
    const res = await addPerson(nomsa, {
      displayName: 'Sipho',
      centreId: C.siyakhula,
      role: 'practitioner',
      username: 'Sipho.M',
    });
    expect(res.statusCode).toBe(201);
    const body = res.json();
    expect(body.temporaryPassword).toMatch(/^[a-z]+(-[a-z]+){3}-\d{2}$/);
    sipho = body.userId;
    temp = body.temporaryPassword;
  });

  it('rejects a duplicate username and a missing sign-in method', async () => {
    const dup = await addPerson(nomsa, {
      displayName: 'Other',
      centreId: C.siyakhula,
      role: 'parent',
      username: 'sipho.m',
    });
    expect(dup.statusCode).toBe(409);
    const none = await addPerson(nomsa, {
      displayName: 'X',
      centreId: C.siyakhula,
      role: 'parent',
    });
    expect(none.statusCode).toBe(422);
  });

  it('stops practitioners adding people and principals adding to other centres', async () => {
    const a = await addPerson(thandi, {
      displayName: 'X',
      centreId: C.siyakhula,
      role: 'parent',
      username: 'xparent',
    });
    expect(a.statusCode).toBe(403);
    const b = await addPerson(nomsa, {
      displayName: 'X',
      centreId: C.ikhaya,
      role: 'practitioner',
      username: 'xprac',
    });
    expect(b.statusCode).toBe(403);
  });

  it('signs in with the temporary password but allows nothing until it is changed', async () => {
    const res = await passwordSignIn('SIPHO.M', temp);
    expect(res.statusCode).toBe(200);
    const pair = res.json();
    expect(pair.me.mustChangePassword).toBe(true);
    expect(pair.me.username).toBe('sipho.m');

    const blocked = await h.app.inject({
      method: 'GET',
      url: `/v1/centres/${C.siyakhula}`,
      headers: bearer(pair.accessToken),
    });
    expect(blocked.statusCode).toBe(403);
    expect(blocked.json().error.details[0].message).toBe('password_change_required');

    const weak = await h.app.inject({
      method: 'POST',
      url: '/v1/auth/password/change',
      headers: bearer(pair.accessToken),
      payload: { currentPassword: temp, newPassword: 'password123' },
    });
    expect(weak.statusCode).toBe(422);

    const changed = await h.app.inject({
      method: 'POST',
      url: '/v1/auth/password/change',
      headers: bearer(pair.accessToken),
      payload: { currentPassword: temp, newPassword: 'the swing under the tree' },
    });
    expect(changed.statusCode).toBe(200);
    expect(changed.json().mustChangePassword).toBe(false);

    const ok = await h.app.inject({
      method: 'GET',
      url: `/v1/centres/${C.siyakhula}`,
      headers: bearer(pair.accessToken),
    });
    expect(ok.statusCode).toBe(200);
    expect((await passwordSignIn('sipho.m', 'the swing under the tree')).statusCode).toBe(200);
  });

  it('gives the same answer for unknown users and wrong passwords, then locks', async () => {
    const unknown = await passwordSignIn('nobody.here', 'whatever123');
    const wrong = await passwordSignIn('sipho.m', 'not my password');
    expect(unknown.statusCode).toBe(401);
    expect(wrong.statusCode).toBe(401);
    expect(unknown.json().error.message).toBe(wrong.json().error.message);
    for (let i = 0; i < 3; i++) await passwordSignIn('sipho.m', 'not my password');
    const locked = await passwordSignIn('sipho.m', 'not my password');
    expect(locked.statusCode).toBe(429);
    // Even the right password waits out the lock.
    expect((await passwordSignIn('sipho.m', 'the swing under the tree')).statusCode).toBe(429);
  });

  it('a reset unlocks with a new temporary password; deactivation stops access at once', async () => {
    const reset = await h.app.inject({
      method: 'POST',
      url: `/v1/admin/users/${sipho}/reset-password`,
      headers: { ...bearer(nomsa), ...idem() },
    });
    expect(reset.statusCode).toBe(200);
    const signed = await passwordSignIn('sipho.m', reset.json().temporaryPassword);
    expect(signed.statusCode).toBe(200);
    const token = signed.json().accessToken;

    const other = await h.app.inject({
      method: 'PATCH',
      url: `/v1/admin/users/${sipho}/status`,
      headers: { ...bearer(fatima), ...idem() },
      payload: { status: 'deactivated' },
    });
    expect(other.statusCode).toBe(403);

    const off = await h.app.inject({
      method: 'PATCH',
      url: `/v1/admin/users/${sipho}/status`,
      headers: { ...bearer(nomsa), ...idem() },
      payload: { status: 'deactivated' },
    });
    expect(off.statusCode).toBe(204);
    const me = await h.app.inject({ method: 'GET', url: '/v1/me', headers: bearer(token) });
    expect(me.statusCode).toBe(401);
    const again = await passwordSignIn('sipho.m', reset.json().temporaryPassword);
    expect(again.statusCode).toBe(403);
  });

  it('lists people with masked phones for principals and everyone for admins', async () => {
    const mine = await h.app.inject({
      method: 'GET',
      url: '/v1/admin/users',
      headers: bearer(nomsa),
    });
    expect(mine.statusCode).toBe(200);
    const items = mine.json().items as { centreId: string; phoneMasked: string | null }[];
    expect(items.every((p) => p.centreId === C.siyakhula)).toBe(true);
    expect(JSON.stringify(items)).not.toContain('+27600000002');
    const all = await h.app.inject({
      method: 'GET',
      url: '/v1/admin/users',
      headers: bearer(admin),
    });
    expect(new Set((all.json().items as { centreId: string }[]).map((p) => p.centreId)).size).toBe(
      2,
    );
    const prac = await h.app.inject({
      method: 'GET',
      url: '/v1/admin/users',
      headers: bearer(thandi),
    });
    expect(prac.json().items).toEqual([]);
  });
});

describe('dashboards', () => {
  it('shows a principal their centre dashboard and refuses other centres', async () => {
    const res = await h.app.inject({
      method: 'GET',
      url: `/v1/centres/${C.siyakhula}/dashboard`,
      headers: bearer(nomsa),
    });
    expect(res.statusCode).toBe(200);
    const d = res.json();
    expect(d.childrenActive).toBe(11);
    expect(d.from).toBe('2026-09-18');
    expect(d.weekly.length).toBeGreaterThanOrEqual(4);
    const other = await h.app.inject({
      method: 'GET',
      url: `/v1/centres/${C.ikhaya}/dashboard`,
      headers: bearer(nomsa),
    });
    expect(other.statusCode).toBe(404);
  });

  it('validates date ranges', async () => {
    const res = await h.app.inject({
      method: 'GET',
      url: `/v1/centres/${C.siyakhula}/dashboard?from=2026-10-10&to=2026-10-01`,
      headers: bearer(nomsa),
    });
    expect(res.statusCode).toBe(422);
  });

  it('gives platform metrics to admins only, with filters', async () => {
    const res = await h.app.inject({
      method: 'GET',
      url: '/v1/admin/metrics',
      headers: bearer(admin),
    });
    expect(res.statusCode).toBe(200);
    const m = res.json();
    expect(m.centres.total).toBe(2);
    expect(m.users.dau).toBeGreaterThanOrEqual(1); // signing in above counted as activity
    const wc = await h.app.inject({
      method: 'GET',
      url: '/v1/admin/metrics?province=NC',
      headers: bearer(admin),
    });
    expect(wc.json().centres.total).toBe(0);
    const bad = await h.app.inject({
      method: 'GET',
      url: '/v1/admin/metrics?province=XX',
      headers: bearer(admin),
    });
    expect(bad.statusCode).toBe(422);
    const nope = await h.app.inject({
      method: 'GET',
      url: '/v1/admin/metrics',
      headers: bearer(nomsa),
    });
    expect(nope.statusCode).toBe(403);
  });

  it('exports centres as CSV without child-level data', async () => {
    const res = await h.app.inject({
      method: 'GET',
      url: '/v1/admin/metrics/export.csv',
      headers: bearer(admin),
    });
    expect(res.statusCode).toBe(200);
    expect(res.headers['content-type']).toContain('text/csv');
    const lines = res.body.trim().split('\n');
    expect(lines[0]).toContain('Centre,Province');
    expect(lines).toHaveLength(3);
  });
});

describe('profile pictures', () => {
  // 1x1 JPEG with an EXIF (APP1) segment containing a fake GPS marker.
  const exif = Buffer.concat([
    Buffer.from([0xff, 0xe1, 0x00, 0x10]),
    Buffer.from('Exif\0\0GPS-TEST', 'ascii'),
  ]);
  const jpeg = Buffer.concat([
    Buffer.from([0xff, 0xd8]),
    Buffer.from([0xff, 0xe0, 0x00, 0x10, 0x4a, 0x46, 0x49, 0x46, 0, 1, 1, 0, 0, 1, 0, 1, 0, 0]),
    exif,
    Buffer.from([0xff, 0xda, 0x00, 0x02, 0x11, 0x22, 0xff, 0xd9]),
  ]);

  it('stores a photo without its metadata and serves it to colleagues', async () => {
    const put = await h.app.inject({
      method: 'PUT',
      url: '/v1/me/avatar',
      headers: { ...bearer(thandi), 'content-type': 'image/jpeg' },
      payload: jpeg,
    });
    expect(put.statusCode).toBe(200);
    const url = put.json().avatarUrl as string;
    expect(url).toMatch(/^\/v1\/users\/.+\/avatar\?v=/);
    const got = await h.app.inject({ method: 'GET', url, headers: bearer(nomsa) });
    expect(got.statusCode).toBe(200);
    expect(got.headers['content-type']).toBe('image/jpeg');
    expect(got.rawPayload.includes(Buffer.from('GPS-TEST'))).toBe(false);
    const stranger = await h.app.inject({ method: 'GET', url, headers: bearer(fatima) });
    expect(stranger.statusCode).toBe(404);
  });

  it('rejects files that are not images, whatever they claim to be', async () => {
    const res = await h.app.inject({
      method: 'PUT',
      url: '/v1/me/avatar',
      headers: { ...bearer(thandi), 'content-type': 'image/png' },
      payload: Buffer.from('<script>alert(1)</script>'),
    });
    expect(res.statusCode).toBe(422);
  });

  it('lets only the principal set the centre logo', async () => {
    const prac = await h.app.inject({
      method: 'PUT',
      url: `/v1/centres/${C.siyakhula}/logo`,
      headers: { ...bearer(thandi), 'content-type': 'image/jpeg' },
      payload: jpeg,
    });
    expect(prac.statusCode).toBe(403);
    const ok = await h.app.inject({
      method: 'PUT',
      url: `/v1/centres/${C.siyakhula}/logo`,
      headers: { ...bearer(nomsa), 'content-type': 'image/jpeg' },
      payload: jpeg,
    });
    expect(ok.statusCode).toBe(200);
    const centre = await h.app.inject({
      method: 'GET',
      url: `/v1/centres/${C.siyakhula}`,
      headers: bearer(thandi),
    });
    expect(centre.json().logoUrl).toBe(ok.json().logoUrl);
  });
});
