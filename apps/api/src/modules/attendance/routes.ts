import type { FastifyInstance } from 'fastify';
import { and, asc, eq, gte, inArray, lte, sql } from 'drizzle-orm';
import { z } from 'zod';
import {
  ATTENDANCE_BACKFILL_DAYS,
  AppError,
  AttendanceBatchSchema,
  AttendanceDayQuerySchema,
  AttendanceDaySchema,
  AttendanceExportQuerySchema,
  AttendanceResultSchema,
  type AttendanceResult,
  type AttendanceStatus,
} from '@wes/shared';
import { schema, withRequestContext, type Transaction } from '@wes/db';
import { audit, centreContext, centreHeader, centreIdFromHeader } from '../../platform/context';
import type { AppDeps } from '../../platform/deps';
import { defineRoute } from '../../platform/route';
import { rowsOf } from '../../platform/sql';
import { sastToday } from '../compliance/service';

const CentreParams = z.object({ id: z.uuid() });
const DAY_MS = 86_400_000;
const LETTER: Record<AttendanceStatus, string> = { present: 'P', absent: 'A', excused: 'E' };

async function refreshDailyCount(tx: Transaction, centreId: string, day: string) {
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

const csvCell = (v: unknown) => {
  const s = v === null || v === undefined ? '' : String(v);
  const safe = /^[=+\-@\t\r]/.test(s) ? `'${s}` : s;
  return /[",\n]/.test(safe) ? `"${safe.replace(/"/g, '""')}"` : safe;
};

/** Weekdays of a month, as ISO dates. */
function weekdaysOf(month: string): string[] {
  const [y, m] = month.split('-').map(Number) as [number, number];
  const days: string[] = [];
  for (
    let d = new Date(Date.UTC(y, m - 1, 1));
    d.getUTCMonth() === m - 1;
    d = new Date(d.getTime() + DAY_MS)
  ) {
    const dow = d.getUTCDay();
    if (dow !== 0 && dow !== 6) days.push(d.toISOString().slice(0, 10));
  }
  return days;
}

export async function attendanceRoutes(app: FastifyInstance, opts: { deps: AppDeps }) {
  const { deps } = opts;

  defineRoute(
    app,
    {
      method: 'POST',
      url: '/v1/centres/:id/attendance',
      operationId: 'recordAttendance',
      summary: 'Save the register for a day (works after being offline: the newest mark wins)',
      tags: ['attendance'],
      auth: 'user',
      idempotent: true,
      params: CentreParams,
      body: AttendanceBatchSchema,
      responses: { 200: { description: 'Saved', schema: AttendanceResultSchema } },
    },
    async ({ params, body, raw }): Promise<AttendanceResult> => {
      const ctx = await centreContext(deps, raw, params.id, 'attendance:write');
      const today = sastToday(deps.now());
      const ageDays = (Date.parse(today) - Date.parse(body.day)) / DAY_MS;
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
      // The newest mark per child in this batch.
      const latest = new Map<string, (typeof body.marks)[number]>();
      for (const m of body.marks) {
        const prev = latest.get(m.childId);
        if (!prev || prev.clientUpdatedAt < m.clientUpdatedAt) latest.set(m.childId, m);
      }
      return withRequestContext(deps.db, ctx, async (tx) => {
        const ids = [...latest.keys()];
        const known = await tx
          .select({ id: schema.children.id })
          .from(schema.children)
          .where(
            and(
              eq(schema.children.centreId, params.id),
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
              values (${params.id}::uuid, ${m.childId}::uuid, ${body.day}::date, ${m.status},
                      ${ctx.userId}::uuid, ${m.clientUpdatedAt}::timestamptz)
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
          } else {
            const [kept] = await tx
              .select({
                status: schema.attendanceRecords.status,
                at: schema.attendanceRecords.clientUpdatedAt,
              })
              .from(schema.attendanceRecords)
              .where(
                and(
                  eq(schema.attendanceRecords.childId, m.childId),
                  eq(schema.attendanceRecords.day, body.day),
                ),
              );
            if (kept && kept.at.toISOString() !== new Date(m.clientUpdatedAt).toISOString()) {
              conflicts.push({
                childId: m.childId,
                kept: kept.status,
                keptAt: kept.at.toISOString(),
              });
            } else {
              applied += 1; // the same mark sent twice
            }
          }
        }
        const counts = await refreshDailyCount(tx, params.id, body.day);
        await audit(tx, raw, ctx, {
          action: 'attendance.record',
          resourceType: 'attendance',
          resourceId: body.day,
          metadata: { marks: latest.size, applied, conflicts: conflicts.length },
        });
        return {
          day: body.day,
          applied,
          conflicts,
          presentCount: counts.present,
          enrolledCount: counts.enrolled,
        };
      });
    },
  );

  defineRoute(
    app,
    {
      method: 'GET',
      url: '/v1/centres/:id/attendance',
      operationId: 'getAttendanceDay',
      summary: 'The register for a day',
      tags: ['attendance'],
      auth: 'user',
      params: CentreParams,
      query: AttendanceDayQuerySchema,
      responses: { 200: { description: 'Marks', schema: AttendanceDaySchema } },
    },
    async ({ params, query, raw }) => {
      const ctx = await centreContext(deps, raw, params.id, 'attendance:write');
      return withRequestContext(deps.db, ctx, async (tx) => {
        const marks = await tx
          .select({
            childId: schema.attendanceRecords.childId,
            status: schema.attendanceRecords.status,
          })
          .from(schema.attendanceRecords)
          .where(
            and(
              eq(schema.attendanceRecords.centreId, params.id),
              eq(schema.attendanceRecords.day, query.day),
            ),
          );
        await audit(tx, raw, ctx, {
          action: 'attendance.read',
          resourceType: 'attendance',
          resourceId: query.day,
        });
        return { day: query.day, marks };
      });
    },
  );

  defineRoute(
    app,
    {
      method: 'GET',
      url: '/v1/attendance/export',
      operationId: 'exportAttendance',
      summary: 'Monthly register as CSV (one row per child, P, A or E per weekday, daily totals)',
      tags: ['attendance'],
      auth: 'user',
      headers: centreHeader,
      query: AttendanceExportQuerySchema,
      responses: { 200: { description: 'CSV file (text/csv)' } },
    },
    async ({ query, raw }, reply) => {
      const ctx = await centreContext(deps, raw, centreIdFromHeader(raw), 'attendance:export');
      const days = weekdaysOf(query.month);
      const first = days[0]!;
      const last = days.at(-1)!;
      const csv = await withRequestContext(deps.db, ctx, async (tx) => {
        const [centre] = await tx
          .select({ name: schema.centres.name })
          .from(schema.centres)
          .where(eq(schema.centres.id, ctx.centreId!));
        const records = await tx
          .select({
            childId: schema.attendanceRecords.childId,
            day: schema.attendanceRecords.day,
            status: schema.attendanceRecords.status,
          })
          .from(schema.attendanceRecords)
          .where(
            and(
              eq(schema.attendanceRecords.centreId, ctx.centreId!),
              gte(schema.attendanceRecords.day, first),
              lte(schema.attendanceRecords.day, last),
            ),
          );
        const childIds = new Set(records.map((r) => r.childId));
        const kids = (
          await tx
            .select({
              id: schema.children.id,
              firstName: schema.children.firstName,
              birthMonth: schema.children.birthMonth,
              status: schema.children.status,
              group: schema.groups.name,
            })
            .from(schema.children)
            .leftJoin(schema.groups, eq(schema.groups.id, schema.children.groupId))
            .where(eq(schema.children.centreId, ctx.centreId!))
            .orderBy(asc(schema.children.firstName))
        ).filter((c) => c.status === 'active' || childIds.has(c.id));
        const counts = await tx
          .select()
          .from(schema.attendanceDailyCounts)
          .where(
            and(
              eq(schema.attendanceDailyCounts.centreId, ctx.centreId!),
              gte(schema.attendanceDailyCounts.day, first),
              lte(schema.attendanceDailyCounts.day, last),
            ),
          );
        await audit(tx, raw, ctx, {
          action: 'attendance.export',
          resourceType: 'attendance',
          resourceId: query.month,
          metadata: { children: kids.length },
        });

        const mark = new Map(records.map((r) => [`${r.childId}:${r.day}`, r.status]));
        const label = (d: string) =>
          new Date(`${d}T12:00:00Z`).toLocaleDateString('en-ZA', {
            weekday: 'short',
            day: '2-digit',
          });
        const lines: string[] = [];
        lines.push(
          [csvCell(centre?.name ?? 'Centre'), csvCell(`Register for ${query.month}`)].join(','),
        );
        lines.push(
          csvCell(
            'P = present, A = absent, E = excused. Check this against your subsidy claim form before you submit it.',
          ),
        );
        lines.push(
          ['First name', 'Birth month', 'Group', ...days.map(label), 'Days present']
            .map(csvCell)
            .join(','),
        );
        for (const k of kids) {
          const cells = days.map((d) => {
            const s = mark.get(`${k.id}:${d}`);
            return s ? LETTER[s] : '';
          });
          lines.push(
            [
              k.firstName,
              k.birthMonth,
              k.group ?? '',
              ...cells,
              cells.filter((c) => c === 'P').length,
            ]
              .map(csvCell)
              .join(','),
          );
        }
        const countOf = new Map(counts.map((c) => [c.day, c]));
        lines.push(
          ['Children present', '', '', ...days.map((d) => countOf.get(d)?.presentCount ?? ''), '']
            .map(csvCell)
            .join(','),
        );
        lines.push(
          ['Children enrolled', '', '', ...days.map((d) => countOf.get(d)?.enrolledCount ?? ''), '']
            .map(csvCell)
            .join(','),
        );
        return lines.join('\n') + '\n';
      });
      return reply
        .header('content-type', 'text/csv; charset=utf-8')
        .header('content-disposition', `attachment; filename="register-${query.month}.csv"`)
        .header('cache-control', 'private, no-store')
        .send(csv);
    },
  );
}
