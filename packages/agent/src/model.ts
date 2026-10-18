import Anthropic from '@anthropic-ai/sdk';
import type { z } from 'zod';
import { zodOutputFormat } from '@anthropic-ai/sdk/helpers/zod';
import { MODEL_PRICES, type AgentConfig } from './config';
import { ClassificationSchema, type Classification, type Usage } from './types';

/**
 * The model boundary. The pipeline only talks to `ModelClient`, so the live Anthropic client,
 * the deterministic offline client and test doubles are interchangeable.
 */
export type SystemBlock = Anthropic.Beta.BetaTextBlockParam;
export type ConversationMessage = Anthropic.Beta.BetaMessageParam;
export type ToolDef = Anthropic.Beta.BetaTool;

export interface TurnRequest {
  model: string;
  system: SystemBlock[];
  messages: ConversationMessage[];
  tools: ToolDef[];
  maxTokens: number;
  effort: AgentConfig['mainEffort'];
  /** Receives visible text deltas as the model writes. */
  onText?: (delta: string) => void;
}

export interface TurnResult {
  stopReason: 'end_turn' | 'tool_use' | 'max_tokens' | 'refusal' | 'other';
  text: string;
  toolCalls: { id: string; name: string; input: unknown }[];
  /** The assistant content exactly as returned, to append unchanged to the next request. */
  assistantContent: ConversationMessage['content'];
  usage: Usage;
  servedBy: string;
}

export interface ModelClient {
  readonly mode: 'live' | 'offline';
  classify(req: {
    model: string;
    system: string;
    text: string;
  }): Promise<{ classification: Classification | null; usage: Usage }>;
  turn(req: TurnRequest): Promise<TurnResult>;
  /**
   * One structured answer validated against a Zod schema (planner, activity adaptation).
   * Offline clients leave this out, so callers fall back to their deterministic path.
   */
  structured?<T>(req: {
    model: string;
    system: string;
    prompt: string;
    schema: z.ZodType<T>;
    maxTokens: number;
    effort: AgentConfig['mainEffort'];
  }): Promise<{ value: T | null; usage: Usage }>;
}

/** Thrown when the model can't be reached or rejected the request; the pipeline answers kindly. */
export class ModelUnavailableError extends Error {
  constructor(
    message: string,
    readonly retryable: boolean,
  ) {
    super(message);
    this.name = 'ModelUnavailableError';
  }
}

export function costMicroUsd(
  model: string,
  u: { input: number; output: number; cacheRead: number; cacheWrite: number },
): number {
  const p = MODEL_PRICES[model];
  if (!p) return 0;
  // $/MTok × tokens = micro-dollars. Cache reads bill at 0.1× input, writes at 1.25×.
  return Math.round(
    u.input * p.input +
      u.output * p.output +
      u.cacheRead * p.input * 0.1 +
      u.cacheWrite * p.input * 1.25,
  );
}

function toUsage(
  model: string,
  usage: {
    input_tokens: number;
    output_tokens: number;
    cache_read_input_tokens?: number | null;
    cache_creation_input_tokens?: number | null;
  },
): Usage {
  const u = {
    input: usage.input_tokens,
    output: usage.output_tokens,
    cacheRead: usage.cache_read_input_tokens ?? 0,
    cacheWrite: usage.cache_creation_input_tokens ?? 0,
  };
  return {
    inputTokens: u.input,
    outputTokens: u.output,
    cacheReadTokens: u.cacheRead,
    cacheWriteTokens: u.cacheWrite,
    costMicroUsd: costMicroUsd(model, u),
  };
}

function wrapError(err: unknown): never {
  if (err instanceof Anthropic.RateLimitError)
    throw new ModelUnavailableError('rate limited', true);
  if (err instanceof Anthropic.AuthenticationError)
    throw new ModelUnavailableError('authentication failed', false);
  if (err instanceof Anthropic.BadRequestError)
    throw new ModelUnavailableError(`bad request: ${err.message}`, false);
  if (err instanceof Anthropic.APIConnectionError)
    throw new ModelUnavailableError('connection failed', true);
  if (err instanceof Anthropic.APIError)
    throw new ModelUnavailableError(`api error ${err.status}`, (err.status ?? 500) >= 500);
  throw err;
}

/** Live Claude via the official SDK (Claude API). */
export function createAnthropicModelClient(config: AgentConfig): ModelClient {
  const client = new Anthropic({ apiKey: config.anthropicApiKey, maxRetries: 2, timeout: 60_000 });

  return {
    mode: 'live',

    async classify({ model, system, text }) {
      try {
        const res = await client.messages.parse({
          model,
          max_tokens: 1024,
          system,
          messages: [{ role: 'user', content: text }],
          output_config: { format: zodOutputFormat(ClassificationSchema), effort: 'low' },
        });
        return {
          classification: res.stop_reason === 'refusal' ? null : (res.parsed_output ?? null),
          usage: toUsage(model, res.usage),
        };
      } catch (err) {
        wrapError(err);
      }
    },

    async structured({ model, system, prompt, schema, maxTokens, effort }) {
      try {
        const res = await client.messages.parse({
          model,
          max_tokens: maxTokens,
          system,
          messages: [{ role: 'user', content: prompt }],
          output_config: { format: zodOutputFormat(schema), effort },
        });
        return {
          value: res.stop_reason === 'refusal' ? null : (res.parsed_output ?? null),
          usage: toUsage(model, res.usage),
        };
      } catch (err) {
        wrapError(err);
      }
    },

    async turn(req) {
      try {
        const stream = client.beta.messages.stream({
          model: req.model,
          max_tokens: req.maxTokens,
          system: req.system,
          messages: req.messages,
          tools: req.tools,
          output_config: { effort: req.effort },
          ...(config.refusalFallback === 'default'
            ? { betas: ['server-side-fallback-2026-07-01'], fallbacks: 'default' as const }
            : {}),
        });
        if (req.onText) stream.on('text', (delta) => req.onText!(delta));
        const message = await stream.finalMessage();

        const toolCalls = message.content
          .filter((b): b is Anthropic.Beta.BetaToolUseBlock => b.type === 'tool_use')
          .map((b) => ({ id: b.id, name: b.name, input: b.input }));
        const text = message.content
          .filter((b): b is Anthropic.Beta.BetaTextBlock => b.type === 'text')
          .map((b) => b.text)
          .join('');
        const stop = message.stop_reason;
        return {
          stopReason:
            stop === 'end_turn' ||
            stop === 'tool_use' ||
            stop === 'max_tokens' ||
            stop === 'refusal'
              ? stop
              : 'other',
          text,
          toolCalls,
          assistantContent: message.content as ConversationMessage['content'],
          usage: toUsage(message.model, message.usage),
          servedBy: message.model,
        };
      } catch (err) {
        wrapError(err);
      }
    },
  };
}
