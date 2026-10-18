import type { FastifyInstance } from 'fastify';
import { createFieldCrypto, seed } from '@wes/db';
import { createTestDb, type TestDb } from '@wes/db/testing';
import { buildApp, type BuildOptions } from '../src/app';
import { createAgentServices } from '../src/platform/agent';
import { createMemoryBlobStore } from '../src/platform/blob';
import { createMemoryOtpSender } from '../src/platform/deps';

export const TEST_CONFIG = {
  NODE_ENV: 'test' as const,
  APP_VERSION: '0.0.0-test',
  RATE_LIMIT_PER_MINUTE: 10_000,
  OTP_RATE_LIMIT_PER_MINUTE: 10_000,
  PASSWORD_RATE_LIMIT_PER_MINUTE: 10_000,
  OTP_MAX_PER_WINDOW: 50,
};

export interface Harness {
  app: FastifyInstance;
  db: TestDb;
  otp: ReturnType<typeof createMemoryOtpSender>;
  clock: { now: Date };
  crypto: ReturnType<typeof createFieldCrypto>;
  close(): Promise<void>;
}

/** A real app on a real (migrated, seeded) database, exactly as production wires it. */
export async function createHarness(
  options: { seed?: boolean; register?: BuildOptions['register'] } = {},
): Promise<Harness> {
  const db = await createTestDb();
  const crypto = createFieldCrypto();
  const clock = { now: new Date('2026-10-15T08:00:00Z') };
  if (options.seed !== false) await seed(db.db, crypto, { today: clock.now });
  const otp = createMemoryOtpSender();
  const app = await buildApp({
    logger: false,
    config: TEST_CONFIG,
    deps: {
      db: db.appDb,
      crypto,
      otpSender: otp,
      blobs: createMemoryBlobStore(),
      agent: createAgentServices({ NODE_ENV: 'test' }, () => clock.now),
      now: () => clock.now,
    },
    register: options.register,
  });
  return {
    app,
    db,
    otp,
    clock,
    crypto,
    close: async () => {
      await app.close();
      await db.close();
    },
  };
}

let keyCounter = 0;
export const idem = () => ({ 'idempotency-key': `test-key-${Date.now()}-${++keyCounter}` });

/** Sign in through the real OTP flow and return the token pair. */
export async function signIn(h: Harness, phone: string, displayName?: string) {
  const sent = await h.app.inject({ method: 'POST', url: '/v1/auth/otp', payload: { phone } });
  if (sent.statusCode !== 202) throw new Error(`OTP request failed: ${sent.body}`);
  const e164 = phone.startsWith('+')
    ? phone.replace(/\s/g, '')
    : `+27${phone.replace(/\D/g, '').slice(1)}`;
  const code = h.otp.last(e164)!;
  const res = await h.app.inject({
    method: 'POST',
    url: '/v1/auth/token',
    payload: { phone, code, ...(displayName ? { displayName } : {}) },
  });
  if (res.statusCode !== 200) throw new Error(`Sign-in failed: ${res.body}`);
  return res.json() as {
    accessToken: string;
    refreshToken: string;
    isNewUser: boolean;
    me: {
      id: string;
      displayName: string;
      memberships: { centreId: string; role: string; centreName: string }[];
    };
  };
}

export const bearer = (token: string) => ({ authorization: `Bearer ${token}` });
