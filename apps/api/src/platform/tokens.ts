import { createHash, randomBytes } from 'node:crypto';
import { SignJWT, jwtVerify } from 'jose';
import { AppError } from '@wes/shared';

const ISSUER = 'wes-api';
const AUDIENCE = 'wes';

export interface AccessClaims {
  userId: string;
}

export function createTokenService(opts: {
  secret: string;
  accessTtlSeconds: number;
  now: () => Date;
}) {
  const key = new TextEncoder().encode(opts.secret);

  return {
    accessTtlSeconds: opts.accessTtlSeconds,

    async signAccess(userId: string): Promise<string> {
      const iat = Math.floor(opts.now().getTime() / 1000);
      return new SignJWT({ typ: 'access' })
        .setProtectedHeader({ alg: 'HS256' })
        .setSubject(userId)
        .setIssuer(ISSUER)
        .setAudience(AUDIENCE)
        .setIssuedAt(iat)
        .setExpirationTime(iat + opts.accessTtlSeconds)
        .sign(key);
    },

    async verifyAccess(token: string): Promise<AccessClaims> {
      try {
        const { payload } = await jwtVerify(token, key, {
          issuer: ISSUER,
          audience: AUDIENCE,
          algorithms: ['HS256'],
          currentDate: opts.now(),
        });
        if (payload.typ !== 'access' || typeof payload.sub !== 'string')
          throw new Error('wrong token type');
        return { userId: payload.sub };
      } catch {
        throw new AppError('unauthenticated', 'Your session has expired. Please sign in again.');
      }
    },
  };
}

export type TokenService = ReturnType<typeof createTokenService>;

/**
 * Refresh tokens are `<userId>.<256 random bits>`. The user id prefix lets us look the token
 * up under that user's RLS context; only the SHA-256 hash is stored.
 */
export function newRefreshToken(userId: string): { token: string; hash: string } {
  const token = `${userId}.${randomBytes(32).toString('base64url')}`;
  return { token, hash: hashRefreshToken(token) };
}

export function hashRefreshToken(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}

export function parseRefreshToken(token: string): { userId: string } | null {
  const m = token.match(/^([0-9a-f-]{36})\.[A-Za-z0-9_-]{43}$/);
  return m ? { userId: m[1]! } : null;
}
