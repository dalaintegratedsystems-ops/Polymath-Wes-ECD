import type { FastifyInstance } from 'fastify';
import { and, asc, eq, gte, lte } from 'drizzle-orm';
import { z } from 'zod';
import {
  AttendanceBatchSchema,
  AttendanceDayQuerySchema,
  AttendanceDaySchema,
  AttendanceExportQuerySchema,
  AttendanceResultSchema,
  type AttendanceResult,
  type AttendanceStatus,
} from '@wes/shared';
import { schema, withRequestContext } from '@wes/db';
import { audit, centreContext, centreHeader, centreIdFromHeader } from '../../platform/context';
import type { AppDeps } from '../../platform/deps';
import { defineRoute } from '../../platform/route';
import { assertRegisterDay, recordMarks } from './service';

const CentreParams = z.object({ id: z.uuid() });
const DAY_MS = 86_400_000;
const LETTER: Record<AttendanceStatus, string> = { present: 'P', absent: 'A', excused: 'E' };

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
      assertRegisterDay(body.day, deps.now());
      return withRequestContext(deps.db, ctx, async (tx) => {
        const result = await recordMarks(tx, {
          centreId: params.id,
          userId: ctx.userId!,
          day: body.day,
          marks: body.marks,
        });
        await audit(tx, raw, ctx, {
          action: 'attendance.record',
          resourceType: 'attendance',
          resourceId: body.day,
          metadata: {
            marks: body.marks.length,
            applied: result.applied,
            conflicts: result.conflicts.length,
          },
        });
        return result;
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
