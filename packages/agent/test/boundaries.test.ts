/**
 * The agent's edges: the live Claude client, embeddings, corpus ingestion and the tool loop,
 * each tested against fakes so no network or API key is needed.
 */
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { z } from 'zod';
import {
  ModelUnavailableError,
  createAnthropicModelClient,
  createEmbeddingProvider,
  createHashEmbeddingProvider,
  createVoyageEmbeddingProvider,
  defineTool,
  generate,
  ingestCorpus,
  loadAgentConfig,
  type ModelClient,
  type StoredSource,
  type ToolContext,
  type TurnResult,
} from '../src';

const config = loadAgentConfig({ ANTHROPIC_API_KEY: 'test-only-key', WES_MODEL_MODE: 'live' });

function claudeReply(text: string, stop = 'end_turn') {
  return new Response(
    JSON.stringify({
      id: 'msg_test',
      type: 'message',
      role: 'assistant',
      model: 'claude-haiku-5-5',
      content: [{ type: 'text', text }],
      stop_reason: stop,
      stop_sequence: null,
      usage: {
        input_tokens: 120,
        output_tokens: 30,
        cache_read_input_tokens: 0,
        cache_creation_input_tokens: 0,
      },
    }),
    { status: 200, headers: { 'content-type': 'application/json' } },
  );
}

describe('live Claude client', () => {
  it('classifies with structured output and reports usage', async () => {
    const fetchImpl = vi.fn(async () =>
      claudeReply(
        JSON.stringify({
          intent: 'registration',
          language: 'en',
          risk: 'normal',
          needsSources: true,
        }),
      ),
    );
    const client = createAnthropicModelClient(config, {
      fetch: fetchImpl as unknown as typeof fetch,
    });
    const res = await client.classify({
      model: 'claude-haiku-5-5',
      system: 'Classify.',
      text: 'Which documents?',
    });
    expect(res.classification).toEqual({
      intent: 'registration',
      language: 'en',
      risk: 'normal',
      needsSources: true,
    });
    expect(res.usage.inputTokens).toBe(120);
    const body = JSON.parse(
      String(
        (fetchImpl.mock.calls[0] as unknown[])[1] &&
          (fetchImpl.mock.calls[0] as unknown as [string, RequestInit])[1].body,
      ),
    );
    expect(body.model).toBe('claude-haiku-5-5');
  });

  it('returns structured values and treats refusals as nothing', async () => {
    const schema = z.object({ title: z.string() });
    const ok = createAnthropicModelClient(config, {
      fetch: (async () => claudeReply('{"title":"Rain"}')) as unknown as typeof fetch,
    });
    expect(
      (
        await ok.structured!({
          model: 'm',
          system: 's',
          prompt: 'p',
          schema,
          maxTokens: 100,
          effort: 'low',
        })
      ).value,
    ).toEqual({
      title: 'Rain',
    });
    const refused = createAnthropicModelClient(config, {
      fetch: (async () => claudeReply('', 'refusal')) as unknown as typeof fetch,
    });
    expect(
      (
        await refused.structured!({
          model: 'm',
          system: 's',
          prompt: 'p',
          schema,
          maxTokens: 100,
          effort: 'low',
        })
      ).value,
    ).toBeNull();
  });

  it('turns API errors into kind, retry-aware errors', async () => {
    const denied = createAnthropicModelClient(config, {
      fetch: (async () =>
        new Response(
          JSON.stringify({
            type: 'error',
            error: { type: 'authentication_error', message: 'bad key' },
          }),
          {
            status: 401,
            headers: { 'content-type': 'application/json' },
          },
        )) as unknown as typeof fetch,
    });
    const err = await denied
      .classify({ model: 'm', system: 's', text: 't' })
      .catch((e: unknown) => e);
    expect(err).toBeInstanceOf(ModelUnavailableError);
    expect((err as ModelUnavailableError).retryable).toBe(false);
  });
});

