/**
 * Accounts, people management and dashboards: every path goes through a SECURITY DEFINER
 * function that checks the caller. These tests run as the real `wes_app` role.
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

beforeAll(async () => {
  t = await createTestDb();
  await seed(t.db, createFieldCrypto(), { today: new Date('2026-10-15T10:00:00Z') });
});
afterAll(async () => t?.close());

describe('column privileges', () => {
  it('never lets the app role read password hashes or phone numbers', async () => {
    await expect(t.asRole(ctx.nomsa, (q) => q('select password_hash from users'))).rejects.toThrow(
      /permission denied/,
    );
    await expect(t.asRole(ctx.nomsa, (q) => q('select phone_e164 from users'))).rejects.toThrow(
      /permission denied/,
    );
    const rows = await t.asRole(ctx.nomsa, (q) => q('select id, display_name from users'));
    expect(rows.length).toBeGreaterThan(0);
  });

  it('stops users promoting themselves to platform admin', async () => {
    await expect(
      t.asRole(ctx.nomsa, (q) =>
        q('update users set is_platform_admin = true where id = $1', [U.principalNomsa]),
      ),
    ).rejects.toThrow(/permission denied/);
  });

  it('requires a phone number or a username', async () => {
    await expect(t.query(`insert into users (display_name) values ('Nobody')`)).rejects.toThrow(
      /users_identifier_ck/,
    );
  });
});

describe('people management', () => {
  let created = '';

  it('lets a principal add a practitioner with a username to their own centre', async () => {
    const [row] = await t.asRole(ctx.nomsa, (q) =>
      q(
        `select app.manage_create_user('Sipho Dlamini', 'Sipho.D', null, 'hash-1', $1, 'practitioner') id`,
        [C.siyakhula],
      ),
    );
    created = String(row?.id);
    const [u] = await t.query('select username, must_change_password from users where id = $1', [
      created,
    ]);
    expect(u).toMatchObject({ username: 'sipho.d', must_change_password: true });
  });

  it('refuses a principal adding a principal, adding elsewhere, or a practitioner adding anyone', async () => {
    await expect(
      t.asRole(ctx.nomsa, (q) =>
        q(`select app.manage_create_user('X', 'x1', null, 'h', $1, 'principal')`, [C.siyakhula]),
      ),
    ).rejects.toThrow(/not allowed/);
    await expect(
      t.asRole(ctx.nomsa, (q) =>
        q(`select app.manage_create_user('X', 'x2', null, 'h', $1, 'practitioner')`, [C.ikhaya]),
      ),
    ).rejects.toThrow(/not allowed/);
    await expect(
      t.asRole(ctx.thandi, (q) =>
        q(`select app.manage_create_user('X', 'x3', null, 'h', $1, 'parent')`, [C.siyakhula]),
      ),
    ).rejects.toThrow(/not allowed/);
  });

  it('lists only people of centres the caller runs, with masked phones', async () => {
    const mine = await t.asRole(ctx.nomsa, (q) => q('select * from app.manage_list_users(null)'));
    expect(mine.every((r) => r.centre_id === C.siyakhula)).toBe(true);
    expect(mine.some((r) => r.user_id === created)).toBe(true);
    for (const r of mine) if (r.phone_masked) expect(String(r.phone_masked)).toContain('***');
    expect(
      await t.asRole(ctx.thandi, (q) => q('select * from app.manage_list_users(null)')),
    ).toEqual([]);
    const all = await t.asRole(ctx.admin, (q) => q('select * from app.manage_list_users(null)'));
    expect(new Set(all.map((r) => r.centre_id)).size).toBeGreaterThan(1);
  });

  it('deactivating someone revokes their sessions; other principals cannot', async () => {
    await t.query(
      `insert into refresh_tokens (user_id, family_id, token_hash, expires_at)
       values ($1, gen_random_uuid(), 'h-sipho', now() + interval '1 day')`,
      [created],
    );
    await expect(
      t.asRole(ctx.fatima, (q) => q(`select app.manage_set_status($1, 'deactivated')`, [created])),
    ).rejects.toThrow(/not allowed/);
    await t.asRole(ctx.nomsa, (q) =>
      q(`select app.manage_set_status($1, 'deactivated')`, [created]),
    );
    const [u] = await t.query('select status from users where id = $1', [created]);
    expect(u?.status).toBe('deactivated');
    const open = await t.query(
      'select 1 from refresh_tokens where user_id = $1 and revoked_at is null',
      [created],
    );
    expect(open).toEqual([]);
  });

  it('stops a principal managing themselves or a platform admin', async () => {
    await expect(
      t.asRole(ctx.nomsa, (q) => q(`select app.manage_set_password($1, 'h')`, [U.principalNomsa])),
    ).rejects.toThrow(/not allowed/);
    await expect(
      t.asRole(ctx.nomsa, (q) =>
        q(`select app.manage_set_status($1, 'deactivated')`, [U.adminDala]),
      ),
    ).rejects.toThrow(/not allowed/);
  });
});

describe('password sign-in', () => {
  it('locks an account after repeated failures and unlocks on success', async () => {
    const [row] = await t.asRole(ctx.admin, (q) =>
      q(`select app.manage_create_user('Lock Test', 'locktest', null, 'hash', $1, 'parent') id`, [
        C.siyakhula,
      ]),
    );
    const id = String(row?.id);
    const [found] = await t.asRole(ctx.nobody, (q) =>
      q(`select * from app.auth_password_lookup(' LockTest ')`),
    );
    expect(found).toMatchObject({ user_id: id, password_hash: 'hash', must_change: true });
    let locked: unknown = null;
    for (let i = 0; i < 5; i++) {
      const [r] = await t.asRole(ctx.nobody, (q) =>
        q('select app.auth_password_result($1, false, 5, 15) l', [id]),
      );
      locked = r?.l;
    }
    expect(locked).not.toBeNull();
    await t.asRole(ctx.nobody, (q) => q('select app.auth_password_result($1, true, 5, 15)', [id]));
    const [u] = await t.query('select failed_logins, locked_until from users where id = $1', [id]);
    expect(u).toMatchObject({ failed_logins: 0, locked_until: null });
  });
});

describe('dashboards', () => {
  const range = ['2026-09-01', '2026-10-15'];

  it('gives centre staff their own dashboard only', async () => {
    const [row] = await t.asRole(ctx.nomsa, (q) =>
      q('select app.centre_dashboard($1, $2, $3, 8) d', [C.siyakhula, ...range]),
    );
    const d = row?.d as { childrenActive: number; weekly: unknown[] };
    expect(Number(d.childrenActive)).toBe(11);
    expect(d.weekly).toHaveLength(8);
    await expect(
      t.asRole(ctx.nomsa, (q) =>
        q('select app.centre_dashboard($1, $2, $3, 8)', [C.ikhaya, ...range]),
      ),
    ).rejects.toThrow(/not allowed/);
    await expect(
      t.asRole(ctx.ayanda, (q) =>
        q('select app.centre_dashboard($1, $2, $3, 8)', [C.siyakhula, ...range]),
      ),
    ).rejects.toThrow(/not allowed/);
  });

  it('gives platform admins aggregates and refuses everyone else', async () => {
    const [row] = await t.asRole(ctx.admin, (q) =>
      q('select app.platform_dashboard($1, $2, null, null, null, null, null) d', range),
    );
    const d = row?.d as { centres: { total: number }; users: { total: number } };
    expect(Number(d.centres.total)).toBeGreaterThanOrEqual(2);
    expect(Number(d.users.total)).toBeGreaterThan(0);
    const small = await t.asRole(ctx.admin, (q) =>
      q(`select * from app.platform_centres($1, $2, null, null, 'small', null, 50)`, range),
    );
    expect(small.every((r) => Number(r.children) >= 0)).toBe(true);
    for (const who of [ctx.nomsa, ctx.lerato, ctx.ayanda]) {
      await expect(
        t.asRole(who, (q) =>
          q('select app.platform_dashboard($1, $2, null, null, null, null, null)', range),
        ),
      ).rejects.toThrow(/platform admins only/);
    }
  });

  it('lets users record only their own activity, and nobody read it directly', async () => {
    await t.asRole(ctx.thandi, (q) =>
      q(
        `insert into user_activity_days (user_id, day, centre_id, role)
         values ($1, '2026-10-15', $2, 'practitioner')`,
        [U.practitionerThandi, C.siyakhula],
      ),
    );
    await expect(
      t.asRole(ctx.thandi, (q) =>
        q(`insert into user_activity_days (user_id, day) values ($1, '2026-10-15')`, [
          U.principalNomsa,
        ]),
      ),
    ).rejects.toThrow(/row-level security/);
    await expect(
      t.asRole(ctx.thandi, (q) => q('select * from user_activity_days')),
    ).rejects.toThrow(/permission denied/);
  });
});
