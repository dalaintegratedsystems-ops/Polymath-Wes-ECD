import type { FastifyInstance } from 'fastify';
import { and, eq, inArray, sql } from 'drizzle-orm';
import { z } from 'zod';
import {
  AppError,
  CentreCreateSchema,
  CentreSchema,
  CentreUpdateSchema,
  StaffMemberSchema,
  type Centre,
} from '@wes/shared';
import { schema, withRequestContext, type Transaction } from '@wes/db';
import { centreContext, userContext } from '../../platform/context';
import type { AppDeps } from '../../platform/deps';
import { defineRoute } from '../../platform/route';
import { rowsOf } from '../../platform/sql';

const CentreParams = z.object({ id: z.uuid() });

function toCentre(row: typeof schema.centres.$inferSelect): Centre {
  return {
    id: row.id,
    name: row.name,
    addressLine: row.addressLine,
    suburb: row.suburb,
    city: row.city,
    province: row.province,
    agesServedMinMonths: row.agesServedMinMonths,
    agesServedMaxMonths: row.agesServedMaxMonths,
    childCount: row.childCount,
    registrationStatus: row.registrationStatus,
    defaultLocale: row.defaultLocale,
  };
}

async function loadCentre(tx: Transaction, id: string): Promise<Centre> {
  const [row] = await tx.select().from(schema.centres).where(eq(schema.centres.id, id));
  if (!row) throw new AppError('not_found', 'Centre not found.');
  return toCentre(row);
}

export async function centreRoutes(app: FastifyInstance, opts: { deps: AppDeps }) {
  const { deps } = opts;

  defineRoute(
    app,
    {
      method: 'POST',
      url: '/v1/centres',
      operationId: 'createCentre',
      summary: 'Create your centre during onboarding; you become its principal',
      tags: ['centres'],
      auth: 'user',
      idempotent: true,
      body: CentreCreateSchema,
      responses: { 201: { description: 'Centre created', schema: CentreSchema } },
    },
    async ({ body, raw }, reply) => {
      const user = userContext(raw);
      const id = await withRequestContext(deps.db, user, async (tx) => {
        const rows = await tx.execute(sql`select app.onboard_centre(
          ${body.name}, ${body.addressLine}, ${body.suburb}, ${body.city}, ${body.province}::province,
          ${body.agesServedMinMonths}, ${body.agesServedMaxMonths}, ${body.childCount}) as id`);
        return rowsOf<{ id: string }>(rows)[0]!.id;
      });
      const centre = await withRequestContext(
        deps.db,
        { ...user, centreId: id, role: 'principal' },
        (tx) => loadCentre(tx, id),
      );
      return reply.status(201).send(centre);
    },
  );

  defineRoute(
    app,
    {
      method: 'GET',
      url: '/v1/centres/:id',
      operationId: 'getCentre',
      summary: 'Centre profile',
      tags: ['centres'],
      auth: 'user',
      params: CentreParams,
      responses: { 200: { description: 'Centre', schema: CentreSchema } },
    },
    async ({ params, raw }) => {
      const ctx = await centreContext(deps, raw, params.id, 'centre:read');
      return withRequestContext(deps.db, ctx, (tx) => loadCentre(tx, params.id));
    },
  );

  defineRoute(
    app,
    {
      method: 'PATCH',
      url: '/v1/centres/:id',
      operationId: 'updateCentre',
      summary: 'Update the centre profile (principal)',
      tags: ['centres'],
      auth: 'user',
      idempotent: true,
      params: CentreParams,
      body: CentreUpdateSchema,
      responses: { 200: { description: 'Updated centre', schema: CentreSchema } },
    },
    async ({ params, body, raw }) => {
      const ctx = await centreContext(deps, raw, params.id, 'centre:update');
      return withRequestContext(deps.db, ctx, async (tx) => {
        if (Object.keys(body).length > 0) {
          const updated = await tx
            .update(schema.centres)
            .set(body)
            .where(eq(schema.centres.id, params.id))
            .returning({ id: schema.centres.id });
          if (updated.length === 0) throw new AppError('forbidden', 'Your role cannot do this.');
        }
        return loadCentre(tx, params.id);
      });
    },
  );

  defineRoute(
    app,
    {
      method: 'GET',
      url: '/v1/centres/:id/staff',
      operationId: 'listStaff',
      summary: 'Principals and practitioners at the centre',
      tags: ['centres'],
      auth: 'user',
      params: CentreParams,
      responses: {
        200: { description: 'Staff', schema: z.object({ staff: z.array(StaffMemberSchema) }) },
      },
    },
    async ({ params, raw }) => {
      const ctx = await centreContext(deps, raw, params.id, 'staff:read');
      return withRequestContext(deps.db, ctx, async (tx) => {
        const rows = await tx
          .select({
            userId: schema.memberships.userId,
            displayName: schema.users.displayName,
            role: schema.memberships.role,
          })
          .from(schema.memberships)
          .innerJoin(schema.users, eq(schema.users.id, schema.memberships.userId))
          .where(
            and(
              eq(schema.memberships.centreId, params.id),
              inArray(schema.memberships.role, ['principal', 'practitioner']),
            ),
          )
          .orderBy(schema.memberships.role, schema.users.displayName);
        return { staff: rows.map((r) => ({ ...r, role: r.role as 'principal' | 'practitioner' })) };
      });
    },
  );
}
