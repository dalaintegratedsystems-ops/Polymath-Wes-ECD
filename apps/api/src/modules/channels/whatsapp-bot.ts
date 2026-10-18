import { and, desc, eq, ne, sql } from 'drizzle-orm';
import { parseMenuReply, type NormalisedInbound, type OutboundPart } from '@wes/channels';
import { eldaLabel, type Role, type WeeklyPlan } from '@wes/shared';
import { ANONYMOUS, schema, withRequestContext, type RequestContext } from '@wes/db';
import type { AppDeps } from '../../platform/deps';
import { rowsOf } from '../../platform/sql';
import { loadTurnContext, persistTurn, toolServices } from '../assistant/store';
import { buildApplicationPack } from '../compliance/pack';
import { registrationProgress, sastToday, stepLabel } from '../compliance/service';

/**
 * Wes on WhatsApp: the same agent and the same data as the app, in short messages with a
 * numbered menu that works on any phone. Who is writing is decided only by the phone number
 * in a Meta-signed webhook; unknown numbers are pointed to the app and nothing else.
 */

interface Sender {
  userId: string;
  displayName: string;
  centreId: string;
  centreName: string;
  role: Role;
}

const GREETINGS = /^(hi|hello|hey|menu|molo|sawubona|hallo|dumela|start|0)\b/i;

interface MenuOption {
  id: 'menu.ask' | 'menu.registration' | 'menu.plan' | 'menu.pack';
  label: string;
}

function menuFor(role: Role): MenuOption[] {
  const staff = role === 'principal' || role === 'practitioner';
  return [
    { id: 'menu.ask', label: 'Ask Wes a question' },
    ...(staff ? [{ id: 'menu.registration' as const, label: 'Registration progress' }] : []),
    ...(staff ? [{ id: 'menu.plan' as const, label: 'This week’s plan' }] : []),
    ...(role === 'principal'
      ? [{ id: 'menu.pack' as const, label: 'Application pack (PDF)' }]
      : []),
  ];
}

async function lookup(deps: AppDeps, phone: string): Promise<Sender | null> {
  const [row] = await withRequestContext(deps.db, ANONYMOUS, async (tx) =>
    rowsOf<{
      user_id: string;
      display_name: string;
      centre_id: string;
      centre_name: string;
      role: Role;
    }>(await tx.execute(sql`select * from app.channel_lookup_user(${phone})`)),
  );
  return row
    ? {
        userId: row.user_id,
        displayName: row.display_name,
        centreId: row.centre_id,
        centreName: row.centre_name,
        role: row.role,
      }
    : null;
}

async function rememberMenu(
  deps: AppDeps,
  ctx: RequestContext,
  conversationId: string,
  ids: string[],
) {
  await withRequestContext(deps.db, ctx, (tx) =>
    tx
      .update(schema.conversations)
      .set({ state: { menu: ids } })
      .where(eq(schema.conversations.id, conversationId)),
  );
}

async function lastMenu(
  deps: AppDeps,
  ctx: RequestContext,
): Promise<{ conversationId: string; ids: string[] } | null> {
  return withRequestContext(deps.db, ctx, async (tx) => {
    const [c] = await tx
      .select({ id: schema.conversations.id, state: schema.conversations.state })
      .from(schema.conversations)
      .where(
        and(
          eq(schema.conversations.userId, ctx.userId!),
          eq(schema.conversations.centreId, ctx.centreId!),
          eq(schema.conversations.channel, 'whatsapp'),
        ),
      )
      .orderBy(desc(schema.conversations.createdAt))
      .limit(1);
    return c
      ? { conversationId: c.id, ids: ((c.state as { menu?: string[] }).menu ?? []) as string[] }
      : null;
  });
}

function mondayOf(today: string): string {
  const d = new Date(`${today}T12:00:00Z`);
  const dow = d.getUTCDay();
  const offset = dow === 0 ? 1 : dow === 6 ? 2 : 1 - dow;
  return new Date(d.getTime() + offset * 86_400_000).toISOString().slice(0, 10);
}

const DAY_KEYS = ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat'] as const;

