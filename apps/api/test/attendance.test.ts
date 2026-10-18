import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { SEED_IDS } from '@wes/db';
import { bearer, createHarness, idem, signIn, type Harness } from './helpers';

let h: Harness;
let nomsa: string;
let thandi: string;
let ayanda: string;

const C = SEED_IDS.centres;
const child = SEED_IDS.child;
const TODAY = '2026-10-15'; // harness clock: Thursday 15 October, 10:00 SAST
const YESTERDAY = '2026-10-14';

beforeAll(async () => {
  h = await createHarness();
  nomsa = (await signIn(h, '+27600000001')).accessToken;
  thandi = (await signIn(h, '+27600000002')).accessToken;
  ayanda = (await signIn(h, '+27600000005')).accessToken;
});
afterAll(async () => h.close());

const record = (token: string, day: string, marks: unknown[], key = idem()) =>
  h.app.inject({
    method: 'POST',
    url: `/v1/centres/${C.siyakhula}/attendance`,
    headers: { ...bearer(token), ...key },
    payload: { day, marks },
  });

describe('recording attendance', () => {
  it('saves newer marks and reports older ones as conflicts', async () => {
    const res = await record(thandi, YESTERDAY, [
      // The seed recorded 08:30 marks for the past days.
      { childId: child(1), status: 'absent', clientUpdatedAt: '2026-10-14T09:00:00+02:00' },
      { childId: child(2), status: 'absent', clientUpdatedAt: '2026-10-14T07:00:00+02:00' },
    ]);
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.applied).toBe(1);
    expect(body.conflicts).toEqual([
      {
        childId: child(2),
        kept: expect.any(String),
        keptAt: expect.stringMatching(/^2026-10-14T06:30/),
      },
    ]);
    expect(body.enrolledCount).toBe(11);

    const day = await h.app.inject({
      method: 'GET',
      url: `/v1/centres/${C.siyakhula}/attendance?day=${YESTERDAY}`,
      headers: bearer(thandi),
    });
    const marks = Object.fromEntries(
      (day.json().marks as { childId: string; status: string }[]).map((m) => [m.childId, m.status]),
    );
    expect(marks[child(1)]).toBe('absent');
    expect(marks[child(2)]).not.toBe('absent');
  });

  it('keeps the newest mark when the same child appears twice in one batch', async () => {
    const res = await record(thandi, TODAY, [
      { childId: child(3), status: 'absent', clientUpdatedAt: '2026-10-15T09:10:00+02:00' },
      { childId: child(3), status: 'present', clientUpdatedAt: '2026-10-15T09:20:00+02:00' },
    ]);
    expect(res.json().applied).toBe(1);
    const day = await h.app.inject({
      method: 'GET',
      url: `/v1/centres/${C.siyakhula}/attendance?day=${TODAY}`,
      headers: bearer(thandi),
    });
    expect(day.json().marks.find((m: { childId: string }) => m.childId === child(3)).status).toBe(
      'present',
    );
  });

  it('treats a replayed sync as the same request', async () => {
    const key = idem();
    const marks = [
      { childId: child(4), status: 'excused', clientUpdatedAt: '2026-10-15T09:30:00+02:00' },
    ];
    const first = await record(thandi, TODAY, marks, key);
    const again = await record(thandi, TODAY, marks, key);
    expect(again.headers['idempotent-replay']).toBe('true');
    expect(again.json()).toEqual(first.json());
  });

  it('refuses future days, very old days, unknown children, parents and missing keys', async () => {
    const mark = {
      childId: child(1),
      status: 'present',
      clientUpdatedAt: '2026-10-15T09:40:00+02:00',
    };
    expect((await record(thandi, '2026-10-16', [mark])).statusCode).toBe(422);
    expect((await record(thandi, '2026-08-01', [mark])).statusCode).toBe(422);
    const other = await record(thandi, TODAY, [{ ...mark, childId: child(15) }]);
    expect(other.statusCode).toBe(422);
    expect((await record(ayanda, TODAY, [mark])).statusCode).toBe(403);
    const noKey = await h.app.inject({
      method: 'POST',
      url: `/v1/centres/${C.siyakhula}/attendance`,
      headers: bearer(thandi),
      payload: { day: TODAY, marks: [mark] },
    });
    expect(noKey.statusCode).toBe(400);
  });
});

describe('monthly export', () => {
  it('gives the principal a CSV register with daily totals', async () => {
    const res = await h.app.inject({
      method: 'GET',
      url: '/v1/attendance/export?month=2026-10',
      headers: { ...bearer(nomsa), 'x-centre-id': C.siyakhula },
    });
    expect(res.statusCode).toBe(200);
    expect(res.headers['content-type']).toContain('text/csv');
    const lines = res.body.trim().split('\n');
    expect(lines[0]).toContain('Register for 2026-10');
    expect(lines[2]).toMatch(/^First name,Birth month,Group,/);
    // 22 weekdays in October 2026, plus 4 label columns.
    expect(lines[2]!.split(',')).toHaveLength(3 + 22 + 1);
    // 11 children, plus title, note, header and two total rows.
    expect(lines).toHaveLength(11 + 5);
    expect(lines.at(-2)).toMatch(/^Children present,/);
    expect(res.body).toMatch(/,P,/);
  });

  it('is for principals only', async () => {
    const res = await h.app.inject({
      method: 'GET',
      url: '/v1/attendance/export?month=2026-10',
      headers: { ...bearer(thandi), 'x-centre-id': C.siyakhula },
    });
    expect(res.statusCode).toBe(403);
  });
});
