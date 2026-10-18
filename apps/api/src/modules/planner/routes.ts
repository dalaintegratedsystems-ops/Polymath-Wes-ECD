import type { FastifyInstance } from 'fastify';
import { and, desc, eq, ne } from 'drizzle-orm';
import { z } from 'zod';
import {
  AdaptRequestSchema,
  AdaptedActivitySchema,
  AppError,
  PlanRequestSchema,
  PrintableRequestSchema,
  WeeklyPlanSchema,
} from '@wes/shared';
import { schema, withRequestContext, type Transaction } from '@wes/db';
import { audit, centreContext, centreHeader, centreIdFromHeader } from '../../platform/context';
import type { AppDeps } from '../../platform/deps';
import { defineRoute } from '../../platform/route';
import { adaptActivity } from './library';
import { PLANNER_SYSTEM, draftPlanBody, savePlan, toPlan, type StoredPlan } from './service';
import { renderPrintable } from './printables';

const IdParams = z.object({ id: z.uuid() });
const WeekQuery = z.object({ week: z.iso.date() });

export async function plannerRoutes(app: FastifyInstance, opts: { deps: AppDeps }) {
  const { deps } = opts;

  defineRoute(
    app,
    {
      method: 'POST',
      url: '/v1/plans/weekly',
      operationId: 'createWeeklyPlan',
      summary:
        'Draft a theme plan for the week, tagged to ELDAs (a draft until a practitioner approves)',
      tags: ['planner'],
      auth: 'user',
      idempotent: true,
      headers: centreHeader,
      body: PlanRequestSchema,
      responses: { 201: { description: 'Draft plan', schema: WeeklyPlanSchema } },
    },
    async ({ body, raw }, reply) => {
      const ctx = await centreContext(deps, raw, centreIdFromHeader(raw), 'plan:write');
      const draft = await draftPlanBody(deps, body.theme, body.ageGroups);
      const plan = await withRequestContext(deps.db, ctx, async (tx) => {
        const saved = await savePlan(deps, tx, ctx, { ...body, ...draft });
        await audit(tx, raw, ctx, {
          action: 'plan.create',
          resourceType: 'weekly_plan',
          resourceId: saved.id,
        });
        return saved;
      });
      return reply.status(201).send(plan);
    },
  );

  defineRoute(
    app,
    {
      method: 'GET',
      url: '/v1/plans/current',
      operationId: 'getWeeklyPlan',
      summary: 'The plan for a week (the approved one if there is one, otherwise the draft)',
      tags: ['planner'],
      auth: 'user',
      headers: centreHeader,
      query: WeekQuery,
      responses: {
        200: { description: 'Plan', schema: WeeklyPlanSchema },
        404: { description: 'No plan for that week' },
      },
    },
    async ({ query, raw }) => {
      const ctx = await centreContext(deps, raw, centreIdFromHeader(raw), 'plan:write');
      return withRequestContext(deps.db, ctx, async (tx) => {
        const rows = await tx
          .select()
          .from(schema.weeklyPlans)
          .where(
            and(
              eq(schema.weeklyPlans.centreId, ctx.centreId!),
              eq(schema.weeklyPlans.weekStarting, query.week),
              ne(schema.weeklyPlans.status, 'archived'),
            ),
          )
          .orderBy(desc(schema.weeklyPlans.createdAt));
        const pick = rows.find((r) => r.status === 'draft') ?? rows[0];
        if (!pick) throw new AppError('not_found', 'No plan for that week yet.');
        return toPlan(pick);
      });
    },
  );

  async function loadPlan(tx: Transaction, centreId: string, id: string) {
    const [row] = await tx
      .select()
      .from(schema.weeklyPlans)
      .where(and(eq(schema.weeklyPlans.id, id), eq(schema.weeklyPlans.centreId, centreId)));
    if (!row) throw new AppError('not_found', 'Plan not found.');
    return row;
  }

  defineRoute(
    app,
    {
      method: 'POST',
      url: '/v1/plans/:id/approve',
      operationId: 'approveWeeklyPlan',
      summary: 'Approve a plan for use (the practitioner decides)',
      tags: ['planner'],
      auth: 'user',
      idempotent: true,
      headers: centreHeader,
      params: IdParams,
      responses: { 200: { description: 'Plan', schema: WeeklyPlanSchema } },
    },
    async ({ params, raw }) => {
      const ctx = await centreContext(deps, raw, centreIdFromHeader(raw), 'plan:write');
      return withRequestContext(deps.db, ctx, async (tx) => {
        const current = await loadPlan(tx, ctx.centreId!, params.id);
        if (current.status !== 'draft')
          throw new AppError('conflict', 'Only a draft can be approved.');
        await tx
          .update(schema.weeklyPlans)
          .set({ status: 'archived', updatedAt: deps.now() })
          .where(
            and(
              eq(schema.weeklyPlans.centreId, ctx.centreId!),
              eq(schema.weeklyPlans.weekStarting, current.weekStarting),
              eq(schema.weeklyPlans.status, 'approved'),
            ),
          );
        const [row] = await tx
          .update(schema.weeklyPlans)
          .set({ status: 'approved', updatedAt: deps.now() })
          .where(eq(schema.weeklyPlans.id, current.id))
          .returning();
        await audit(tx, raw, ctx, {
          action: 'plan.approve',
          resourceType: 'weekly_plan',
          resourceId: current.id,
        });
        return toPlan(row!);
      });
    },
  );

  defineRoute(
    app,
    {
      method: 'POST',
      url: '/v1/activities/adapt',
      operationId: 'adaptActivity',
      summary: 'Adapt a planned activity: younger, older, outdoors or with fewer materials',
      tags: ['planner'],
      auth: 'user',
      headers: centreHeader,
      body: AdaptRequestSchema,
      responses: { 200: { description: 'Adapted activity', schema: AdaptedActivitySchema } },
    },
    async ({ body, raw }) => {
      const ctx = await centreContext(deps, raw, centreIdFromHeader(raw), 'plan:write');
      const plan = await withRequestContext(deps.db, ctx, (tx) =>
        loadPlan(tx, ctx.centreId!, body.planId),
      );
      const activity = (plan.plan as StoredPlan).body.days
        .flatMap((d) => d.activities)
        .find((a) => a.id === body.activityId);
      if (!activity) throw new AppError('not_found', 'Activity not found.');
      const model = deps.agent.model;
      if (model.structured) {
        try {
          const res = await model.structured({
            model: deps.agent.config.models.main,
            system: `${PLANNER_SYSTEM}\nAdapt the activity you are given. Keep the same theme. Return the full adapted activity and a one-sentence note for the practitioner.`,
            prompt: `Adapt for: ${body.target.replace('_', ' ')}\nActivity: ${JSON.stringify({
              title: activity.title,
              steps: activity.steps,
              materials: activity.materials,
            })}`,
            schema: AdaptedActivitySchema,
            maxTokens: 2000,
            effort: 'low',
          });
          if (res.value) return res.value;
        } catch {
          // fall through to the built-in adaptation
        }
      }
      return adaptActivity(activity, body.target);
    },
  );

  defineRoute(
    app,
    {
      method: 'POST',
      url: '/v1/printables',
      operationId: 'createPrintable',
      summary: 'A low-ink A4 printable: flashcards, a tracing sheet or a counting sheet',
      tags: ['planner'],
      auth: 'user',
      headers: centreHeader,
      body: PrintableRequestSchema,
      responses: { 200: { description: 'PDF (application/pdf)' } },
    },
    async ({ body, raw }, reply) => {
      const ctx = await centreContext(deps, raw, centreIdFromHeader(raw), 'plan:write');
      const centreName = await withRequestContext(deps.db, ctx, async (tx) => {
        const [c] = await tx
          .select({ name: schema.centres.name })
          .from(schema.centres)
          .where(eq(schema.centres.id, ctx.centreId!));
        await tx.insert(schema.printables).values({
          centreId: ctx.centreId!,
          kind: body.kind === 'flashcards' ? 'flashcards' : 'worksheet',
          title: body.title,
          spec: body,
          createdByUserId: ctx.userId,
        });
        return c?.name ?? 'Your centre';
      });
      const pdf = await renderPrintable(body, centreName);
      return reply
        .header('content-type', 'application/pdf')
        .header('content-disposition', `attachment; filename="${body.kind}.pdf"`)
        .header('cache-control', 'private, no-store')
        .send(pdf);
    },
  );

  defineRoute(
    app,
    {
      method: 'GET',
      url: '/v1/printables/:id/pdf',
      operationId: 'getPrintablePdf',
      summary: 'A printable made earlier (for example by Wes), as a PDF',
      tags: ['planner'],
      auth: 'user',
      headers: centreHeader,
      params: IdParams,
      responses: { 200: { description: 'PDF (application/pdf)' } },
    },
    async ({ params, raw }, reply) => {
      const ctx = await centreContext(deps, raw, centreIdFromHeader(raw), 'plan:write');
      const row = await withRequestContext(deps.db, ctx, async (tx) => {
        const [r] = await tx
          .select({ key: schema.printables.pdfBlobKey, kind: schema.printables.kind })
          .from(schema.printables)
          .where(
            and(eq(schema.printables.id, params.id), eq(schema.printables.centreId, ctx.centreId!)),
          );
        return r;
      });
      const file = row?.key ? await deps.blobs.get(row.key) : null;
      if (!file) throw new AppError('not_found', 'Printable not found.');
      return reply
        .header('content-type', 'application/pdf')
        .header('content-disposition', `attachment; filename="${row!.kind}.pdf"`)
        .header('cache-control', 'private, no-store')
        .send(file.bytes);
    },
  );
}
