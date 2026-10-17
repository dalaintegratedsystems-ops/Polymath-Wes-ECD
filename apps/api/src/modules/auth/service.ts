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
  const [user] = await tx
    .select({
      id: schema.users.id,
      displayName: schema.users.displayName,
      locale: schema.users.locale,
    })
    .from(schema.users)
    .where(eq(schema.users.id, userId));
  if (!user) throw new AppError('unauthenticated', 'Please sign in again.');
  const list = rowsOf<{
    centre_id: string;
    centre_name: string;
    role: Me['memberships'][number]['role'];
  }>(await tx.execute(sql`select centre_id, centre_name, role from app.my_memberships()`));
  return {
    ...user,
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

  return {
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