export async function handleWhatsApp(
  deps: AppDeps,
  appUrl: string,
  msg: NormalisedInbound,
): Promise<void> {
  const wa = deps.whatsapp!;
  const send = (parts: OutboundPart[]) => wa.send(msg.fromPhoneE164, parts);
  const who = await lookup(deps, msg.fromPhoneE164);
  if (!who) {
    await send([
      {
        kind: 'text',
        text: `Hi, I’m Wes, a helper for ECD centres. To chat with me here, first create your account in the Wes app: ${appUrl}\n\nUse this same cellphone number, then send me a message again.`,
      },
    ]);
    return;
  }
  const ctx: RequestContext = { userId: who.userId, centreId: who.centreId, role: who.role };
  const options = menuFor(who.role);
  const showMenu = async (intro: string) => {
    const turn = await loadTurnContext(deps, ctx, undefined, 'whatsapp');
    await rememberMenu(
      deps,
      ctx,
      turn.conversationId,
      options.map((o) => o.id),
    );
    await send([
      { kind: 'menu', text: intro, options: options.map((o) => ({ id: o.id, label: o.label })) },
    ]);
  };

  // Which menu option, if any: a tapped list row, or a number replying to the last menu.
  let choice = options.find((o) => o.id === msg.menuChoice)?.id;
  if (!choice && /^\s*\d{1,2}\.?\s*$/.test(msg.text)) {
    const last = await lastMenu(deps, ctx);
    choice = parseMenuReply(msg.text, last?.ids ?? []) as MenuOption['id'] | undefined;
    if (!choice) {
      await showMenu('Sorry, I did not understand that number. Here is the menu again:');
      return;
    }
  }

  if (!choice && GREETINGS.test(msg.text.trim())) {
    await showMenu(`Molo ${who.displayName}! What would you like to do?`);
    return;
  }

  if (choice === 'menu.ask') {
    await send([
      {
        kind: 'text',
        text: 'Type your question and I will answer. You can write in your own words.',
      },
    ]);
    return;
  }

  if (choice === 'menu.registration') {
    const p = await withRequestContext(deps.db, ctx, (tx) =>
      registrationProgress(tx, who.centreId, deps.now()),
    );
    const current = p.steps.find((s) => s.status === 'current');
    const lines = [
      `${who.centreName}: registration is ${p.percent}% done.`,
      current
        ? `Next step: ${stepLabel(current.id)}. ${current.detail}.`
        : 'All steps are done. Well done!',
      ...(p.expiringDocuments > 0
        ? [
            `${p.expiringDocuments} document${p.expiringDocuments === 1 ? '' : 's'} expired or due for renewal soon.`,
          ]
        : []),
      `Open the app to continue: ${appUrl}/registration`,
    ];
    await send([{ kind: 'text', text: lines.join('\n\n') }]);
    return;
  }

  if (choice === 'menu.plan') {
    const today = sastToday(deps.now());
    const week = mondayOf(today);
    const plan = await withRequestContext(deps.db, ctx, async (tx) => {
      const [row] = await tx
        .select()
        .from(schema.weeklyPlans)
        .where(
          and(
            eq(schema.weeklyPlans.centreId, who.centreId),
            eq(schema.weeklyPlans.weekStarting, week),
            ne(schema.weeklyPlans.status, 'archived'),
          ),
        )
        .orderBy(desc(schema.weeklyPlans.createdAt))
        .limit(1);
      return row;
    });
    if (!plan) {
      await send([
        {
          kind: 'text',
          text: `There is no plan for this week yet. Make one in the app: ${appUrl}/plan`,
        },
      ]);
      return;
    }
    const body = (plan.plan as { body: WeeklyPlan['body'] }).body;
    const key = DAY_KEYS[new Date(`${today}T12:00:00Z`).getUTCDay()];
    const day = body.days.find((d) => d.day === key) ?? body.days[0]!;
    const lines = [
      `This week’s theme: ${plan.theme}.`,
      `${key === day.day ? 'Today' : 'Monday'}:`,
      ...day.activities.map((a) => `${a.slot}: ${a.title} (${a.eldas.map(eldaLabel).join(', ')})`),
      `The full plan, steps and printables are in the app: ${appUrl}/plan`,
    ];
    await send([{ kind: 'text', text: lines.join('\n') }]);
    return;
  }

  if (choice === 'menu.pack') {
    if (who.role !== 'principal') {
      await send([{ kind: 'text', text: 'Only the principal can make the application pack.' }]);
      return;
    }
    await send([{ kind: 'text', text: 'Making your application pack. This takes a moment…' }]);
    const pdf = await withRequestContext(deps.db, ctx, (tx) =>
      buildApplicationPack({
        tx,
        blobs: deps.blobs,
        centreId: who.centreId,
        principalName: who.displayName,
        now: deps.now(),
      }),
    );
    const mediaId = await wa.uploadMedia(pdf, 'application/pdf', 'application-pack.pdf');
    await send([
      {
        kind: 'document',
        mediaId,
        filename: 'application-pack.pdf',
        caption: `${who.centreName}: application pack`,
      },
    ]);
    return;
  }

  // Anything else is a question for Wes: the same pipeline as the app.
  if (!['principal', 'practitioner', 'parent'].includes(who.role)) {
    await send([{ kind: 'text', text: `Please use the app: ${appUrl}` }]);
    return;
  }
  const started = Date.now();
  const turn = await loadTurnContext(deps, ctx, undefined, 'whatsapp');
  const result = await deps.agent.wes.respond({
    text: msg.text,
    centreId: who.centreId,
    centreName: turn.centreName,
    userId: who.userId,
    role: who.role as 'principal' | 'practitioner' | 'parent',
    channel: 'whatsapp',
    safeguardingName: turn.safeguardingName,
    knownNames: turn.knownNames,
    history: turn.history,
    services: toolServices(deps, ctx),
    budgetRemaining: turn.budgetRemaining,
  });
  await persistTurn(deps, ctx, turn, result, Date.now() - started, msg.providerMessageId);
  const sources = result.citations.length
    ? `\n\nSources:\n${result.citations.map((c) => `[${c.n}] ${c.title}, ${c.anchor}`).join('\n')}`
    : '';
  await send([{ kind: 'text', text: `${result.text}${sources}\n\nReply MENU for options.` }]);
}
