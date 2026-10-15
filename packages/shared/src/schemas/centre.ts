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
