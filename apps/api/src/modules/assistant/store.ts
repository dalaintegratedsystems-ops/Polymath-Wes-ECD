import { and, asc, desc, eq, sql } from 'drizzle-orm';
import {
  createRedactor,
  restore,
  type AgentReply,
  type KnownNames,
  type ToolServices,
} from '@wes/agent';
import { AppError, type AssistantTurn, type AuditGap } from '@wes/shared';
import { schema, searchKnowledge, withRequestContext, type RequestContext } from '@wes/db';
import type { AppDeps } from '../../platform/deps';
import { registrationProgress, stepLabel } from '../compliance/service';

/** Everything the pipeline needs about the caller's centre, loaded in one transaction. */
export interface TurnContext {
  conversationId: string;
  isNew: boolean;
  channel: 'web' | 'whatsapp';
  centreName: string;
  safeguardingName: string | null;
  knownNames: KnownNames;
  history: { role: 'user' | 'assistant'; text: string }[];
  budgetRemaining: number;
}

const month = (d: Date) => d.toISOString().slice(0, 7);

export async function loadTurnContext(
  deps: AppDeps,
  ctx: RequestContext,
  conversationId: string | undefined,
  channel: 'web' | 'whatsapp' = 'web',
): Promise<TurnContext> {
  const centreId = ctx.centreId!;
  return withRequestContext(deps.db, ctx, async (tx) => {
    const [centre] = await tx
      .select({
        name: schema.centres.name,
        safeguardingUserId: schema.centres.designatedSafeguardingUserId,
      })
      .from(schema.centres)
      .where(eq(schema.centres.id, centreId));
    if (!centre) throw new AppError('not_found', 'Centre not found.');

    let safeguardingName: string | null = null;
    if (centre.safeguardingUserId) {
      const [u] = await tx
        .select({ name: schema.users.displayName })
        .from(schema.users)
        .where(eq(schema.users.id, centre.safeguardingUserId));
      safeguardingName = u?.name ?? null;
    }

    // Names to redact: whatever this role may see (RLS decides). Read for redaction only.
    const children = await tx
      .select({ n: schema.children.firstName })
      .from(schema.children)
      .where(eq(schema.children.centreId, centreId));
    const intakes = await tx
      .select({ n: schema.childIntakes.firstName })
      .from(schema.childIntakes)
      .where(eq(schema.childIntakes.centreId, centreId));
    const guardians = await tx
      .select({ n: schema.guardians.displayName })
      .from(schema.guardians)
      .where(eq(schema.guardians.centreId, centreId));
    await tx.insert(schema.auditLog).values({
      centreId,
      actorUserId: ctx.userId,
      actorRole: ctx.role,
      action: 'read_for_redaction',
      resourceType: 'child',
      metadata: { count: children.length + intakes.length },
    });

    let convId = conversationId;
    let isNew = false;
    if (convId) {
      const [c] = await tx
        .select({ id: schema.conversations.id })
        .from(schema.conversations)
        .where(
          and(eq(schema.conversations.id, convId), eq(schema.conversations.centreId, centreId)),
        );
      if (!c) throw new AppError('not_found', 'Conversation not found.');
    } else {
      // WhatsApp is one long chat: resume the person's WhatsApp conversation across sessions.
      const [existing] =
        channel === 'whatsapp'
          ? await tx
              .select({ id: schema.conversations.id })
              .from(schema.conversations)
              .where(
                and(
                  eq(schema.conversations.centreId, centreId),
                  eq(schema.conversations.userId, ctx.userId!),
                  eq(schema.conversations.channel, 'whatsapp'),
                ),
              )
              .orderBy(desc(schema.conversations.createdAt))
              .limit(1)
          : [];
      if (existing) {
        convId = existing.id;
        await tx
          .update(schema.conversations)
          .set({ lastInboundAt: deps.now() })
          .where(eq(schema.conversations.id, convId));
      } else {
        const [c] = await tx
          .insert(schema.conversations)
          .values({ centreId, userId: ctx.userId!, channel, lastInboundAt: deps.now() })
          .returning({ id: schema.conversations.id });
        convId = c!.id;
        isNew = true;
      }
    }

    const history = isNew
      ? []
      : (
          await tx
            .select({ role: schema.messages.role, text: schema.messages.contentRedacted })
            .from(schema.messages)
            .where(eq(schema.messages.conversationId, convId))
            .orderBy(desc(schema.messages.createdAt))
            .limit(12)
        )
          .reverse()
          .filter((m): m is { role: 'user' | 'assistant'; text: string } => m.role !== 'system');

    const [ledger] = await tx
      .select({
        used: sql<number>`${schema.usageLedger.inputTokens} + ${schema.usageLedger.outputTokens}`,
        budget: schema.usageLedger.budgetTokens,
      })
      .from(schema.usageLedger)
      .where(
        and(
          eq(schema.usageLedger.centreId, centreId),
          eq(schema.usageLedger.month, month(deps.now())),
        ),
      );
    const budget = ledger?.budget ?? deps.agent.config.monthlyTokenBudgetPerCentre;

    return {
      channel,
      conversationId: convId,
      isNew,
      centreName: centre.name,
      safeguardingName,
      knownNames: {
        children: [...children, ...intakes].map((c) => c.n),
        guardians: guardians.map((g) => g.n),
      },
      history,
      budgetRemaining: budget - Number(ledger?.used ?? 0),
    };
  });
}

