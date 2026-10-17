import { z } from 'zod';
import { LocaleSchema, ProvinceSchema, UuidSchema } from './common';

export const REGISTRATION_STATUSES = [
  'not_started',
  'in_progress',
  'submitted',
  'conditionally_registered',
  'registered',
] as const;

export const CentreSchema = z
  .object({
    id: UuidSchema,
    name: z.string().min(2).max(120),
    addressLine: z.string().max(200),
    suburb: z.string().max(80),
    city: z.string().max(80),
    province: ProvinceSchema,
    agesServedMinMonths: z.int().min(0).max(72),
    agesServedMaxMonths: z.int().min(0).max(72),
    childCount: z.int().min(0).max(500),
    registrationStatus: z.enum(REGISTRATION_STATUSES),
    defaultLocale: LocaleSchema,
  })
  .meta({ id: 'Centre' });
export type Centre = z.infer<typeof CentreSchema>;

export const CentreUpdateSchema = CentreSchema.omit({ id: true }).partial().meta({
  id: 'CentreUpdate',
});

/** Onboarding: the signed-in user creates their centre and becomes its principal. */
export const CentreCreateSchema = CentreSchema.omit({
  id: true,
  registrationStatus: true,
  defaultLocale: true,
})
  .extend({ addressLine: z.string().max(200).default('') })
  .refine((c) => c.agesServedMinMonths <= c.agesServedMaxMonths, {
    message: 'The youngest age must be less than the oldest age',
    path: ['agesServedMaxMonths'],
  })
  .meta({ id: 'CentreCreate' });

export const StaffMemberSchema = z
  .object({
    userId: z.uuid(),
    displayName: z.string(),
    role: z.enum(['principal', 'practitioner']),
  })
  .meta({ id: 'StaffMember' });
