import { z } from 'zod';
import { UuidSchema } from './common';

/**
 * Weekly planner, activities and printables.
 *
 * ELDA names are the six Early Learning and Development Areas of the National Curriculum
 * Framework for children birth to four. TODO(content): link each to its official description
 * and page once the curated NCF corpus is loaded; until then plans show the tags as suggestions
 * and carry no curriculum claims or citations.
 */
export const ELDAS = [
  { code: 'wellbeing', label: 'Well-being' },
  { code: 'identity', label: 'Identity and belonging' },
  { code: 'communicating', label: 'Communicating' },
  { code: 'maths', label: 'Exploring mathematics' },
  { code: 'creativity', label: 'Creativity' },
  { code: 'world', label: 'Knowledge and understanding of the world' },
] as const;
export const ELDA_CODES = ELDAS.map((e) => e.code) as [
  (typeof ELDAS)[number]['code'],
  ...(typeof ELDAS)[number]['code'][],
];
export type EldaCode = (typeof ELDAS)[number]['code'];
export const eldaLabel = (code: string) => ELDAS.find((e) => e.code === code)?.label ?? code;

export const AGE_GROUPS = [
  { code: 'babies', label: 'Babies (0 to 18 months)', minMonths: 0, maxMonths: 18 },
  { code: 'toddlers', label: 'Toddlers (18 months to 3 years)', minMonths: 18, maxMonths: 36 },
  { code: 'preschool', label: '3 to 5 years', minMonths: 36, maxMonths: 60 },
] as const;
export type AgeGroup = (typeof AGE_GROUPS)[number]['code'];
const AgeGroupSchema = z.enum(['babies', 'toddlers', 'preschool']);

export const WEEKDAYS = ['mon', 'tue', 'wed', 'thu', 'fri'] as const;
const WeekdaySchema = z.enum(WEEKDAYS);

const isoDate = z.iso.date();

export const PlanActivitySchema = z
  .object({
    id: z.string().max(40),
    /** Part of the day, e.g. "Morning ring". */
    slot: z.string().max(40),
    title: z.string().max(120),
    durationMinutes: z.int().min(5).max(90),
    ageGroups: z.array(AgeGroupSchema).min(1),
    eldas: z.array(z.enum(ELDA_CODES)).min(1).max(3),
    /** Free or recycled materials. */
    materials: z.array(z.string().max(80)).max(8),
    steps: z.array(z.string().max(300)).min(1).max(8),
    /** Optional printable that supports the activity. */
    printable: z.enum(['flashcards', 'tracing', 'counting']).nullable(),
  })
  .meta({ id: 'PlanActivity' });
export type PlanActivity = z.infer<typeof PlanActivitySchema>;

export const PlanDaySchema = z.object({
  day: WeekdaySchema,
  activities: z.array(PlanActivitySchema).min(1).max(5),
});

export const PlanBodySchema = z.object({
  days: z.array(PlanDaySchema).length(5),
  /** Words for flashcards and tracing sheets that match the theme. */
  themeWords: z.array(z.string().max(14)).max(12),
});
export type PlanBody = z.infer<typeof PlanBodySchema>;

export const PlanCitationSchema = z.object({
  n: z.int(),
  source: z.string(),
  where: z.string(),
});

export const WeeklyPlanSchema = z
  .object({
    id: UuidSchema,
    theme: z.string(),
    weekStarting: isoDate,
    ageGroups: z.array(AgeGroupSchema),
    status: z.enum(['draft', 'approved', 'archived']),
    /** 'wes' when Claude drafted it, 'library' when it came from the built-in activity ideas. */
    source: z.enum(['wes', 'library']),
    body: PlanBodySchema,
    citations: z.array(PlanCitationSchema),
    createdAt: z.iso.datetime({ offset: true }),
  })
  .meta({ id: 'WeeklyPlan' });
export type WeeklyPlan = z.infer<typeof WeeklyPlanSchema>;

export const PlanRequestSchema = z
  .object({
    theme: z
      .string()
      .trim()
      .min(2)
      .max(60)
      .regex(/^[\p{L}\p{N} ,.'&-]+$/u, 'Use letters, numbers and simple punctuation'),
    ageGroups: z.array(AgeGroupSchema).min(1).max(3),
    weekStarting: isoDate,
  })
  .meta({ id: 'PlanRequest' });

export const ADAPT_TARGETS = ['younger', 'older', 'outdoor', 'fewer_materials'] as const;
export type AdaptTarget = (typeof ADAPT_TARGETS)[number];

export const AdaptRequestSchema = z
  .object({
    planId: UuidSchema,
    activityId: z.string().max(40),
    target: z.enum(ADAPT_TARGETS),
  })
  .meta({ id: 'AdaptRequest' });

export const AdaptedActivitySchema = z
  .object({
    title: z.string(),
    steps: z.array(z.string()),
    materials: z.array(z.string()),
    note: z.string(),
  })
  .meta({ id: 'AdaptedActivity' });
export type AdaptedActivity = z.infer<typeof AdaptedActivitySchema>;

export const PRINTABLE_KINDS = ['flashcards', 'tracing', 'counting'] as const;
export type PrintableKind = (typeof PRINTABLE_KINDS)[number];

export const PrintableRequestSchema = z
  .object({
    kind: z.enum(PRINTABLE_KINDS),
    title: z.string().trim().min(2).max(60),
    /** Words for flashcards and tracing (letters only, up to 14 characters). */
    words: z
      .array(
        z
          .string()
          .trim()
          .min(1)
          .max(14)
          .regex(/^[\p{L} '-]+$/u, 'Use letters only'),
      )
      .max(12)
      .default([]),
    /** Highest number for counting sheets. */
    upTo: z.int().min(1).max(10).default(5),
  })
  .refine((p) => p.kind === 'counting' || p.words.length > 0, {
    message: 'Add at least one word',
    path: ['words'],
  })
  .meta({ id: 'PrintableRequest' });
export type PrintableRequest = z.infer<typeof PrintableRequestSchema>;
