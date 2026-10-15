import { describe, expect, it, vi } from 'vitest';
import { loadAgentConfig, runPipeline, TOOL_NAMES, type AgentReply, type PipelineStages } from '../src';

describe('agent config', () => {
  it('defaults to the configured model family', () => {
    const c = loadAgentConfig({});
    expect(c.models.main).toBe('claude-sonnet-5-5');
    expect(c.maxToolCallsPerTurn).toBe(6);
  });

  it('reads models from the environment', () => {
    expect(loadAgentConfig({ WES_MODEL_MAIN: 'custom-model' }).models.main).toBe('custom-model');
  });

  it('ships all twelve tools in the catalogue', () => {
    expect(TOOL_NAMES).toHaveLength(12);
  });
});

describe('pipeline ordering', () => {
  const reply: AgentReply = {
    text: 'ok',
    citations: [],
    attachments: [],
    escalated: false,
    postCheck: { schemaValid: true, citationsPresent: 'not_required', bannedContent: [], readingLevelOk: true },
  };

  const stages = (risk: 'normal' | 'child_protection'): PipelineStages => ({
    redact: vi.fn(async (m) => ({ text: m.text, vault: {} })),
    classify: vi.fn(async () => ({ intent: 'general' as const, language: 'en' as const, risk })),
    escalate: vi.fn(async () => ({ ...reply, escalated: true })),
    generate: vi.fn(async () => reply),
    postCheck: vi.fn(async () => reply.postCheck),
    restore: vi.fn((r) => r),
    persist: vi.fn(async () => {}),
  });

  const msg = { centreId: 'c', userId: 'u', conversationId: 'v', channel: 'web' as const, text: 'hi' };

  it('never calls generation for child-protection disclosures', async () => {
    const s = stages('child_protection');
    const out = await runPipeline(s, msg);
    expect(out.escalated).toBe(true);
    expect(s.generate).not.toHaveBeenCalled();
    expect(s.persist).toHaveBeenCalledOnce();
  });

  it('redacts before classifying and post-checks generated replies', async () => {
    const s = stages('normal');
    await runPipeline(s, msg);
    expect(vi.mocked(s.redact).mock.invocationCallOrder[0]).toBeLessThan(
      vi.mocked(s.classify).mock.invocationCallOrder[0]!,
    );
    expect(s.postCheck).toHaveBeenCalledOnce();
    expect(s.escalate).not.toHaveBeenCalled();
  });
});
