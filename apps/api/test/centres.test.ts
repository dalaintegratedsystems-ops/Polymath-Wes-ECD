import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { SEED_IDS } from '@wes/db';
import { bearer, createHarness, idem, signIn, type Harness } from './helpers';

let h: Harness;
const tokens: Record<string, string> = {};
const C = SEED_IDS.centres;

beforeAll(async () => {
  h = await createHarness();
  for (const [name, phone] of Object.entries({
    nomsa: '+27600000001',
    thandi: '+27600000002',
    fatima: '+27600000003',
    ayanda: '+27600000005',
    lerato: '+27600000006',
  })) {
    tokens[name] = (await signIn(h, phone)).accessToken;
  }
});
afterAll(async () => h.close());

const get = (who: string, url: string) =>
  h.app.inject({ method: 'GET', url, headers: bearer(tokens[who]!) });

describe('onboarding a new centre', () => {
  it('makes the creator its principal', async () => {
    const { accessToken } = await signIn(h, '+27722223333', 'Grace');
    const res = await h.app.inject({
      method: 'POST',
      url: '/v1/centres',
      headers: { ...bearer(accessToken), ...idem() },
      payload: {
        name: 'Masizakhe Creche',
        suburb: 'Gugulethu',
        city: 'Cape Town',
        province: 'WC',
        agesServedMinMonths: 12,
        agesServedMaxMonths: 60,
        childCount: 24,
      },
    });
    expect(res.statusCode).toBe(201);
    const centre = res.json();
    expect(centre).toMatchObject({
      name: 'Masizakhe Creche',
      registrationStatus: 'in_progress',
      defaultLocale: 'en',
    });

    const me = await h.app.inject({ method: 'GET', url: '/v1/me', headers: bearer(accessToken) });
    expect(me.json().memberships).toEqual([
      { centreId: centre.id, centreName: 'Masizakhe Creche', role: 'principal' },
    ]);
  });

  it('checks the age range makes sense', async () => {
    const res = await h.app.inject({
      method: 'POST',
      url: '/v1/centres',
      headers: { ...bearer(tokens.nomsa!), ...idem() },
      payload: {
        name: 'X',
        suburb: '',
        city: '',
        province: 'WC',
        agesServedMinMonths: 60,
        agesServedMaxMonths: 12,
        childCount: 1,
      },
    });
    expect(res.statusCode).toBe(422);
  });
});

describe('centre profile', () => {
  it('lets members read their centre and hides others (404, not 403)', async () => {
    expect((await get('nomsa', `/v1/centres/${C.siyakhula}`)).statusCode).toBe(200);
    expect((await get('ayanda', `/v1/centres/${C.siyakhula}`)).statusCode).toBe(200);
    expect((await get('lerato', `/v1/centres/${C.siyakhula}`)).statusCode).toBe(200);
    expect((await get('fatima', `/v1/centres/${C.siyakhula}`)).statusCode).toBe(404);
  });

  it('lets only the principal update it', async () => {
    const patch = (who: string) =>
      h.app.inject({
        method: 'PATCH',
        url: `/v1/centres/${C.siyakhula}`,
        headers: { ...bearer(tokens[who]!), ...idem() },
        payload: { childCount: 13 },
      });
    expect((await patch('thandi')).statusCode).toBe(403);
    expect((await patch('ayanda')).statusCode).toBe(403);
    const ok = await patch('nomsa');
    expect(ok.statusCode).toBe(200);
    expect(ok.json().childCount).toBe(13);
  });

  it('lists staff for staff only', async () => {
    const res = await get('thandi', `/v1/centres/${C.siyakhula}/staff`);
    expect(res.statusCode).toBe(200);
    expect(res.json().staff.map((s: { displayName: string }) => s.displayName)).toEqual([
      'Nomsa',
      'Thandi',
    ]);
    expect((await get('ayanda', `/v1/centres/${C.siyakhula}/staff`)).statusCode).toBe(403);
    expect((await get('lerato', `/v1/centres/${C.siyakhula}/staff`)).statusCode).toBe(403);
  });
});
