import type { FastifyInstance } from 'fastify';
import { sql } from 'drizzle-orm';
import { z } from 'zod';
import {
  AppError,
  CentreDashboardSchema,
  DateRangeQuerySchema,
  PlatformCentreListSchema,
  PlatformFiltersSchema,
  PlatformMetricsSchema,
  type PlatformCentre,
  type PlatformFilters,
} from '@wes/shared';
import { withRequestContext, type Transaction } from '@wes/db';
import { centreContext, userContext } from '../../platform/context';
import type { AppDeps } from '../../platform/deps';
import { defineRoute } from '../../platform/route';
import { rowsOf } from '../../platform/sql';

const CentreParams = z.object({ id: z.uuid() });
const DAY_MS = 86_400_000;
const MAX_RANGE_DAYS = 366;
/** Child counts below this are reported as "fewer than 5" so small centres stay anonymous. */
const SMALL_NUMBER = 5;

/** Default to the last 28 days; refuse ranges that are back to front or longer than a year. */
export function resolveRange(now: Date, q: { from?: string; to?: string }) {
  const to = q.to ?? now.toISOString().slice(0, 10);
  const from = q.from ?? new Date(Date.parse(to) - 27 * DAY_MS).toISOString().slice(0, 10);
  const days = (Date.parse(to) - Date.parse(from)) / DAY_MS;
  if (days < 0) {
    throw new AppError('validation_failed', 'The start date must be before the end date.', [
      { path: 'query.from', message: 'The start date must be before the end date.' },
    ]);
  }
  if (days > MAX_RANGE_DAYS) {
    throw new AppError('validation_failed', 'Choose a range of a year or less.', [
      { path: 'query.from', message: 'Choose a range of a year or less.' },
    ]);
  }
  return { from, to, weeks: Math.min(26, Math.max(4, Math.ceil((days + 1) / 7))) };
}

/** Postgres returns bigint counts as strings inside jsonb only for numerics; normalise anyway. */
function numbers<T>(value: T): T {
  return JSON.parse(JSON.stringify(value), (_k, v) =>
    typeof v === 'string' && /^-?\d+(\.\d+)?$/.test(v) && v.length < 16 ? Number(v) : v,
  ) as T;
}

interface CentreRow {
  centre_id: string;
  name: string;
  province: string;
  city: string;
  registration_status: string;
  children: string | number;
  staff: string | number;
  wes_questions: string | number;
  cost_usd: string | number;
  last_active: string | Date | null;
  created_at: string | Date;
}

function filterArgs(f: PlatformFilters) {
  return [f.province ?? null, f.city ?? null, f.size ?? null, f.status ?? null] as const;
}

async function platformCentres(
  tx: Transaction,
  range: { from: string; to: string },
  f: PlatformFilters,
  limit: number,
): Promise<PlatformCentre[]> {
  const [province, city, size, status] = filterArgs(f);
  const rows = rowsOf<CentreRow>(
    await tx.execute(
      sql`select * from app.platform_centres(${range.from}::date, ${range.to}::date, ${province}, ${city}, ${size}, ${status}, ${limit})`,
    ),
  );
  return rows.map((r) => {
    const children = Number(r.children);
    return {
      centreId: r.centre_id,
      name: r.name,
      province: r.province,
      city: r.city,
      registrationStatus: r.registration_status,
      children: children < SMALL_NUMBER ? null : children,
      staff: Number(r.staff),
      wesQuestions: Number(r.wes_questions),
      costUsd: Number(r.cost_usd),
      lastActive: r.last_active ? new Date(r.last_active).toISOString().slice(0, 10) : null,
      createdAt: new Date(r.created_at).toISOString(),
    };
  });
}

