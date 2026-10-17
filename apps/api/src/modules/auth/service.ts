import { and, eq, isNull, sql } from 'drizzle-orm';
import { AppError, normaliseSaPhone, type Me, type TokenPair } from '@wes/shared';
import { ANONYMOUS, schema, withRequestContext, type Transaction } from '@wes/db';
import type { Config } from '../../config';
import type { AppDeps } from '../../platform/deps';
import {
  hashRefreshToken,
  newRefreshToken,
  parseRefreshToken,
  type TokenService,
} from '../../platform/tokens';
import {
  assertAcceptablePassword,
  dummyPasswordHash,
  hashPassword,
  verifyPassword,
} from '../../platform/passwords';
import { rowsOf } from '../../platform/sql';
import { createChallenge, verifyChallenge, type OtpPolicy } from './otp';

export function otpPolicy(config: Config): OtpPolicy {
  return {
    pepper: config.OTP_PEPPER,
    ttlSeconds: config.OTP_TTL_SECONDS,
    maxAttempts: config.OTP_MAX_ATTEMPTS,
    maxPerWindow: config.OTP_MAX_PER_WINDOW,
  };
}

export function requirePhone(input: string): string {
  const phone = normaliseSaPhone(input);
  if (!phone) {
    throw new AppError(
      'validation_failed',
      'Use a South African mobile number, e.g. 082 123 4567',
      [{ path: 'body.phone', message: 'Use a South African mobile number, e.g. 082 123 4567' }],
    );
  }
  return phone;
}

export async function loadMe(tx: Transaction, userId: string): Promise<Me> {
  const [row] = await tx
    .select({
      id: schema.users.id,
      displayName: schema.users.displayName,
      locale: schema.users.locale,
      username: schema.users.username,
      avatar: schema.users.avatarBlobKey,
      mustChangePassword: schema.users.mustChangePassword,
      isPlatformAdmin: schema.users.isPlatformAdmin,
    })
    .from(schema.users)
    .where(eq(schema.users.id, userId));
  if (!row) throw new AppError('unauthenticated', 'Please sign in again.');
  const { avatar, ...user } = row;
  const list = rowsOf<{
    centre_id: string;
    centre_name: string;
    role: Me['memberships'][number]['role'];
  }>(await tx.execute(sql`select centre_id, centre_name, role from app.my_memberships()`));
  return {
    ...user,
    avatarUrl: avatar ? `/v1/users/${user.id}/avatar?v=${avatar.slice(0, 8)}` : null,
    memberships: list.map((r) => ({
      centreId: r.centre_id,
      centreName: r.centre_name,
      role: r.role,
    })),
  };
}

