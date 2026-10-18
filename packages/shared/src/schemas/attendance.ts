import { z } from 'zod';
import { MonthSchema, UuidSchema } from './common';

/**
 * Daily attendance. Marks are made offline on a phone and synced later, so every mark carries
 * the time it was made on the device; the newest mark wins (ADR-0005) and older ones come
 * back as conflicts the practitioner can see.
 */
export const ATTENDANCE_STATUSES = ['present', 'absent', 'excused'] as const;
export type AttendanceStatus = (typeof ATTENDANCE_STATUSES)[number];

const isoDate = z.iso.date();

export const AttendanceMarkSchema = z.object({
  childId: UuidSchema,
  status: z.enum(ATTENDANCE_STATUSES),
  clientUpdatedAt: z.iso.datetime({ offset: true }),
});

export const AttendanceBatchSchema = z
  .object({ day: isoDate, marks: z.array(AttendanceMarkSchema).min(1).max(200) })
  .meta({ id: 'AttendanceBatch' });
export type AttendanceBatch = z.infer<typeof AttendanceBatchSchema>;

export const AttendanceResultSchema = z
  .object({
    day: isoDate,
    applied: z.int(),
    /** Marks older than what the server already has: the newer mark was kept. */
    conflicts: z.array(
      z.object({
        childId: UuidSchema,
        kept: z.enum(ATTENDANCE_STATUSES),
        keptAt: z.iso.datetime({ offset: true }),
      }),
    ),
    presentCount: z.int(),
    enrolledCount: z.int(),
  })
  .meta({ id: 'AttendanceResult' });
export type AttendanceResult = z.infer<typeof AttendanceResultSchema>;

export const AttendanceDaySchema = z
  .object({
    day: isoDate,
    marks: z.array(z.object({ childId: UuidSchema, status: z.enum(ATTENDANCE_STATUSES) })),
  })
  .meta({ id: 'AttendanceDay' });
export type AttendanceDay = z.infer<typeof AttendanceDaySchema>;

export const AttendanceDayQuerySchema = z.object({ day: isoDate });
export const AttendanceExportQuerySchema = z.object({ month: MonthSchema });

/** How far back a register may be filled in (catching up after a week offline). */
export const ATTENDANCE_BACKFILL_DAYS = 31;