/** Domain services for the agent's tools, each running under the caller's RLS context. */
export function toolServices(deps: AppDeps, ctx: RequestContext): ToolServices {
  return {
    async searchKnowledge(query, limit) {
      const [embedding] = await deps.agent.embedder.embed([query], 'query');
      const hits = await withRequestContext(deps.db, ctx, (tx) =>
        searchKnowledge(tx, { query, embedding, limit }),
      );
      return hits.map((h) => ({
        sourceSlug: h.sourceSlug,
        title: h.title,
        anchor: h.anchor,
        content: h.content,
        corpusVersion: h.corpusVersion,
      }));
    },
    async complianceChecklist() {
      return withRequestContext(deps.db, ctx, (tx) =>
        tx
          .select({
            code: schema.complianceItems.code,
            category: schema.complianceItems.category,
            title: schema.complianceItems.title,
            guidance: schema.complianceItems.guidance,
          })
          .from(schema.complianceItems)
          .orderBy(asc(schema.complianceItems.sortOrder)),
      );
    },
    async registrationProgress() {
      return withRequestContext(deps.db, ctx, async (tx) => {
        const progress = await registrationProgress(tx, ctx.centreId!, deps.now());
        const [audit] = await tx
          .select({ gaps: schema.auditRuns.gaps })
          .from(schema.auditRuns)
          .where(eq(schema.auditRuns.centreId, ctx.centreId!))
          .orderBy(desc(schema.auditRuns.createdAt))
          .limit(1);
        return {
          percent: progress.percent,
          steps: progress.steps.map((s) => ({
            step: stepLabel(s.id),
            status: s.status,
            detail: s.detail,
          })),
          openItems: ((audit?.gaps ?? []) as AuditGap[]).map((g) => ({
            title: g.title,
            priority: g.priority,
            action: g.action,
          })),
          expiringDocuments: progress.expiringDocuments,
        };
      });
    },
    async createReminder({ message, dueDate }) {
      return withRequestContext(deps.db, ctx, async (tx) => {
        const [r] = await tx
          .insert(schema.reminders)
          .values({
            centreId: ctx.centreId!,
            userId: ctx.userId,
            kind: 'custom',
            message,
            dueAt: new Date(`${dueDate}T07:00:00+02:00`),
          })
          .returning({ id: schema.reminders.id });
        return { id: r!.id };
      });
    },
  };
}

