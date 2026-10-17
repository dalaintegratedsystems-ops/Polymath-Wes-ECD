import { z } from 'zod';

export type Channel = 'web' | 'whatsapp' | 'sms';
export type RiskLevel = 'normal' | 'sensitive' | 'child_protection';

export const INTENTS = [
  'registration',
  'planning',
  'printable',
  'attendance',
  'child_progress',
  'behaviour',
  'general',
  'off_topic',
] as const;

/** Router output (pipeline stage 2). Also the structured-output schema for the router model. */
export const ClassificationSchema = z.object({
  intent: z.enum(INTENTS),
  language: z.enum(['en', 'af', 'xh', 'zu', 'other']),
  risk: z.enum(['normal', 'sensitive', 'child_protection']),
  /** True when the question is about the NCF, ELDAs or registration rules: needs sources. */
  needsSources: z.boolean(),
});
export type Classification = z.infer<typeof ClassificationSchema>;

export interface Citation {
  /** Marker number used in the answer text, e.g. 1 for "[1]". */
  n: number;
  sourceSlug: string;
  title: string;
  anchor: string;
  corpusVersion: string;
}

export interface PostCheckResult {
  citationsPresent: boolean | 'not_required';
  bannedContent: string[];
  readingLevelOk: boolean;
  /** True when the post-check replaced the model's text with a safe fallback. */
  replaced: boolean;
}

export interface Usage {
  inputTokens: number;
  outputTokens: number;
  cacheReadTokens: number;
  cacheWriteTokens: number;
  costMicroUsd: number;
}

export const ZERO_USAGE: Usage = {
  inputTokens: 0,
  outputTokens: 0,
  cacheReadTokens: 0,
  cacheWriteTokens: 0,
  costMicroUsd: 0,
};

export function addUsage(a: Usage, b: Usage): Usage {
  return {
    inputTokens: a.inputTokens + b.inputTokens,
    outputTokens: a.outputTokens + b.outputTokens,
    cacheReadTokens: a.cacheReadTokens + b.cacheReadTokens,
    cacheWriteTokens: a.cacheWriteTokens + b.cacheWriteTokens,
    costMicroUsd: a.costMicroUsd + b.costMicroUsd,
  };
}

export interface ToolCallRecord {
  name: string;
  input: unknown;
  output: unknown;
  ok: boolean;
  latencyMs: number;
}

export interface AgentReply {
  /** Final text, already restored (real names back in). */
  text: string;
  citations: Citation[];
  escalated: boolean;
  classification: Classification;
  postCheck: PostCheckResult;
  usage: Usage;
  toolCalls: ToolCallRecord[];
  models: { router: string | null; main: string | null };
  /** Text as sent to/received from the model (redacted), for storage. */
  redactedText: string;
  error?: string;
}
