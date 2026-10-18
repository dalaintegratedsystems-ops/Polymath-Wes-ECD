import { and, eq, inArray, sql } from 'drizzle-orm';
import {
  ATTENDANCE_BACKFILL_DAYS,
  AppError,
  type AttendanceResult,
  type AttendanceStatus,
} from '@wes/shared';
import { schema, type Transaction } from '@wes/db';
import { rowsOf } from '../../platform/sql';
import { sastToday } from '../compliance/service';

/** Attendance, shared by the register API and Wes's record_attendance tool. */
const DAY_MS = 86_400_000;

export function assertRegisterDay(day: string, now: Date): void {
  const ageDays = (Date.parse(sastToday(now)) - Date.parse(day)) / DAY_MS;
  if (ageDays < 0) {
    throw new AppError('validation_failed', 'You cannot take the register for a future day.', [
      { path: 'body.day', message: 'Choose today or an earlier day' },
    ]);
  }
  if (ageDays > ATTENDANCE_BACKFILL_DAYS) {
    throw new AppError('validation_failed', 'That day is too long ago to change here.', [
      {
        path: 'body.day',
        message: `Only the last ${ATTENDANCE_BACKFILL_DAYS} days can be changed`,
      },
    ]);
  }
}

export async function refreshDailyCount(tx: Transaction, centreId: string, day: string) {
  const [row] = rowsOf<{ present: number; enrolled: number }>(
    await tx.execute(sql`
      select
        (select count(*)::int from attendance_records
          where centre_id = ${centreId}::uuid and day = ${day}::date and status = 'present') as present,
        (select count(*)::int from children
          where centre_id = ${centreId}::uuid and status = 'active') as enrolled`),
  );
  const present = Number(row?.present ?? 0);
  const enrolled = Number(row?.enrolled ?? 0);
  await tx
    .insert(schema.attendanceDailyCounts)
    .values({ centreId, day, presentCount: present, enrolledCount: enrolled })
    .onConflictDoUpdate({
      target: [schema.attendanceDailyCounts.centreId, schema.attendanceDailyCounts.day],
      set: { presentCount: present, enrolledCount: enrolled },
    });
  return { present, enrolled };
}

/** Save marks; the newest mark per child wins and older ones come back as conflicts. */
export async function recordMarks(
  tx: Transaction,
  input: {
    centreId: string;
    userId: string;
    day: string;
    marks: { childId: string; status: AttendanceStatus; clientUpdatedAt: string }[];
  },
): Promise<AttendanceResult> {
  const latest = new Map<string, (typeof input.marks)[number]>();
  for (const m of input.marks) {
    const prev = latest.get(m.childId);
    if (!prev || prev.clientUpdatedAt < m.clientUpdatedAt) latest.set(m.childId, m);
  }
  const ids = [...latest.keys()];
  const known = await tx
    .select({ id: schema.children.id })
    .from(schema.children)
    .where(
      and(
        eq(schema.children.centreId, input.centreId),
        eq(schema.children.status, 'active'),
        inArray(schema.children.id, ids),
      ),
    );
  if (known.length !== ids.length) {
    throw new AppError('validation_failed', 'Some children are not in this register.');
  }
  let applied = 0;
  const conflicts: AttendanceResult['conflicts'] = [];
  for (const m of latest.values()) {
    const rows = rowsOf<{ id: string }>(
      await tx.execute(sql`
        insert into attendance_records
          (centre_id, child_id, day, status, recorded_by_user_id, client_updated_at)
        values (${input.centreId}::uuid, ${m.childId}::uuid, ${input.day}::date, ${m.status},
                ${input.userId}::uuid, ${m.clientUpdatedAt}::timestamptz)
        on conflict (child_id, day) do update set
          status = excluded.status,
          recorded_by_user_id = excluded.recorded_by_user_id,
          client_updated_at = excluded.client_updated_at,
          updated_at = now()
        where attendance_records.client_updated_at < excluded.client_updated_at
        returning id`),
    );
    if (rows.length) {
      applied += 1;
      continue;
    }
    const [kept] = await tx
      .select({
        status: schema.attendanceRecords.status,
        at: schema.attendanceRecords.clientUpdatedAt,
      })
      .from(schema.attendanceRecords)
      .where(
        and(
          eq(schema.attendanceRecords.childId, m.childId),
          eq(schema.attendanceRecords.day, input.day),
        ),
      );
    if (kept && kept.at.toISOString() !== new Date(m.clientUpdatedAt).toISOString()) {
      conflicts.push({ childId: m.childId, kept: kept.status, keptAt: kept.at.toISOString() });
    } else {
      applied += 1; // the same mark sent twice
    }
  }
  const counts = await refreshDailyCount(tx, input.centreId, input.day);
  return {
    day: input.day,
    applied,
    conflicts,
    presentCount: counts.present,
    enrolledCount: counts.enrolled,
  };
}
