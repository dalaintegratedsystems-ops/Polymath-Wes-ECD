import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createHashEmbeddingProvider } from '@wes/agent';
import { SEED_IDS, storeKnowledgeSource } from '@wes/db';
import { bearer, createHarness, idem, signIn, type Harness } from './helpers';

let h: Harness;
const tokens: Record<string, string> = {};
const SIYA = { 'x-centre-id': SEED_IDS.centres.siyakhula };

interface Event {
  event: string;
  data: Record<string, unknown>;
}

function parseSse(body: string): Event[] {
  return body
    .split('\n\n')
    .filter(Boolean)
    .map((block) => {
      const event = /^event: (.*)$/m.exec(block)?.[1] ?? '';
      const data = JSON.parse(/^data: (.*)$/m.exec(block)?.[1] ?? '{}') as Record<string, unknown>;
      return { event, data };
    });
}

const finalText = (events: Event[]) =>
  String(
    events.find((e) => e.event === 'replace')?.data.text ??
      events
        .filter((e) => e.event === 'delta')
        .map((e) => e.data.text)
        .join(''),
  );

async function ask(who: string, text: string, conversationId?: string) {
  const res = await h.app.inject({
    method: 'POST',
    url: '/v1/assistant/messages',
    headers: { ...bearer(tokens[who]!), ...SIYA },
    payload: { text, ...(conversationId ? { conversationId } : {}) },
  });
  return { res, events: res.statusCode === 200 ? parseSse(res.body) : [] };
}

beforeAll(async () => {
  h = await createHarness();
  // A clearly labelled test fixture: never official content.
  const embedder = createHashEmbeddingProvider();
  const content =
    'A centre applying for registration keeps its admissions, health and safety policies in one file.';
  const [embedding] = await embedder.embed([`Documents\n${content}`], 'document');
  await storeKnowledgeSource(h.db.db, {
    slug: 'test-fixture-registration',
    title: 'TEST FIXTURE — Registration guide',
    publisher: 'Test',
    kind: 'guidance',
    url: null,
    corpusVersion: 'test',
    contentSha256: 'f'.repeat(64),
    isPlaceholder: false,
    chunks: [
      {
        ordinal: 0,
        heading: 'Documents',
        citation: 'Documents',
        content,
        tokenCount: 20,
        embedding: embedding!,
      },
    ],
  });
  for (const [name, phone] of Object.entries({
    nomsa: '+27600000001',
    ayanda: '+27600000005',
    lerato: '+27600000006',
  })) {
    tokens[name] = (await signIn(h, phone)).accessToken;
  }
});
afterAll(async () => h.close());

describe('Ask Wes over server-sent events', () => {
  let conversationId: string;

  it('streams a grounded answer with citations and records the run', async () => {
    const { res, events } = await ask('nomsa', 'Which policies do I need for registration?');
    expect(res.statusCode).toBe(200);
    expect(res.headers['content-type']).toContain('text/event-stream');
    expect(events[0]!.event).toBe('start');
    conversationId = events[0]!.data.conversationId as string;
    const done = events.find((e) => e.event === 'done')!;
    expect(done.data.citations).toEqual([
      expect.objectContaining({ n: 1, sourceSlug: 'test-fixture-registration' }),
    ]);
    expect(finalText(events)).toContain('[1]');

    const [run] = await h.db.query(
      'select intent, escalated, main_model from agent_runs order by created_at desc limit 1',
    );
    expect(run).toMatchObject({ intent: 'registration', escalated: false, main_model: 'offline' });
    const [tc] = await h.db.query(
      'select tool_name, ok from tool_calls order by created_at desc limit 1',
    );
    expect(tc).toMatchObject({ tool_name: 'search_knowledge', ok: true });
  });

  it('stores messages redacted and restores names when reading history', async () => {
    await ask(
      'nomsa',
      'Lwazi keeps biting at nap time, any ideas? Call me on 082 555 0101',
      conversationId,
    );
    const rows = await h.db.query(
      `select content_redacted from messages where role = 'user' order by created_at desc limit 1`,
    );
    expect(String(rows[0]!.content_redacted)).not.toMatch(/Lwazi|555/);

    const res = await h.app.inject({
      method: 'GET',
      url: '/v1/assistant/conversations/latest',
      headers: { ...bearer(tokens.nomsa!), ...SIYA },
    });
    const convo = res.json();
    expect(convo.conversationId).toBe(conversationId);
    const userTurn = convo.messages.filter((m: { role: string }) => m.role === 'user').at(-1);
    expect(userTurn.text).toContain('Lwazi');
    expect(userTurn.text).toContain('[phone number removed]');
  });

  it('runs the fixed child-protection response and audits the event, not the words', async () => {
    const { events } = await ask(
      'nomsa',
      'A child told me her stepfather touches her private parts',
    );
    const done = events.find((e) => e.event === 'done')!;
    expect(done.data.safety).toBe(true);
    expect(finalText(events)).toContain('Childline on 116');
    const [audit] = await h.db.query(
      `select action, metadata from audit_log where action = 'child_protection_escalation'`,
    );
    expect(audit).toBeTruthy();
    expect(JSON.stringify(audit)).not.toContain('stepfather');
  });

  it('lets parents use Wes but not funders', async () => {
    const parent = await ask('ayanda', 'Ideas for a rainy day at home?');
    expect(parent.res.statusCode).toBe(200);
    expect(parent.events.some((e) => e.event === 'done')).toBe(true);
    const funder = await ask('lerato', 'Hello');
    expect(funder.res.statusCode).toBe(403);
  });

  it('keeps conversations private to their owner', async () => {
    const { res } = await ask('ayanda', 'Hi', conversationId);
    expect(res.statusCode).toBe(404);
  });

  it('accepts feedback on an answer', async () => {
    const res0 = await h.app.inject({
      method: 'GET',
      url: '/v1/assistant/conversations/latest',
      headers: { ...bearer(tokens.ayanda!), ...SIYA },
    });
    const answer = res0
      .json()
      .messages.filter((m: { role: string }) => m.role === 'assistant')
      .at(-1);
    const res = await h.app.inject({
      method: 'POST',
      url: '/v1/assistant/feedback',
      headers: { ...bearer(tokens.ayanda!), ...SIYA, ...idem() },
      payload: { messageId: answer.id, rating: 'down', reason: 'not_relevant_locally' },
    });
    expect(res.statusCode).toBe(201);
  });

  it('stops answering when the centre’s monthly budget is used', async () => {
    const month = new Date('2026-10-15T08:00:00Z').toISOString().slice(0, 7);
    await h.db.query(
      `insert into usage_ledger (centre_id, month, input_tokens, output_tokens, budget_tokens)
       values ($1, $2, 10, 0, 10)
       on conflict (centre_id, month) do update set input_tokens = 10, budget_tokens = 10`,
      [SEED_IDS.centres.siyakhula, month],
    );
    const { events } = await ask('nomsa', 'Plan a week about water');
    expect(finalText(events)).toMatch(/used this month’s Wes allowance/);
  });
});