describe('embeddings', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('calls Voyage and keeps the input order', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(
        async () =>
          new Response(
            JSON.stringify({
              data: [
                { index: 1, embedding: [0, 1] },
                { index: 0, embedding: [1, 0] },
              ],
            }),
            { status: 200 },
          ),
      ),
    );
    const voyage = createVoyageEmbeddingProvider({ apiKey: 'test-only', dimensions: 2 });
    expect(await voyage.embed(['a', 'b'], 'document')).toEqual([
      [1, 0],
      [0, 1],
    ]);
  });

  it('fails loudly when Voyage refuses', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => new Response('nope', { status: 401 })),
    );
    await expect(
      createVoyageEmbeddingProvider({ apiKey: 'x' }).embed(['a'], 'query'),
    ).rejects.toThrow(/401/);
  });

  it('chooses the provider from the environment and refuses local embeddings in production', () => {
    expect(createEmbeddingProvider({}).name).toMatch(/hash/);
    expect(
      createEmbeddingProvider({ EMBEDDING_PROVIDER: 'voyage', VOYAGE_API_KEY: 'k' }).name,
    ).toMatch(/voyage/);
    expect(() => createEmbeddingProvider({ NODE_ENV: 'production' })).toThrow(/VOYAGE_API_KEY/);
  });
});

describe('corpus ingestion', () => {
  it('chunks and embeds markdown sources and skips files that need converting', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'wes-corpus-'));
    writeFileSync(
      join(dir, 'sources.yaml'),
      [
        'corpus_version: 1.2.3',
        'sources:',
        '  - slug: guide',
        '    title: Test guide',
        '    publisher: Test publisher',
        '    kind: guidance',
        '    path: guide.md',
        '    url: null',
        '    licence: test',
        '  - slug: scan',
        '    title: Scanned PDF',
        '    publisher: Test publisher',
        '    kind: guidance',
        '    path: scan.pdf',
        '    url: null',
        '    licence: test',
      ].join('\n'),
    );
    writeFileSync(
      join(dir, 'guide.md'),
      '# Guide\n\n## Health\n\nWash hands often.\n\n## Safety\n\nKeep exits clear.\n',
    );
    const stored: StoredSource[] = [];
    const report = await ingestCorpus({
      dir,
      embedder: createHashEmbeddingProvider(),
      store: async (s) => {
        stored.push(s);
        return 'inserted';
      },
    });
    expect(report.corpusVersion).toBe('1.2.3');
    expect(report.results).toEqual([
      { slug: 'guide', chunks: expect.any(Number), outcome: 'inserted' },
      { slug: 'scan', chunks: 0, outcome: 'skipped: convert to text/markdown first' },
    ]);
    expect(stored[0]!.isPlaceholder).toBe(false);
    expect(stored[0]!.chunks.every((c) => c.embedding.length > 0)).toBe(true);
  });
});

