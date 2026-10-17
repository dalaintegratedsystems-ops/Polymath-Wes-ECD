import { z } from 'zod';
import { RoleSchema } from '../roles';
import { REGISTRATION_STATUSES } from './centre';
import { ProvinceSchema, SaPhoneSchema, UuidSchema } from './common';

// ---------- Username and password sign-in ----------

export const USERNAME_PATTERN = /^[a-z0-9][a-z0-9._]{2,31}$/;
export const PASSWORD_MIN_LENGTH = 10;

export const UsernameSchema = z
  .string()
  .trim()
  .toLowerCase()
  .regex(USERNAME_PATTERN, 'Use 3 to 32 letters, numbers, dots or underscores');

export const PasswordSignInSchema = z
  .object({ username: z.string().trim().min(3).max(32), password: z.string().min(1).max(200) })
  .meta({ id: 'PasswordSignIn' });

export const NewPasswordSchema = z
  .string()
  .min(PASSWORD_MIN_LENGTH, `Use at least ${PASSWORD_MIN_LENGTH} characters`)
  .max(200);

export const PasswordChangeSchema = z
  .object({ currentPassword: z.string().min(1).max(200), newPassword: NewPasswordSchema })
  .meta({ id: 'PasswordChange' });

// ---------- People management ----------

export const ManagedUserSchema = z
  .object({
    userId: UuidSchema,
    displayName: z.string(),
    username: z.string().nullable(),
    phoneMasked: z.string().nullable(),
    role: RoleSchema,
    centreId: UuidSchema,
    centreName: z.string(),
    status: z.enum(['active', 'deactivated']),
    lastSeenAt: z.iso.datetime({ offset: true }).nullable(),
    mustChangePassword: z.boolean(),
  })
  .meta({ id: 'ManagedUser' });
export type ManagedUser = z.infer<typeof ManagedUserSchema>;

export const ManagedUserListSchema = z
  .object({ items: z.array(ManagedUserSchema) })
  .meta({ id: 'ManagedUserList' });

export const ManagedUserCreateSchema = z
  .object({
    displayName: z.string().trim().min(1).max(60),
    centreId: UuidSchema,
    role: RoleSchema,
    /** At least one of username or phone. A username gets a one-time temporary password. */
    username: UsernameSchema.optional(),
    phone: z.string().min(9).max(20).optional(),
  })
  .refine((v) => v.username || v.phone, {
    message: 'Add a username, a phone number, or both',
    path: ['username'],
  })
  .meta({ id: 'ManagedUserCreate' });

export const ManagedUserCreatedSchema = z
  .object({
    userId: UuidSchema,
    /** Shown once to the person creating the account; never stored in plain text. */
    temporaryPassword: z.string().nullable(),
  })
  .meta({ id: 'ManagedUserCreated' });

export const TemporaryPasswordSchema = z
  .object({ temporaryPassword: z.string() })
  .meta({ id: 'TemporaryPassword' });

export const UserStatusUpdateSchema = z
  .object({ status: z.enum(['active', 'deactivated']) })
  .meta({ id: 'UserStatusUpdate' });

export const PhoneE164Schema = SaPhoneSchema;

// ---------- Dashboards ----------

const isoDate = z.iso.date();

export const DateRangeQuerySchema = z.object({
  from: isoDate.optional(),
  to: isoDate.optional(),
});

export const CentreDashboardSchema = z
  .object({
    from: isoDate,
    to: isoDate,
    registrationStatus: z.string(),
    childrenActive: z.number(),
    awaitingConsent: z.number(),
    consentsGranted: z.number(),
    staff: z.number(),
    parentsLinked: z.number(),
    wesQuestions: z.number(),
    wesHelpful: z.number(),
    wesNotHelpful: z.number(),
    attendanceRate: z.number().nullable(),
    weekly: z.array(
      z.object({
        weekStart: isoDate,
        wesQuestions: z.number(),
        childrenAdded: z.number(),
        attendanceRate: z.number().nullable(),
      }),
    ),
  })
  .meta({ id: 'CentreDashboard' });
export type CentreDashboard = z.infer<typeof CentreDashboardSchema>;

export const CENTRE_SIZES = ['small', 'medium', 'large'] as const;

export const PlatformFiltersSchema = DateRangeQuerySchema.extend({
  province: ProvinceSchema.optional(),
  city: z.string().trim().min(1).max(60).optional(),
  size: z.enum(CENTRE_SIZES).optional(),
  status: z.enum(REGISTRATION_STATUSES).optional(),
  role: RoleSchema.optional(),
});
export type PlatformFilters = z.infer<typeof PlatformFiltersSchema>;

const countBy = (label: string) =>
  z
    .array(z.object({ label: z.string().nullable(), count: z.number() }))
    .describe(`Counts by ${label}`);

export const PlatformMetricsSchema = z
  .object({
    from: isoDate,
    to: isoDate,
    centres: z.object({
      total: z.number(),
      new: z.number(),
      byProvince: countBy('province'),
      funnel: countBy('status'),
      childrenActive: z.number(),
    }),
    users: z.object({
      total: z.number(),
      new: z.number(),
      dau: z.number(),
      wau: z.number(),
      mau: z.number(),
      daily: z.array(z.object({ day: isoDate, active: z.number() })),
      retention: z.array(
        z.object({ cohort: z.string(), size: z.number(), month1: z.number(), month2: z.number() }),
      ),
    }),
    wes: z.object({
      questions: z.number(),
      costUsd: z.number(),
      tokens: z.number(),
      avgLatencyMs: z.number().nullable(),
      errors: z.number(),
      escalations: z.number(),
      topIntents: countBy('intent'),
      feedback: z.object({ up: z.number(), down: z.number(), reasons: countBy('reason') }),
    }),
  })
  .meta({ id: 'PlatformMetrics' });
export type PlatformMetrics = z.infer<typeof PlatformMetricsSchema>;

export const PlatformCentreSchema = z
  .object({
    centreId: UuidSchema,
    name: z.string(),
    province: z.string(),
    city: z.string(),
    registrationStatus: z.string(),
    /** Child counts under 5 are reported as null ("fewer than 5") to protect small centres. */
    children: z.number().nullable(),
    staff: z.number(),
    wesQuestions: z.number(),
    costUsd: z.number(),
    lastActive: isoDate.nullable(),
    createdAt: z.iso.datetime({ offset: true }),
  })
  .meta({ id: 'PlatformCentre' });
export type PlatformCentre = z.infer<typeof PlatformCentreSchema>;

export const PlatformCentreListSchema = z
  .object({ items: z.array(PlatformCentreSchema) })
  .meta({ id: 'PlatformCentreList' });
