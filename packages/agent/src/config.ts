import { z } from 'zod';

/**
 * Model choices come from the environment, never from business logic (CLAUDE.md §5).
 * Defaults match .env.example so local development works out of the box.
 */
const AgentConfigSchema = z.object({
  WES_MODEL_ROUTER: z.string().default('claude-haiku-5-5'),
  WES_MODEL_MAIN: z.string().default('claude-sonnet-5-5'),
  WES_MODEL_ESCALATION: z.string().default('claude-opus-5-5'),
  /** Effort for the main model. Chat-style answers do well at low/medium (re-tune with evals). */
  WES_MAIN_EFFORT: z.enum(['low', 'medium', 'high', 'xhigh', 'max']).default('medium'),
  WES_MAX_TOOL_CALLS: z.coerce.number().int().min(1).max(20).default(6),
  WES_MAX_OUTPUT_TOKENS: z.coerce.number().int().min(256).default(4000),
  WES_MONTHLY_TOKEN_BUDGET_PER_CENTRE: z.coerce.number().int().positive().default(2_000_000),
  /** WhatsApp replies must stay under this length (CLAUDE.md §5). */
  WES_WHATSAPP_MAX_CHARS: z.coerce.number().int().default(1000),
  /**
   * 'live' calls Claude; 'offline' uses the deterministic offline model (dev, tests, CI evals).
   * Defaults to live when ANTHROPIC_API_KEY is set.
   */
  WES_MODEL_MODE: z.enum(['live', 'offline']).optional(),
  ANTHROPIC_API_KEY: z.string().optional(),
  /**
   * Server-side refusal fallback ('default' routes by refusal category). Claude API only —
   * set to 'off' when calling Claude through Microsoft Foundry, Bedrock or Vertex (ADR-0009).
   */
  WES_REFUSAL_FALLBACK: z.enum(['default', 'off']).default('default'),
});

/** USD per million tokens, for cost accounting. Update when prices change. */
export const MODEL_PRICES: Record<string, { input: number; output: number }> = {
  'claude-haiku-5-5': { input: 0.1, output: 0.5 },
  'claude-sonnet-5-5': { input: 2, output: 10 },
  'claude-opus-5-5': { input: 4, output: 20 },
};

export interface AgentConfig {
  mode: 'live' | 'offline';
  models: { router: string; main: string; escalation: string };
  mainEffort: 'low' | 'medium' | 'high' | 'xhigh' | 'max';
  maxToolCallsPerTurn: number;
  maxOutputTokens: number;
  monthlyTokenBudgetPerCentre: number;
  whatsappMaxChars: number;
  refusalFallback: 'default' | 'off';
  anthropicApiKey?: string;
}

export function loadAgentConfig(
  env: Record<string, string | undefined> = process.env,
): AgentConfig {
  const c = AgentConfigSchema.parse(env);
  const key =
    c.ANTHROPIC_API_KEY && !c.ANTHROPIC_API_KEY.startsWith('<<') ? c.ANTHROPIC_API_KEY : undefined;
  return {
    mode: c.WES_MODEL_MODE ?? (key ? 'live' : 'offline'),
    models: {
      router: c.WES_MODEL_ROUTER,
      main: c.WES_MODEL_MAIN,
      escalation: c.WES_MODEL_ESCALATION,
    },
    mainEffort: c.WES_MAIN_EFFORT,
    maxToolCallsPerTurn: c.WES_MAX_TOOL_CALLS,
    maxOutputTokens: c.WES_MAX_OUTPUT_TOKENS,
    monthlyTokenBudgetPerCentre: c.WES_MONTHLY_TOKEN_BUDGET_PER_CENTRE,
    whatsappMaxChars: c.WES_WHATSAPP_MAX_CHARS,
    refusalFallback: c.WES_REFUSAL_FALLBACK,
    ...(key ? { anthropicApiKey: key } : {}),
  };
}
