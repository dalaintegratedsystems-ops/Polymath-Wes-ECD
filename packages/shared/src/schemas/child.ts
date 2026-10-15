import { z } from 'zod';
import { BirthMonthSchema, UuidSchema } from './common';

/**
 * Child records are deliberately minimal (POPIA, CLAUDE.md §7):
 * pseudonymous id, first name, birth month, group. No surnames or ID numbers.
 */
export const ChildSchema = z
  .object({
    id: UuidSchema,
    centreId: UuidSchema,
    firstName: z.string().min(1).max(40),
    birthMonth: BirthMonthSchema,
    groupId: UuidSchema.nullable(),
    status: z.enum(['active', 'left']),
  })
  .meta({ id: 'Child' });
export type Child = z.infer<typeof ChildSchema>;

export const ChildIntakeCreateSchema = z
  .object({
    firstName: z.string().min(1).max(40),
    birthMonth: BirthMonthSchema,
    groupId: UuidSchema.optional(),
    guardian: z.object({
      displayName: z.string().min(1).max(60),
      phone: z.string(),
      relationship: z.enum(['mother', 'father', 'grandparent', 'aunt_uncle', 'guardian', 'other']),
    }),
  })
  .meta({ id: 'ChildIntakeCreate' });
