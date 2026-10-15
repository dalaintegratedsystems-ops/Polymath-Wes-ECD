/**
 * Row-level security is the last line of defence for child data. These tests run as the
 * real `wes_app` role against migrated Postgres (PGlite locally, Postgres 16 in CI).
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { RequestContext } from '../src/client';
import { createFieldCrypto } from '../src/crypto';
import { SEED_IDS, seed } from '../src/seed';
import { createTestDb, type TestDb } from '../src/testing';

const C = SEED_IDS.centres;
const U = SEED_IDS.users;

const ctx = {
  nomsa: { userId: U.principalNomsa, centreId: C.siyakhula, role: 'principal' },
  thandi: { userId: U.practitionerThandi, centreId: C.siyakhula, role: 'practitioner' },
  fatima: { userId: U.principalFatima, centreId: C.ikhaya, role: 'principal' },
  ayanda: { userId: U.parentAyanda, centreId: C.siyakhula, role: 'parent' },
  lerato: { userId: U.funderLerato, centreId: C.siyakhula, role: 'funder' },
  admin: { userId: U.adminDala, centreId: C.siyakhula, role: 'admin' },
  nobody: { userId: null, centreId: null, role: null },
} satisfies Record<string, RequestContext>;

let t: TestDb;
const crypto = createFieldCrypto();

beforeAll(async () => {
  t = await createTestDb();
  await seed(t.db, crypto, { today: new Date('2026-10-15T10:00:00Z') });
});
afterAll(async () => t?.close());

const count = async (c: RequestContext, sql: string) =>
  Number((await t.asRole(c, (q) => q(sql)))[0]?.n);

describe('schema guarantees', () => {
  it('enables RLS on every table except the pre-auth OTP table', async () => {
    const rows = await t.query(
      `select c.relname from pg_class c join pg_namespace n on n.oid = c.relnamespace
       where n.nspname = 'public' and c.relkind = 'r' and not c.relrowsecurity`,
    );
    expect(rows.map((r) => r.relname)).toEqual(['otp_challenges']);
  });

  it('gives wes_app no BYPASSRLS', async () => {
    const [row] = await t.query(`select rolbypassrls from pg_roles where rolname = 'wes_app'`);
    expect(row?.rolbypassrls).toBe(false);
  });
});

describe('centre isolation', () => {
  it('shows staff only their own centre’s children', async () => {
    expect(await count(ctx.nomsa, 'select count(*) n from children')).toBe(11);
    expect(await count(ctx.thandi, 'select count(*) n from children')).toBe(11);
    expect(await count(ctx.fatima, 'select count(*) n from children')).toBe(9);
  });

  it('hides another centre’s child even when asked by id', async () => {
    const ikhayaChild = SEED_IDS.child(12);
    const rows = await t.asRole(ctx.nomsa, (q) =>
      q('select id from children where id = $1', [ikhayaChild]),
    );
    expect(rows).toEqual([]);
  });

  it('blocks writing a child into another centre', async () => {
    await expect(
      t.asRole(ctx.nomsa, (q) =>
        q(`insert into children (centre_id, first_name, birth_month) values ($1, 'X', '2024-01')`, [
          C.ikhaya,
        ]),
      ),
    ).rejects.toThrow(/row-level security/);
  });

  it('returns nothing without a request context', async () => {
    expect(await count(ctx.nobody, 'select count(*) n from children')).toBe(0);
    expect(await count(ctx.nobody, 'select count(*) n from centres')).toBe(0);
    expect(await count(ctx.nobody, 'select count(*) n from guardians')).toBe(0);
  });
});

describe('role rules', () => {
  it('shows a parent only their own children and their attendance', async () => {
    const rows = await t.asRole(ctx.ayanda, (q) =>
      q('select first_name from children order by first_name'),
    );
    expect(rows.map((r) => r.first_name)).toEqual(['Amahle', 'Lwazi']);
    expect(await count(ctx.ayanda, 'select count(*) n from attendance_records')).toBe(10);
  });

  it('stops parents from creating child records', async () => {
    await expect(
      t.asRole(ctx.ayanda, (q) =>
        q(`insert into children (centre_id, first_name, birth_month) values ($1, 'X', '2024-01')`, [
          C.siyakhula,
        ]),
      ),
    ).rejects.toThrow(/row-level security/);
  });

  it('gives funders aggregates but no child-level data', async () => {
    await t.query(
      `insert into attendance_daily_counts (centre_id, day, present_count, enrolled_count)
       values ($1, '2026-10-15', 9, 11), ($2, '2026-10-15', 8, 9)`,
      [C.siyakhula, C.ikhaya],
    );
    expect(await count(ctx.lerato, 'select count(*) n from children')).toBe(0);
    expect(await count(ctx.lerato, 'select count(*) n from guardians')).toBe(0);
    expect(await count(ctx.lerato, 'select count(*) n from attendance_records')).toBe(0);
    expect(await count(ctx.lerato, 'select count(*) n from attendance_daily_counts')).toBe(1);
  });

  it('keeps platform admins out of child data but lets them see centres', async () => {
    expect(await count(ctx.admin, 'select count(*) n from children')).toBe(0);
    expect(await count(ctx.admin, 'select count(*) n from centres')).toBe(2);
  });

  it('only lets principals update the centre profile', async () => {
    const updated = await t.asRole(ctx.thandi, (q) =>
      q(`update centres set child_count = 99 where id = $1 returning id`, [C.siyakhula]),
    );
    expect(updated).toEqual([]);
    const ok = await t.asRole(ctx.nomsa, (q) =>
      q(`update centres set child_count = 12 where id = $1 returning id`, [C.siyakhula]),
    );
    expect(ok).toHaveLength(1);
  });
});

describe('audit log and catalogues', () => {
  it('lets the app append to the audit log but never read it', async () => {
    await t.asRole(ctx.nomsa, (q) =>
      q(`insert into audit_log (action, resource_type, centre_id) values ('read', 'child', $1)`, [
        C.siyakhula,
      ]),
    );
    await expect(t.asRole(ctx.nomsa, (q) => q('select * from audit_log'))).rejects.toThrow(
      /permission denied/,
    );
  });

  it('keeps the knowledge base read-only for the API', async () => {
    expect(await count(ctx.nomsa, 'select count(*) n from knowledge_sources')).toBe(1);
    await expect(t.asRole(ctx.nomsa, (q) => q(`delete from knowledge_sources`))).rejects.toThrow(
      /permission denied/,
    );
  });
});

describe('seed', () => {
  it('stores guardian phones encrypted, findable by blind index', async () => {
    const [row] = await t.query(
      'select phone_ciphertext from guardians where phone_blind_index = $1',
      [crypto.blindIndex('+27600000005')],
    );
    expect(String(row?.phone_ciphertext)).not.toContain('27600000005');
    expect(crypto.decrypt(String(row?.phone_ciphertext))).toBe('+27600000005');
  });

  it('records consent for every child', async () => {
    const [row] = await t.query(
      `select count(*) n from children c where not exists
         (select 1 from consents k where k.child_id = c.id and 'child_record' = any(k.purposes) and k.revoked_at is null)`,
    );
    expect(Number(row?.n)).toBe(0);
  });
});
