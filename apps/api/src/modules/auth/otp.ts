import { createHmac, randomInt, timingSafeEqual } from 'node:crypto';
import { and, desc, eq, gt, isNull, sql } from 'drizzle-orm';
import { AppError } from '@wes/shared';
import { schema, type Transaction } from '@wes/db';

export type OtpPurpose = 'sign_in' | 'consent';

export interface OtpPolicy {
  pepper: string;
  ttlSeconds: number;
  maxAttempts: number;
  maxPerWindow: number;
}

export function generateCode(): string {
  return randomInt(0, 1_000_000).toString().padStart(6, '0');
}

export function hashCode(pepper: string, purpose: OtpPurpose, phone: string, code: string): string {
  return createHmac('sha256', pepper).update(`${purpose}:${phone}:${code}`).digest('hex');
}

/** Create a challenge, enforcing a per-phone limit. Returns the plain code for delivery. */
export async function createChallenge(
  tx: Transaction,
  policy: OtpPolicy,
  args: {
    phone: string;
    purpose: OtpPurpose;
    subjectId?: string;
    channel: 'whatsapp' | 'sms' | 'console';
    now: Date;
  },
): Promise<string> {
  const windowStart = new Date(args.now.getTime() - 15 * 60_000);
  const [recent] = await tx
    .select({ n: sql<number>`count(*)::int` })
    .from(schema.otpChallenges)
    .where(
      and(
        eq(schema.otpChallenges.phoneE164, args.phone),
        eq(schema.otpChallenges.purpose, args.purpose),
        gt(schema.otpChallenges.createdAt, windowStart),
      ),
    );
  if ((recent?.n ?? 0) >= policy.maxPerWindow) {
    throw new AppError(
      'rate_limited',
      'Too many PINs requested. Please wait 15 minutes and try again.',
    );
  }

  // Only the newest PIN works: requesting another cancels any still open.
  await tx
    .update(schema.otpChallenges)
    .set({ consumedAt: args.now })
    .where(
      and(
        eq(schema.otpChallenges.phoneE164, args.phone),
        eq(schema.otpChallenges.purpose, args.purpose),
        isNull(schema.otpChallenges.consumedAt),
      ),
    );

  const code = generateCode();
  await tx.insert(schema.otpChallenges).values({
    phoneE164: args.phone,
    codeHash: hashCode(policy.pepper, args.purpose, args.phone, code),
    channel: args.channel,
    purpose: args.purpose,
    subjectId: args.subjectId ?? null,
    expiresAt: new Date(args.now.getTime() + policy.ttlSeconds * 1000),
    createdAt: args.now,
  });
  return code;
}

/**
 * Check a code against the newest open challenge. Wrong codes count as attempts; after
 * `maxAttempts` the challenge is burnt. Errors are deliberately vague.
 *
 * The attempt counter must survive even when the caller's transaction later fails, so callers
 * run this in its own transaction and act on the boolean.
 */
export async function verifyChallenge(
  tx: Transaction,
  policy: OtpPolicy,
  args: { phone: string; purpose: OtpPurpose; code: string; subjectId?: string; now: Date },
): Promise<boolean> {
  const conditions = [
    eq(schema.otpChallenges.phoneE164, args.phone),
    eq(schema.otpChallenges.purpose, args.purpose),
    isNull(schema.otpChallenges.consumedAt),
    gt(schema.otpChallenges.expiresAt, args.now),
  ];
  if (args.subjectId) conditions.push(eq(schema.otpChallenges.subjectId, args.subjectId));

  const [challenge] = await tx
    .select()
    .from(schema.otpChallenges)
    .where(and(...conditions))
    .orderBy(desc(schema.otpChallenges.createdAt))
    .limit(1);
  if (!challenge || challenge.attempts >= policy.maxAttempts) return false;

  const expected = Buffer.from(challenge.codeHash, 'hex');
  const actual = Buffer.from(hashCode(policy.pepper, args.purpose, args.phone, args.code), 'hex');
  const ok = expected.length === actual.length && timingSafeEqual(expected, actual);

  await tx
    .update(schema.otpChallenges)
    .set(ok ? { consumedAt: args.now } : { attempts: challenge.attempts + 1 })
    .where(eq(schema.otpChallenges.id, challenge.id));
  return ok;
}

/** "+27 82 *** **67" — enough for a person to recognise their number. */
export function maskPhone(e164: string): string {
  return `${e164.slice(0, 3)} ${e164.slice(3, 5)} *** **${e164.slice(-2)}`;
}
