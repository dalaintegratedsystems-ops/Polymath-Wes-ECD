import { describe, expect, it } from 'vitest';
import { costMicroUsd, loadAgentConfig, TOOL_NAMES, TOOLS, toToolDef } from '../src';

describe('agent config', () => {
  it('defaults to the configured model family and offline without a key', () => {
    const c = loadAgentConfig({});
    expect(c.models).toEqual({
      router: 'claude-haiku-5-5',
      main: 'claude-sonnet-5-5',
      escalation: 'claude-opus-5-5',
    });
    expect(c.maxToolCallsPerTurn).toBe(6);
    expect(c.mode).toBe('offline');
  });

  it('goes live when a real key is present, but not for a placeholder', () => {
    expect(loadAgentConfig({ ANTHROPIC_API_KEY: 'sk-ant-test' }).mode).toBe('live');
    expect(loadAgentConfig({ ANTHROPIC_API_KEY: '<<ANTHROPIC_API_KEY>>' }).mode).toBe('offline');
  });

  it('reads models from the environment', () => {
    expect(loadAgentConfig({ WES_MODEL_MAIN: 'custom-model' }).models.main).toBe('custom-model');
  });
});

describe('tools', () => {
  it('keeps the full twelve-tool catalogue and exposes strict schemas', () => {
    expect(TOOL_NAMES).toHaveLength(12);
    for (const t of TOOLS) {
      const def = toToolDef(t);
      expect(def.strict).toBe(true);
      expect(def.input_schema).toMatchObject({ type: 'object', additionalProperties: false });
    }
  });
});

describe('cost accounting', () => {
  it('prices tokens per model, with cheap cache reads', () => {
    // 1,000 in + 500 out on Sonnet 5.5 = $0.002 + $0.005 = 7,000 micro-dollars.
    expect(
      costMicroUsd('claude-sonnet-5-5', { input: 1000, output: 500, cacheRead: 0, cacheWrite: 0 }),
    ).toBe(7000);
    expect(
      costMicroUsd('claude-sonnet-5-5', { input: 0, output: 0, cacheRead: 10_000, cacheWrite: 0 }),
    ).toBe(2000);
    expect(costMicroUsd('unknown', { input: 1, output: 1, cacheRead: 0, cacheWrite: 0 })).toBe(0);
  });
});
