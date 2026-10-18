import type { FastifyInstance } from 'fastify';
import { and, desc, eq, ne } from 'drizzle-orm';
import { z } from 'zod';
import {
  AdaptRequestSchema,
  AdaptedActivitySchema,
  AppError,
  ELDAS,
  PlanBodySchema,
  PlanRequestSchema,
  PrintableRequestSchema,
  WeeklyPlanSchema,
  type AgeGroup,
  type PlanBody,
  type WeeklyPlan,
} from '@wes/shared';
import { schema, searchKnowledge, withRequestContext, type Transaction } from '@wes/db';
import { audit, centreContext, centreHeader, centreIdFromHeader } from '../../platform/context';
import type { AppDeps } from '../../platform/deps';
import { defineRoute } from '../../platform/route';
import { adaptActivity, libraryPlan } from './library';
import { renderPrintable } from './printables';

const IdParams = z.object({ id: z.uuid() });
const WeekQuery = z.object({ week: z.iso.date() });

interface StoredPlan {
  ageGroups: AgeGroup[];
  source: 'wes' | 'library';
  body: PlanBody;
}

function toPlan(row: typeof schema.weeklyPlans.$inferSelect): WeeklyPlan {
  const stored = row.plan as StoredPlan;
  return {
    id: row.id,
    theme: row.theme,
    weekStarting: row.weekStarting,
    ageGroups: stored.ageGroups,
    status: row.status,
    source: stored.source,
    body: stored.body,
    citations: row.citations as WeeklyPlan['citations'],
    createdAt: row.createdAt.toISOString(),
  };
}

const PLANNER_SYSTEM = `You plan a week of early learning for a South African ECD centre in an under-resourced community.
Rules:
- Five days (mon to fri), three activities a day: a morning ring, a main activity and an afternoon activity.
- Use only free, recycled or household materials (bottle tops, boxes, leaves, flour and water glue). Never anything that costs money.
- Mixed ages: give each activity only the age groups it suits from the ones requested. For babies and toddlers never use objects small enough to swallow.
- Tag each activity with one to three ELDA codes from this list only: ${ELDAS.map((e) => `${e.code} (${e.label})`).join(', ')}.
- Do not quote, cite or describe the National Curriculum Framework; the centre links plans to official documents separately.
- Plain, warm English with short steps a practitioner can follow. Use local, familiar examples.
- Never diagnose or label children.
- themeWords: up to 12 simple words (letters only, up to 14 characters) for flashcards and tracing.
- printable: 'counting' for counting activities, 'flashcards' or 'tracing' for word activities, otherwise null.`;

/** Keep only what fits the request; anything off falls back to the built-in ideas. */
function validModelPlan(plan: PlanBody | null, groups: AgeGroup[]): PlanBody | null {
  if (!plan) return null;
  const parsed = PlanBodySchema.safeParse(plan);
  if (!parsed.success) return null;
  const days = ['mon', 'tue', 'wed', 'thu', 'fri'];
  if (parsed.data.days.map((d) => d.day).join() !== days.join()) return null;
  for (const d of parsed.data.days) {
    for (const a of d.activities) {
      a.ageGroups = a.ageGroups.filter((g) => groups.includes(g));
      if (a.ageGroups.length === 0) return null;
    }
  }
  return parsed.data;
}

export async function plannerRoutes(app: FastifyInstance, opts: { deps: AppDeps }) {
  const { deps } = opts;

  async function draftBody(theme: string, groups: AgeGroup[]) {
    const model = deps.agent.model;
    if (model.structured) {
      try {
        const res = await model.structured({
          model: deps.agent.config.models.main,
          system: PLANNER_SYSTEM,
          prompt: `Theme: ${theme}\nAge groups: ${groups.join(', ')}`,
          schema: PlanBodySchema,
          maxTokens: 8000,
          effort: deps.agent.config.mainEffort,
        });
        const plan = validModelPlan(res.value, groups);
        if (plan) return { body: plan, source: 'wes' as const };
      } catch {
        // Model unavailable: the built-in ideas keep the planner working.
      }
    }
    return { body: libraryPlan(theme, groups), source: 'library' as const };
  }

  async function citationsFor(theme: string) {
    const [embedding] = await deps.agent.embedder.embed([`${theme} early learning`], 'query');
    return (tx: Transaction) =>
      searchKnowledge(tx, { query: theme, embedding, limit: 3 }).then((hits) =>
        hits.map((h, i) => ({ n: i + 1, source: h.title, where: h.anchor })),
      );
  }

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
      const { body: planBody, source } = await draftBody(body.theme, body.ageGroups);
      const cite = await citationsFor(body.theme);
      const plan = await withRequestContext(deps.db, ctx, async (tx) => {
        const citations = await cite(tx);
        const [row] = await tx
          .insert(schema.weeklyPlans)
          .values({
            centreId: ctx.centreId!,
            weekStarting: body.weekStarting,
            theme: body.theme,
            plan: { ageGroups: body.ageGroups, source, body: planBody } satisfies StoredPlan,
            citations,
            createdByUserId: ctx.userId,
          })
          .returning();
        // One working draft per week: older drafts for the same week are archived.
        await tx
          .update(schema.weeklyPlans)
          .set({ status: 'archived', updatedAt: deps.now() })
          .where(
            and(
              eq(schema.weeklyPlans.centreId, ctx.centreId!),
              eq(schema.weeklyPlans.weekStarting, body.weekStarting),
              eq(schema.weeklyPlans.status, 'draft'),
              ne(schema.weeklyPlans.id, row!.id),
            ),
          );
        await audit(tx, raw, ctx, {
          action: 'plan.create',
          resourceType: 'weekly_plan',
          resourceId: row!.id,
        });
        return toPlan(row!);
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
}