/** Persist the exchange: redacted messages, the agent run, tool calls, usage and audit. */
export async function persistTurn(
  deps: AppDeps,
  ctx: RequestContext,
  turn: TurnContext,
  reply: AgentReply,
  latencyMs: number,
  requestId: string,
): Promise<{ messageId: string }> {
  const centreId = ctx.centreId!;
  const redactor = createRedactor(centreId, turn.knownNames);
  const assistantRedacted = redactor.redact(reply.text).text;

  return withRequestContext(deps.db, ctx, async (tx) => {
    const now = deps.now();
    // Wall-clock, strictly increasing timestamps keep message order stable.
    const at = new Date();
    const [userMsg] = await tx
      .insert(schema.messages)
      .values({
        conversationId: turn.conversationId,
        centreId,
        role: 'user',
        contentRedacted: reply.redactedText,
        createdAt: at,
      })
      .returning({ id: schema.messages.id });
    const [assistantMsg] = await tx
      .insert(schema.messages)
      .values({
        conversationId: turn.conversationId,
        centreId,
        role: 'assistant',
        contentRedacted: assistantRedacted,
        citations: reply.citations,
        attachments: reply.escalated ? [{ kind: 'safety' }] : [],
        createdAt: new Date(at.getTime() + 1),
      })
      .returning({ id: schema.messages.id });
    await tx
      .update(schema.conversations)
      .set({ lastInboundAt: now })
      .where(eq(schema.conversations.id, turn.conversationId));

    // Parents may insert runs but not read them back (RLS), so no RETURNING here.
    const runId = crypto.randomUUID();
    await tx.insert(schema.agentRuns).values({
      id: runId,
      centreId,
      conversationId: turn.conversationId,
      inputMessageId: userMsg!.id,
      outputMessageId: assistantMsg!.id,
      intent: reply.classification.intent,
      language: reply.classification.language,
      riskLevel: reply.classification.risk,
      escalated: reply.escalated,
      routerModel: reply.models.router,
      mainModel: reply.models.main,
      inputTokens:
        reply.usage.inputTokens + reply.usage.cacheReadTokens + reply.usage.cacheWriteTokens,
      outputTokens: reply.usage.outputTokens,
      costMicroUsd: reply.usage.costMicroUsd,
      latencyMs,
      postCheck: reply.postCheck,
      error: reply.error ?? null,
    });
    if (reply.toolCalls.length > 0) {
      await tx.insert(schema.toolCalls).values(
        reply.toolCalls.map((t) => ({
          agentRunId: runId,
          centreId,
          toolName: t.name,
          input: t.input as object,
          output: t.output as object,
          ok: t.ok,
          latencyMs: t.latencyMs,
        })),
      );
    }

    await tx
      .insert(schema.usageLedger)
      .values({
        centreId,
        month: month(now),
        inputTokens: reply.usage.inputTokens,
        outputTokens: reply.usage.outputTokens,
        costMicroUsd: reply.usage.costMicroUsd,
        budgetTokens: deps.agent.config.monthlyTokenBudgetPerCentre,
      })
      .onConflictDoUpdate({
        target: [schema.usageLedger.centreId, schema.usageLedger.month],
        set: {
          inputTokens: sql`${schema.usageLedger.inputTokens} + ${reply.usage.inputTokens}`,
          outputTokens: sql`${schema.usageLedger.outputTokens} + ${reply.usage.outputTokens}`,
          costMicroUsd: sql`${schema.usageLedger.costMicroUsd} + ${reply.usage.costMicroUsd}`,
        },
      });

    if (reply.escalated) {
      // The event, never the narrative (privacy.md).
      await tx.insert(schema.auditLog).values({
        centreId,
        actorUserId: ctx.userId,
        actorRole: ctx.role,
        action: 'child_protection_escalation',
        resourceType: 'conversation',
        resourceId: turn.conversationId,
        requestId,
        channel: turn.channel,
      });
    }
    return { messageId: assistantMsg!.id };
  });
}

/** The user's most recent conversation, with real names restored for display. */
export async function latestConversation(
  deps: AppDeps,
  ctx: RequestContext,
): Promise<{ conversationId: string | null; messages: AssistantTurn[] }> {
  return withRequestContext(deps.db, ctx, async (tx) => {
    const [conv] = await tx
      .select({ id: schema.conversations.id })
      .from(schema.conversations)
      .where(
        and(
          eq(schema.conversations.centreId, ctx.centreId!),
          eq(schema.conversations.userId, ctx.userId!),
        ),
      )
      .orderBy(desc(schema.conversations.updatedAt))
      .limit(1);
    if (!conv) return { conversationId: null, messages: [] };

    const children = await tx
      .select({ n: schema.children.firstName })
      .from(schema.children)
      .where(eq(schema.children.centreId, ctx.centreId!));
    const guardians = await tx
      .select({ n: schema.guardians.displayName })
      .from(schema.guardians)
      .where(eq(schema.guardians.centreId, ctx.centreId!));
    const vault = createRedactor(ctx.centreId!, {
      children: children.map((c) => c.n),
      guardians: guardians.map((g) => g.n),
    }).fullVault();

    const rows = await tx
      .select()
      .from(schema.messages)
      .where(eq(schema.messages.conversationId, conv.id))
      .orderBy(desc(schema.messages.createdAt))
      .limit(40);
    return {
      conversationId: conv.id,
      messages: rows
        .reverse()
        .filter((m) => m.role !== 'system')
        .map((m) => ({
          id: m.id,
          role: m.role as 'user' | 'assistant',
          text: restore(m.contentRedacted, vault),
          citations: (m.citations as AssistantTurn['citations']) ?? [],
          safety:
            Array.isArray(m.attachments) &&
            (m.attachments as { kind?: string }[]).some((a) => a.kind === 'safety'),
          createdAt: m.createdAt.toISOString(),
        })),
    };
  });
}
