import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { SEED_IDS } from '@wes/db';
import { bearer, createHarness, signIn, type Harness } from './helpers';

let h: Harness;
beforeAll(async () => {
  h = await createHarness();
});
afterAll(async () => h.close());

const NOMSA = '+27600000001';

describe('OTP sign-in', () => {
  it('sends a PIN without revealing it or whether the number has an account', async () => {
    const res = await h.app.inject({
      method: 'POST',
      url: '/v1/auth/otp',
      payload: { phone: '060 000 0001' },
    });
    expect(res.statusCode).toBe(202);
    expect(res.json()).toEqual({ expiresInSeconds: 300, channel: 'console' });
    expect(res.body).not.toContain(h.otp.last(NOMSA)!);
  });

  it('rejects numbers that are not South African mobiles', async () => {
    const res = await h.app.inject({
      method: 'POST',
      url: '/v1/auth/otp',
      payload: { phone: '021 123 4567' },
    });
    expect(res.statusCode).toBe(422);
    expect(res.json().error.details[0].path).toBe('body.phone');
  });

  it('signs in an existing principal and lists their centre', async () => {
    const pair = await signIn(h, NOMSA);
    expect(pair.isNewUser).toBe(false);
    expect(pair.me.displayName).toBe('Nomsa');
    expect(pair.me.memberships).toEqual([
      {
        centreId: SEED_IDS.centres.siyakhula,
        centreName: 'Siyakhula Educare (demo)',
        role: 'principal',
      },
    ]);
  });

  it('creates an account for a new number', async () => {
    const pair = await signIn(h, '+27711112222', 'Busi');
    expect(pair.isNewUser).toBe(true);
    expect(pair.me.displayName).toBe('Busi');
    expect(pair.me.memberships).toEqual([]);
  });

  it('burns a PIN after five wrong attempts', async () => {
    const phone = '+27711113333';
    await h.app.inject({ method: 'POST', url: '/v1/auth/otp', payload: { phone } });
    const code = h.otp.last(phone)!;
    const wrong = code === '000000' ? '111111' : '000000';
    for (let i = 0; i < 5; i += 1) {
      const res = await h.app.inject({
        method: 'POST',
        url: '/v1/auth/token',
        payload: { phone, code: wrong },
      });
      expect(res.statusCode).toBe(401);
    }
    const res = await h.app.inject({
      method: 'POST',
      url: '/v1/auth/token',
      payload: { phone, code },
    });
    expect(res.statusCode).toBe(401);
  });

  it('rejects an expired PIN', async () => {
    const phone = '+27711114444';
    await h.app.inject({ method: 'POST', url: '/v1/auth/otp', payload: { phone } });
    const code = h.otp.last(phone)!;
    const before = h.clock.now;
    h.clock.now = new Date(before.getTime() + 6 * 60_000);
    const res = await h.app.inject({
      method: 'POST',
      url: '/v1/auth/token',
      payload: { phone, code },
    });
    h.clock.now = before;
    expect(res.statusCode).toBe(401);
  });

  it('links a guardian’s phone to their account as a parent', async () => {
    // Seeded guardian of child #3 at Siyakhula.
    const pair = await signIn(h, '+27600001003', 'Zola');
    expect(pair.me.memberships).toEqual([
      expect.objectContaining({ centreId: SEED_IDS.centres.siyakhula, role: 'parent' }),
    ]);
  });
});

describe('tokens', () => {
  it('protects /v1/me and accepts a valid access token', async () => {
    expect((await h.app.inject({ method: 'GET', url: '/v1/me' })).statusCode).toBe(401);
    const { accessToken } = await signIn(h, NOMSA);
    const res = await h.app.inject({ method: 'GET', url: '/v1/me', headers: bearer(accessToken) });
    expect(res.statusCode).toBe(200);
    expect(res.json().displayName).toBe('Nomsa');
  });

  it('rejects tampered and expired access tokens', async () => {
    const { accessToken } = await signIn(h, NOMSA);
    const tampered = `${accessToken.slice(0, -2)}xx`;
    expect(
      (await h.app.inject({ method: 'GET', url: '/v1/me', headers: bearer(tampered) })).statusCode,
    ).toBe(401);

    const before = h.clock.now;
    h.clock.now = new Date(before.getTime() + 11 * 60_000);
    const res = await h.app.inject({ method: 'GET', url: '/v1/me', headers: bearer(accessToken) });
    h.clock.now = before;
    expect(res.statusCode).toBe(401);
  });

  it('rotates refresh tokens and revokes the family when an old one is reused', async () => {
    const first = await signIn(h, NOMSA);
    const r1 = await h.app.inject({
      method: 'POST',
      url: '/v1/auth/refresh',
      payload: { refreshToken: first.refreshToken },
    });
    expect(r1.statusCode).toBe(200);
    const second = r1.json().refreshToken as string;
    expect(second).not.toBe(first.refreshToken);

    // Someone replays the first (already rotated) token…
    const reuse = await h.app.inject({
      method: 'POST',
      url: '/v1/auth/refresh',
      payload: { refreshToken: first.refreshToken },
    });
    expect(reuse.statusCode).toBe(401);
    // …so the legitimate newer token is revoked too.
    const after = await h.app.inject({
      method: 'POST',
      url: '/v1/auth/refresh',
      payload: { refreshToken: second },
    });
    expect(after.statusCode).toBe(401);
  });

  it('signs out by revoking the session', async () => {
    const pair = await signIn(h, NOMSA);
    const out = await h.app.inject({
      method: 'POST',
      url: '/v1/auth/logout',
      payload: { refreshToken: pair.refreshToken },
    });
    expect(out.statusCode).toBe(204);
    const res = await h.app.inject({
      method: 'POST',
      url: '/v1/auth/refresh',
      payload: { refreshToken: pair.refreshToken },
    });
    expect(res.statusCode).toBe(401);
  });

  it('answers 501 on phase-2 routes once signed in', async () => {
    const { accessToken } = await signIn(h, NOMSA);
    const res = await h.app.inject({
      method: 'GET',
      url: '/v1/behaviour/coach',
      headers: bearer(accessToken),
    });
    expect(res.statusCode).toBe(501);
  });
});

describe('profile', () => {
  it('lets a new user set their name and language', async () => {
    const { accessToken } = await signIn(h, '+27733334444');
    const res = await h.app.inject({
      method: 'PATCH',
      url: '/v1/me',
      headers: { ...bearer(accessToken), 'idempotency-key': 'profile-key-0001' },
      payload: { displayName: 'Sindi', locale: 'xh' },
    });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toMatchObject({ displayName: 'Sindi', locale: 'xh' });
  });
});