describe('tool loop', () => {
  const echo = defineTool({
    name: 'create_reminder',
    description: 'test tool',
    input: z.object({ message: z.string(), dueDate: z.string() }),
    roles: ['principal'],
    async run(input) {
      return { saved: input.message };
    },
  });

  const ctx = (): ToolContext => ({
    centreId: 'c',
    userId: 'u',
    role: 'principal',
    services: {
      searchKnowledge: async () => [],
      complianceChecklist: async () => [],
      createReminder: async () => ({ id: 'r' }),
    },
    hits: [],
    escalationRequested: false,
  });

  function scripted(turns: Partial<TurnResult>[]): ModelClient & { seenTools: number[] } {
    const seenTools: number[] = [];
    let i = 0;
    return {
      mode: 'live',
      seenTools,
      async classify() {
        return {
          classification: null,
          usage: {
            inputTokens: 0,
            outputTokens: 0,
            cacheReadTokens: 0,
            cacheWriteTokens: 0,
            costMicroUsd: 0,
          } as never,
        };
      },
      async turn(req) {
        seenTools.push(req.tools.length);
        const t = turns[Math.min(i, turns.length - 1)]!;
        i += 1;
        return {
          stopReason: 'tool_use',
          text: '',
          toolCalls: [],
          assistantContent: [],
          usage: {
            inputTokens: 10,
            outputTokens: 5,
            cacheReadTokens: 0,
            cacheWriteTokens: 0,
            costMicroUsd: 1,
          } as never,
          servedBy: 'claude-sonnet-5-5',
          ...t,
        } as TurnResult;
      },
    };
  }

  it('runs tools, rejects bad input and unknown tools, then stops at the budget', async () => {
    const call = (name: string, input: unknown, id: string) => ({ id, name, input });
    const model = scripted([
      { toolCalls: [call('create_reminder', { message: 'renew', dueDate: '2026-11-01' }, 't1')] },
      { toolCalls: [call('create_reminder', { message: 42 }, 't2')] },
      { toolCalls: [call('no_such_tool', {}, 't3')] },
      { toolCalls: [call('create_reminder', { message: 'again', dueDate: '2026-11-02' }, 't4')] },
      { stopReason: 'end_turn', text: 'Done.' },
    ]);
    const res = await generate({
      model,
      config: { ...config, maxToolCallsPerTurn: 3 },
      system: [],
      messages: [{ role: 'user', content: 'remind me' }],
      tools: [echo],
      ctx: ctx(),
    });
    expect(res.toolCalls.map((t) => t.ok)).toEqual([true, false, false, false]);
    // After three tool calls the next turn gets no tools, forcing an answer.
    expect(model.seenTools.at(-1)).toBe(0);
    expect(res.servedBy).toBe('claude-sonnet-5-5');
  });

  it('never runs a tool call cut off at max_tokens', async () => {
    const model = scripted([
      {
        stopReason: 'max_tokens',
        toolCalls: [{ id: 't', name: 'create_reminder', input: { message: 'x' } }],
      },
    ]);
    const res = await generate({
      model,
      config,
      system: [],
      messages: [{ role: 'user', content: 'x' }],
      tools: [echo],
      ctx: ctx(),
    });
    expect(res.stop).toBe('max_tokens');
    expect(res.toolCalls).toEqual([]);
  });
});

describe('the full tool catalogue', () => {
  it('implements every tool, keeps child-data tools from parents, and resolves name tokens', async () => {
    const { TOOLS, TOOL_NAMES, toolsForRole } = await import('../src');
    expect(TOOLS.map((t) => t.name).sort()).toEqual([...TOOL_NAMES].sort());
    const parent = toolsForRole('parent').map((t) => t.name);
    for (const name of [
      'record_attendance',
      'get_child_summary',
      'create_weekly_plan',
      'generate_policy_draft',
    ]) {
      expect(parent).not.toContain(name);
    }
    expect(toolsForRole('practitioner').map((t) => t.name)).not.toContain('generate_policy_draft');

    const seen: unknown[] = [];
    const tool = TOOLS.find((t) => t.name === 'record_attendance')!;
    await tool.run(
      { day: null, marks: [{ name: '⟦CHILD_ab12⟧', status: 'present' }] },
      {
        centreId: 'c',
        userId: 'u',
        role: 'practitioner',
        hits: [],
        escalationRequested: false,
        resolveName: (n: string) => (n === '⟦CHILD_ab12⟧' ? 'Lwazi' : n),
        services: {
          searchKnowledge: async () => [],
          complianceChecklist: async () => [],
          createReminder: async () => ({ id: 'r' }),
          recordAttendance: async (input) => {
            seen.push(input);
            return { saved: 1, notFound: 0, ambiguous: 0, conflicts: 0, day: '2026-10-15' };
          },
        },
      },
    );
    expect(seen).toEqual([{ day: null, marks: [{ firstName: 'Lwazi', status: 'present' }] }]);
  });
});
