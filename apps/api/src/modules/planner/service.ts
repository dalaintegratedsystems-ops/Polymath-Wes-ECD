import { and, eq, ne } from 'drizzle-orm';
import { ELDAS, PlanBodySchema, type AgeGroup, type PlanBody, type WeeklyPlan } from '@wes/shared';
import { schema, searchKnowledge, type RequestContext, type Transaction } from '@wes/db';
import type { AppDeps } from '../../platform/deps';
import { libraryPlan } from './library';

/** Weekly planning, shared by the API routes and Wes's create_weekly_plan tool. */
export interface StoredPlan {
  ageGroups: AgeGroup[];
  source: 'wes' | 'library';
  body: PlanBody;
}

export function toPlan(row: typeof schema.weeklyPlans.$inferSelect): WeeklyPlan {
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

export const PLANNER_SYSTEM = `You plan a week of early learning for a South African ECD centre in an under-resourced community.
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

/** Claude drafts the plan when live; the built-in activity ideas cover offline use and bad output. */
export async function draftPlanBody(deps: AppDeps, theme: string, groups: AgeGroup[]) {
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

/** Save a draft plan (with citations from the curated corpus) and archive older drafts. */
export async function savePlan(
  deps: AppDeps,
  tx: Transaction,
  ctx: RequestContext,
  input: {
    theme: string;
    ageGroups: AgeGroup[];
    weekStarting: string;
    body: PlanBody;
    source: 'wes' | 'library';
  },
): Promise<WeeklyPlan> {
  const [embedding] = await deps.agent.embedder.embed([`${input.theme} early learning`], 'query');
  const hits = await searchKnowledge(tx, { query: input.theme, embedding: embedding!, limit: 3 });
  const [row] = await tx
    .insert(schema.weeklyPlans)
    .values({
      centreId: ctx.centreId!,
      weekStarting: input.weekStarting,
      theme: input.theme,
      plan: {
        ageGroups: input.ageGroups,
        source: input.source,
        body: input.body,
      } satisfies StoredPlan,
      citations: hits.map((h, i) => ({ n: i + 1, source: h.title, where: h.anchor })),
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
        eq(schema.weeklyPlans.weekStarting, input.weekStarting),
        eq(schema.weeklyPlans.status, 'draft'),
        ne(schema.weeklyPlans.id, row!.id),
      ),
    );
  return toPlan(row!);
}

/** The Monday to plan for: this week, or next week on Saturday and Sunday (SAST). */
export function planningMonday(now: Date): string {
  const d = new Date(now.getTime() + 2 * 3_600_000);
  const dow = d.getUTCDay();
  const offset = dow === 0 ? 1 : dow === 6 ? 2 : 1 - dow;
  return new Date(d.getTime() + offset * 86_400_000).toISOString().slice(0, 10);
}
