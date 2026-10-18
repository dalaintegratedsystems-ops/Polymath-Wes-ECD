import { and, desc, eq, gte, isNull, ne, sql } from 'drizzle-orm';
import type { ToolServices } from '@wes/agent';
import { AppError, POLICY_TITLE, type AuditGap, type WeeklyPlan } from '@wes/shared';
import { schema, withRequestContext, type RequestContext, type Transaction } from '@wes/db';
import type { AppDeps } from '../../platform/deps';
import { assertRegisterDay, recordMarks } from '../attendance/service';
import { draftPolicy, validateAnswers } from '../compliance/policy-templates';
import {
  archiveOthers,
  loadChecklist,
  registrationProgress,
  sastToday,
  stepLabel,
} from '../compliance/service';
import { adaptActivity } from '../planner/library';
import { renderPrintable } from '../planner/printables';
import { draftPlanBody, planningMonday, savePlan } from '../planner/service';

/**
 * Domain services behind Wes's tools (the rest of the CLAUDE.md §5 catalogue). Each runs under
 * the caller's own row-level security. Anything Wes writes is a draft or a register mark the
 * practitioner asked for; child lookups return counts, never names (they would reach the model).
 */
type Extra = Required<
  Pick<
    ToolServices,
    | 'selfAuditStatus'
    | 'draftPolicy'
    | 'applicationPack'
    | 'createWeeklyPlan'
    | 'adaptActivity'
    | 'generatePrintable'
    | 'recordAttendance'
    | 'childSummary'
  >
>;

async function auditTool(
  tx: Transaction,
  ctx: RequestContext,
  entry: {
    action: string;
    resourceType: string;
    resourceId?: string | null;
    metadata?: Record<string, unknown>;
  },
) {
  await tx.insert(schema.auditLog).values({
    centreId: ctx.centreId,
    actorUserId: ctx.userId,
    actorRole: ctx.role,
    action: entry.action,
    resourceType: entry.resourceType,
    resourceId: entry.resourceId ?? null,
    channel: 'assistant',
    metadata: entry.metadata ?? {},
  });
}

/** Active children in the centre whose first name matches (case-insensitive). */
async function matchChildren(tx: Transaction, centreId: string, firstName: string) {
  return tx
    .select({
      id: schema.children.id,
      birthMonth: schema.children.birthMonth,
      groupId: schema.children.groupId,
    })
    .from(schema.children)
    .where(
      and(
        eq(schema.children.centreId, centreId),
        eq(schema.children.status, 'active'),
        sql`lower(${schema.children.firstName}) = lower(${firstName.trim()})`,
      ),
    );
}