const csvCell = (v: unknown) => {
  const s = v === null || v === undefined ? '' : String(v);
  // Neutralise spreadsheet formulas and quote anything with separators.
  const safe = /^[=+\-@\t\r]/.test(s) ? `'${s}` : s;
  return /[",\n]/.test(safe) ? `"${safe.replace(/"/g, '""')}"` : safe;
};

export async function dashboardRoutes(app: FastifyInstance, opts: { deps: AppDeps }) {
  const { deps } = opts;

  defineRoute(
    app,
    {
      method: 'GET',
      url: '/v1/centres/:id/dashboard',
      operationId: 'getCentreDashboard',
      summary: 'Your centre at a glance: children, consent, Wes use, attendance and weekly trends',
      tags: ['dashboards'],
      auth: 'user',
      params: CentreParams,
      query: DateRangeQuerySchema,
      responses: { 200: { description: 'Centre dashboard', schema: CentreDashboardSchema } },
    },
    async ({ params, query, raw }) => {
      const range = resolveRange(deps.now(), query);
      const ctx = await centreContext(deps, raw, params.id, 'dashboard:read');
      return withRequestContext(deps.db, ctx, async (tx) => {
        const [row] = rowsOf<{ d: Record<string, unknown> }>(
          await tx.execute(
            sql`select app.centre_dashboard(${params.id}::uuid, ${range.from}::date, ${range.to}::date, ${range.weeks}) d`,
          ),
        );
        return { from: range.from, to: range.to, ...numbers(row!.d) };
      });
    },
  );

  defineRoute(
    app,
    {
      method: 'GET',
      url: '/v1/admin/metrics',
      operationId: 'getPlatformMetrics',
      summary: 'Platform metrics for Dala admins (aggregates only, never child records)',
      tags: ['dashboards'],
      auth: 'user',
      query: PlatformFiltersSchema,
      responses: { 200: { description: 'Platform metrics', schema: PlatformMetricsSchema } },
    },
    async ({ query, raw }) => {
      const range = resolveRange(deps.now(), query);
      const [province, city, size, status] = filterArgs(query);
      return withRequestContext(deps.db, userContext(raw), async (tx) => {
        const [row] = rowsOf<{ d: Record<string, unknown> }>(
          await tx.execute(
            sql`select app.platform_dashboard(${range.from}::date, ${range.to}::date, ${province}, ${city}, ${size}, ${status}, ${query.role ?? null}) d`,
          ),
        );
        return { from: range.from, to: range.to, ...numbers(row!.d) };
      });
    },
  );

  defineRoute(
    app,
    {
      method: 'GET',
      url: '/v1/admin/centres',
      operationId: 'listPlatformCentres',
      summary: 'Centres with usage and cost (no child data; small counts hidden)',
      tags: ['dashboards'],
      auth: 'user',
      query: PlatformFiltersSchema,
      responses: { 200: { description: 'Centres', schema: PlatformCentreListSchema } },
    },
    async ({ query, raw }) => {
      const range = resolveRange(deps.now(), query);
      return withRequestContext(deps.db, userContext(raw), async (tx) => ({
        items: await platformCentres(tx, range, query, 200),
      }));
    },
  );

  defineRoute(
    app,
    {
      method: 'GET',
      url: '/v1/admin/metrics/export.csv',
      operationId: 'exportPlatformCentres',
      summary: 'Download the filtered centre table as CSV',
      tags: ['dashboards'],
      auth: 'user',
      query: PlatformFiltersSchema,
      responses: { 200: { description: 'CSV file (text/csv)' } },
    },
    async ({ query, raw }, reply) => {
      const range = resolveRange(deps.now(), query);
      const items = await withRequestContext(deps.db, userContext(raw), (tx) =>
        platformCentres(tx, range, query, 500),
      );
      const header = [
        'Centre',
        'Province',
        'City',
        'Registration',
        'Children',
        'Staff',
        'Wes questions',
        'Cost (USD)',
        'Last active',
        'Joined',
      ];
      const lines = items.map((c) =>
        [
          c.name,
          c.province,
          c.city,
          c.registrationStatus,
          c.children ?? 'fewer than 5',
          c.staff,
          c.wesQuestions,
          c.costUsd.toFixed(2),
          c.lastActive,
          c.createdAt.slice(0, 10),
        ]
          .map(csvCell)
          .join(','),
      );
      return reply
        .header('content-type', 'text/csv; charset=utf-8')
        .header(
          'content-disposition',
          `attachment; filename="wes-centres-${range.from}-to-${range.to}.csv"`,
        )
        .send([header.join(','), ...lines].join('\n') + '\n');
    },
  );
}