export function createAuthService(deps: AppDeps, config: Config, tokens: TokenService) {
  const policy = otpPolicy(config);

  async function issue(tx: Transaction, userId: string, familyId?: string) {
    const { token, hash } = newRefreshToken(userId);
    await tx.insert(schema.refreshTokens).values({
      userId,
      familyId: familyId ?? crypto.randomUUID(),
      tokenHash: hash,
      expiresAt: new Date(deps.now().getTime() + config.JWT_REFRESH_TTL_SECONDS * 1000),
    });
    return { accessToken: await tokens.signAccess(userId), refreshToken: token };
  }

  async function assertActive(tx: Transaction, userId: string) {
    const [row] = rowsOf<{ s: string | null }>(
      await tx.execute(sql`select app.user_status(${userId}::uuid) s`),
    );
    if (row?.s === 'deactivated') {
      throw new AppError(
        'forbidden',
        'This account has been switched off. Ask your principal to switch it back on.',
      );
    }
  }

  async function signedIn(userId: string, familyId?: string): Promise<TokenPair> {
    return withRequestContext(deps.db, { userId, centreId: null, role: null }, async (tx) => {
      await assertActive(tx, userId);
      const pair = await issue(tx, userId, familyId);
      return {
        ...pair,
        expiresInSeconds: tokens.accessTtlSeconds,
        isNewUser: false,
        me: await loadMe(tx, userId),
      };
    });
  }

  const wrongPassword = () =>
    new AppError('unauthenticated', 'That username or password is wrong.');

  return {
    /**
     * Username and password sign-in for accounts an admin or principal created. Same token
     * pair as PIN sign-in. Unknown usernames cost the same time as wrong passwords.
     */
    async passwordSignIn(input: { username: string; password: string }, requestId: string) {
      const found = await withRequestContext(deps.db, ANONYMOUS, async (tx) =>
        rowsOf<{
          user_id: string;
          password_hash: string;
          locked_until: Date | string | null;
          status: string;
        }>(
          await tx.execute(
            sql`select user_id, password_hash, locked_until, status from app.auth_password_lookup(${input.username})`,
          ),
        ),
      );
      const user = found[0];
      if (!user) {
        await verifyPassword(input.password, await dummyPasswordHash());
        throw wrongPassword();
      }
      if (user.locked_until && new Date(user.locked_until) > deps.now()) {
        throw new AppError(
          'rate_limited',
          `Too many wrong tries. Try again in ${config.PASSWORD_LOCK_MINUTES} minutes, or ask your principal to reset your password.`,
        );
      }
      const ok = await verifyPassword(input.password, user.password_hash);
      const lockedUntil = await withRequestContext(deps.db, ANONYMOUS, async (tx) => {
        const [r] = rowsOf<{ l: Date | null }>(
          await tx.execute(
            sql`select app.auth_password_result(${user.user_id}::uuid, ${ok}, ${config.PASSWORD_MAX_FAILURES}, ${config.PASSWORD_LOCK_MINUTES}) l`,
          ),
        );
        if (!ok && r?.l) {
          await tx.insert(schema.auditLog).values({
            actorUserId: user.user_id,
            action: 'auth.locked',
            resourceType: 'user',
            resourceId: user.user_id,
            requestId,
            channel: 'web',
          });
        }
        return r?.l ?? null;
      });
      if (!ok) {
        if (lockedUntil) {
          throw new AppError(
            'rate_limited',
            `Too many wrong tries. Try again in ${config.PASSWORD_LOCK_MINUTES} minutes, or ask your principal to reset your password.`,
          );
        }
        throw wrongPassword();
      }
      return signedIn(user.user_id);
    },

    async changePassword(userId: string, input: { currentPassword: string; newPassword: string }) {
      const ctx = { userId, centreId: null, role: null };
      const username = await withRequestContext(deps.db, ctx, async (tx) => {
        const [u] = await tx
          .select({ username: schema.users.username })
          .from(schema.users)
          .where(eq(schema.users.id, userId));
        return u?.username ?? null;
      });
      if (!username) {
        throw new AppError(
          'bad_request',
          'This account signs in with a phone PIN, not a password.',
        );
      }
      const [row] = await withRequestContext(deps.db, ANONYMOUS, async (tx) =>
        rowsOf<{ password_hash: string }>(
          await tx.execute(sql`select password_hash from app.auth_password_lookup(${username})`),
        ),
      );
      if (!row || !(await verifyPassword(input.currentPassword, row.password_hash))) {
        throw new AppError('validation_failed', 'Your current password is wrong.', [
          { path: 'body.currentPassword', message: 'Your current password is wrong.' },
        ]);
      }
      if (input.currentPassword === input.newPassword) {
        throw new AppError('validation_failed', 'Choose a password you have not used here.', [
          { path: 'body.newPassword', message: 'Choose a password you have not used here.' },
        ]);
      }
      assertAcceptablePassword(input.newPassword, username);
      const hash = await hashPassword(input.newPassword);
      return withRequestContext(deps.db, ctx, async (tx) => {
        await tx.execute(sql`select app.change_own_password(${hash})`);
        return loadMe(tx, userId);
      });
    },

    async requestOtp(phoneInput: string) {
      const phone = requirePhone(phoneInput);
      const code = await withRequestContext(deps.db, ANONYMOUS, (tx) =>
        createChallenge(tx, policy, {
          phone,
          purpose: 'sign_in',
          channel: deps.otpSender.channel,
          now: deps.now(),
        }),
      );
      await deps.otpSender.send(phone, code, 'sign_in');
      return { expiresInSeconds: config.OTP_TTL_SECONDS, channel: deps.otpSender.channel };
    },

    async exchangeOtp(input: {
      phone: string;
      code: string;
      displayName?: string;
    }): Promise<TokenPair> {
      const phone = requirePhone(input.phone);
      // Own transaction so a failed attempt is counted even though we then throw.
      const ok = await withRequestContext(deps.db, ANONYMOUS, (tx) =>
        verifyChallenge(tx, policy, {
          phone,
          purpose: 'sign_in',
          code: input.code,
          now: deps.now(),
        }),
      );
      if (!ok)
        throw new AppError(
          'unauthenticated',
          'That PIN is wrong or has expired. Ask for a new one.',
        );

      const { userId, isNew } = await withRequestContext(deps.db, ANONYMOUS, async (tx) => {
        const row = rowsOf<{ user_id: string; is_new: boolean }>(
          await tx.execute(
            sql`select user_id, is_new from app.auth_upsert_user(${phone}, ${input.displayName ?? ''})`,
          ),
        )[0]!;
        await tx.execute(
          sql`select app.auth_link_guardians(${row.user_id}::uuid, ${deps.crypto.blindIndex(phone)})`,
        );
        return { userId: row.user_id, isNew: row.is_new };
      });

      return withRequestContext(deps.db, { userId, centreId: null, role: null }, async (tx) => {
        await assertActive(tx, userId);
        const pair = await issue(tx, userId);
        return {
          ...pair,
          expiresInSeconds: tokens.accessTtlSeconds,
          isNewUser: isNew,
          me: await loadMe(tx, userId),
        };
      });
    },

    /**
     * Rotate a refresh token. Presenting an already-rotated or revoked token means it was
     * copied: revoke the whole family so the thief and the victim both have to sign in again.
     */
    async refresh(refreshToken: string): Promise<TokenPair> {
      const parsed = parseRefreshToken(refreshToken);
      if (!parsed) throw new AppError('unauthenticated', 'Please sign in again.');
      const ctx = { userId: parsed.userId, centreId: null, role: null };
      const now = deps.now();

      const outcome = await withRequestContext(deps.db, ctx, async (tx) => {
        const [row] = await tx
          .select()
          .from(schema.refreshTokens)
          .where(eq(schema.refreshTokens.tokenHash, hashRefreshToken(refreshToken)));
        if (!row) return { kind: 'invalid' as const };
        if (row.rotatedAt || row.revokedAt) {
          await tx
            .update(schema.refreshTokens)
            .set({ revokedAt: now })
            .where(
              and(
                eq(schema.refreshTokens.familyId, row.familyId),
                isNull(schema.refreshTokens.revokedAt),
              ),
            );
          return { kind: 'reused' as const };
        }
        if (row.expiresAt <= now) return { kind: 'invalid' as const };
        await assertActive(tx, parsed.userId);
        await tx
          .update(schema.refreshTokens)
          .set({ rotatedAt: now })
          .where(eq(schema.refreshTokens.id, row.id));
        const pair = await issue(tx, parsed.userId, row.familyId);
        return {
          kind: 'ok' as const,
          pair: {
            ...pair,
            expiresInSeconds: tokens.accessTtlSeconds,
            isNewUser: false,
            me: await loadMe(tx, parsed.userId),
          },
        };
      });

      if (outcome.kind !== 'ok') throw new AppError('unauthenticated', 'Please sign in again.');
      return outcome.pair;
    },

    async signOut(refreshToken: string): Promise<void> {
      const parsed = parseRefreshToken(refreshToken);
      if (!parsed) return;
      await withRequestContext(
        deps.db,
        { userId: parsed.userId, centreId: null, role: null },
        async (tx) => {
          const [row] = await tx
            .select({ familyId: schema.refreshTokens.familyId })
            .from(schema.refreshTokens)
            .where(eq(schema.refreshTokens.tokenHash, hashRefreshToken(refreshToken)));
          if (row) {
            await tx
              .update(schema.refreshTokens)
              .set({ revokedAt: deps.now() })
              .where(
                and(
                  eq(schema.refreshTokens.familyId, row.familyId),
                  isNull(schema.refreshTokens.revokedAt),
                ),
              );
          }
        },
      );
    },
  };
}