export function extraToolServices(deps: AppDeps, ctx: RequestContext): Extra {
  const centreId = ctx.centreId!;
  const run = <T>(fn: (tx: Transaction) => Promise<T>) => withRequestContext(deps.db, ctx, fn);

  return {
    async selfAuditStatus() {
      return run(async (tx) => {
        const checklist = await loadChecklist(tx);
        const [audit] = await tx
          .select()
          .from(schema.auditRuns)
          .where(eq(schema.auditRuns.centreId, centreId))
          .orderBy(desc(schema.auditRuns.createdAt))
          .limit(1);
        return {
          done: Boolean(audit),
          scorePercent: audit?.scorePercent ?? null,
          openItems: ((audit?.gaps ?? []) as AuditGap[]).map((g) => ({
            title: g.title,
            action: g.action,
          })),
          questions: checklist.items.map((i) => i.title),
          link: '/registration/audit',
        };
      });
    },

    async draftPolicy({ kind, answers }) {
      let clean: Record<string, string>;
      try {
        clean = validateAnswers(kind, answers);
      } catch (err) {
        if (err instanceof AppError) {
          return {
            missing: (err.details ?? []).map((d) => `${d.path.split('.').pop()}: ${d.message}`),
          };
        }
        throw err;
      }
      return run(async (tx) => {
        const [centre] = await tx
          .select({ name: schema.centres.name })
          .from(schema.centres)
          .where(eq(schema.centres.id, centreId));
        const [principal] = await tx
          .select({ name: schema.users.displayName })
          .from(schema.memberships)
          .innerJoin(schema.users, eq(schema.users.id, schema.memberships.userId))
          .where(
            and(
              eq(schema.memberships.centreId, centreId),
              eq(schema.memberships.role, 'principal'),
            ),
          )
          .limit(1);
        const draft = draftPolicy(kind, clean, {
          centreName: centre!.name,
          principalName: principal?.name ?? 'The principal',
          todayIso: sastToday(deps.now()),
        });
        const [row] = await tx
          .insert(schema.policies)
          .values({ centreId, kind, answers: clean, ...draft })
          .returning({ id: schema.policies.id });
        await archiveOthers(tx, centreId, kind, row!.id, ['draft']);
        await auditTool(tx, ctx, {
          action: 'policy.generate',
          resourceType: 'policy',
          resourceId: row!.id,
        });
        return {
          policyId: row!.id,
          title: POLICY_TITLE[kind],
          status: 'draft' as const,
          link: `/registration/policies/${kind}`,
        };
      });
    },

    async applicationPack() {
      const p = await run((tx) => registrationProgress(tx, centreId, deps.now()));
      return {
        ready: p.steps.filter((s) => s.status === 'done').map((s) => stepLabel(s.id)),
        missing: p.steps
          .filter((s) => s.status !== 'done' && s.id !== 'pack' && s.id !== 'submit')
          .map((s) => `${stepLabel(s.id)}: ${s.detail}`),
        link: '/registration/pack',
      };
    },

    async createWeeklyPlan({ theme, ageGroups }) {
      const draft = await draftPlanBody(deps, theme, ageGroups);
      const plan = await run(async (tx) => {
        const saved = await savePlan(deps, tx, ctx, {
          theme,
          ageGroups,
          weekStarting: planningMonday(deps.now()),
          ...draft,
        });
        await auditTool(tx, ctx, {
          action: 'plan.create',
          resourceType: 'weekly_plan',
          resourceId: saved.id,
        });
        return saved;
      });
      return {
        planId: plan.id,
        theme: plan.theme,
        weekStarting: plan.weekStarting,
        source: plan.source,
        days: plan.body.days.map((d) => ({
          day: d.day,
          activities: d.activities.map((a) => a.title),
        })),
        link: '/plan',
      };
    },

    async adaptActivity({ day, slotNumber, target }) {
      const row = await run(async (tx) => {
        const [r] = await tx
          .select({ plan: schema.weeklyPlans.plan })
          .from(schema.weeklyPlans)
          .where(
            and(
              eq(schema.weeklyPlans.centreId, centreId),
              eq(schema.weeklyPlans.weekStarting, planningMonday(deps.now())),
              ne(schema.weeklyPlans.status, 'archived'),
            ),
          )
          .orderBy(desc(schema.weeklyPlans.createdAt))
          .limit(1);
        return r;
      });
      const body = (row?.plan as { body?: WeeklyPlan['body'] } | undefined)?.body;
      const activity = body?.days.find((d) => d.day === day)?.activities[slotNumber - 1];
      return activity ? adaptActivity(activity, target) : { notFound: true as const };
    },

    async generatePrintable(input) {
      const centreName = await run(async (tx) => {
        const [c] = await tx
          .select({ name: schema.centres.name })
          .from(schema.centres)
          .where(eq(schema.centres.id, centreId));
        return c?.name ?? 'Your centre';
      });
      const words = input.words.filter((w) => /^[\p{L} '-]{1,14}$/u.test(w));
      const pdf = await renderPrintable({ ...input, words }, centreName);
      const id = crypto.randomUUID();
      const blobKey = `centres/${centreId}/printables/${id}.pdf`;
      await deps.blobs.put(blobKey, pdf, 'application/pdf');
      await run(async (tx) => {
        await tx.insert(schema.printables).values({
          id,
          centreId,
          kind: input.kind === 'flashcards' ? 'flashcards' : 'worksheet',
          title: input.title,
          spec: { ...input, words },
          pdfBlobKey: blobKey,
          createdByUserId: ctx.userId,
        });
        await auditTool(tx, ctx, {
          action: 'printable.create',
          resourceType: 'printable',
          resourceId: id,
        });
      });
      return { printableId: id, link: `/plan/printables/${id}` };
    },

    async recordAttendance({ day, marks }) {
      const date = day ?? sastToday(deps.now());
      assertRegisterDay(date, deps.now());
      const at = deps.now().toISOString();
      return run(async (tx) => {
        let notFound = 0;
        let ambiguous = 0;
        const resolved: {
          childId: string;
          status: (typeof marks)[number]['status'];
          clientUpdatedAt: string;
        }[] = [];
        for (const m of marks) {
          const hits = await matchChildren(tx, centreId, m.firstName);
          if (hits.length === 0) notFound += 1;
          else if (hits.length > 1) ambiguous += 1;
          else resolved.push({ childId: hits[0]!.id, status: m.status, clientUpdatedAt: at });
        }
        const result = resolved.length
          ? await recordMarks(tx, { centreId, userId: ctx.userId!, day: date, marks: resolved })
          : null;
        await auditTool(tx, ctx, {
          action: 'attendance.record',
          resourceType: 'attendance',
          resourceId: date,
          metadata: { marks: marks.length, saved: result?.applied ?? 0, notFound, ambiguous },
        });
        return {
          saved: result?.applied ?? 0,
          notFound,
          ambiguous,
          conflicts: result?.conflicts.length ?? 0,
          day: date,
        };
      });
    },

    async childSummary({ firstName }) {
      return run(async (tx) => {
        const hits = await matchChildren(tx, centreId, firstName);
        if (hits.length === 0) return { found: false as const };
        if (hits.length > 1) return { found: 'many' as const };
        const child = hits[0]!;
        const since = new Date(deps.now().getTime() - 30 * 86_400_000).toISOString().slice(0, 10);
        const marks = await tx
          .select({ status: schema.attendanceRecords.status })
          .from(schema.attendanceRecords)
          .where(
            and(
              eq(schema.attendanceRecords.childId, child.id),
              gte(schema.attendanceRecords.day, since),
            ),
          );
        const [group] = child.groupId
          ? await tx
              .select({ name: schema.groups.name })
              .from(schema.groups)
              .where(eq(schema.groups.id, child.groupId))
          : [];
        const [consent] = await tx
          .select({ id: schema.consents.id })
          .from(schema.consents)
          .where(and(eq(schema.consents.childId, child.id), isNull(schema.consents.revokedAt)))
          .limit(1);
        const [y, m] = child.birthMonth.split('-').map(Number) as [number, number];
        const now = deps.now();
        const ageMonths = (now.getUTCFullYear() - y) * 12 + (now.getUTCMonth() + 1 - m);
        await auditTool(tx, ctx, {
          action: 'child.summary',
          resourceType: 'child',
          resourceId: child.id,
        });
        return {
          found: true as const,
          group: group?.name ?? null,
          ageMonths,
          daysMarked: marks.length,
          daysPresent: marks.filter((x) => x.status === 'present').length,
          consentOnFile: Boolean(consent),
        };
      });
    },
  };
}
