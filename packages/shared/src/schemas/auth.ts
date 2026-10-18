import { z } from 'zod';
import { RoleSchema } from '../roles';
import { UuidSchema } from './common';

export const OtpRequestSchema = z
  .object({
    /** Any common SA format; normalised to E.164 by the server. */
    phone: z.string().min(9).max(20),
    channel: z.enum(['whatsapp', 'sms']).default('whatsapp'),
  })
  .meta({ id: 'OtpRequest' });

export const OtpRequestedSchema = z
  .object({ expiresInSeconds: z.int(), channel: z.enum(['whatsapp', 'sms', 'console']) })
  .meta({ id: 'OtpRequested' });

export const TokenRequestSchema = z
  .object({
    phone: z.string().min(9).max(20),
    code: z.string().regex(/^\d{6}$/, 'Enter the 6-digit PIN'),
    /** Used only when this phone has no account yet. */
    displayName: z.string().trim().min(1).max(60).optional(),
  })
  .meta({ id: 'TokenRequest' });

export const RefreshRequestSchema = z
  .object({ refreshToken: z.string().min(20).max(200) })
  .meta({ id: 'RefreshRequest' });

export const MembershipSchema = z
  .object({ centreId: UuidSchema, centreName: z.string(), role: RoleSchema })
  .meta({ id: 'Membership' });
export type Membership = z.infer<typeof MembershipSchema>;

export const MeSchema = z
  .object({
    id: UuidSchema,
    displayName: z.string(),
    locale: z.enum(['en', 'af', 'xh', 'zu']),
    username: z.string().nullable(),
    /** API path of the profile photo, or null. */
    avatarUrl: z.string().nullable(),
    /** Accounts created by an admin must choose their own password first. */
    mustChangePassword: z.boolean(),
    isPlatformAdmin: z.boolean(),
    memberships: z.array(MembershipSchema),
  })
  .meta({ id: 'Me' });
export type Me = z.infer<typeof MeSchema>;

/** Strict: unknown fields are refused, never silently dropped (no mass assignment). */
export const MeUpdateSchema = z
  .strictObject({
    displayName: z.string().trim().min(1).max(60).optional(),
    locale: z.enum(['en', 'af', 'xh', 'zu']).optional(),
  })
  .meta({ id: 'MeUpdate' });

export const TokenPairSchema = z
  .object({
    accessToken: z.string(),
    refreshToken: z.string(),
    expiresInSeconds: z.int(),
    isNewUser: z.boolean(),
    me: MeSchema,
  })
  .meta({ id: 'TokenPair' });
export type TokenPair = z.infer<typeof TokenPairSchema>;
