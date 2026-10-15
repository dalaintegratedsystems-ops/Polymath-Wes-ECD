import { z } from 'zod';

/**
 * Model choices come from the environment, never from business logic (CLAUDE.md §5).
 * Defaults match .env.example so local development works out of the box.
 */
const AgentConfigSchema = z.object({
  WES_MODEL_ROUTER: z.string().default('claude-haiku-5-5'),
  WES_MODEL_MAIN: z.string().default('claude-sonnet-5-5'),
  WES_MODEL_ESCALATION: z.string().default('claude-opus-5-5'),
  WES_MAX_TOOL_CALLS: z.coerce.number().int().min(1).max(20).default(6),
  WES_MONTHLY_TOKEN_BUDGET_PER_CENTRE: z.coerce.number().int().positive().default(2_000_000),
  /** WhatsApp replies must stay under this length (CLAUDE.md §5). */
  WES_WHATSAPP_MAX_CHARS: z.coerce.number().int().default(1000),
});

export interface AgentConfig {
  models: { router: string; main: string; escalation: string };
  maxToolCallsPerTurn: number;
  monthlyTokenBudgetPerCentre: number;
  whatsappMaxChars: number;
}

export function loadAgentConfig(
  env: Record<string, string | undefined> = process.env,
): AgentConfig {
  const c = AgentConfigSchema.parse(env);
  return {
    models: {
      router: c.WES_MODEL_ROUTER,
      main: c.WES_MODEL_MAIN,
      escalation: c.WES_MODEL_ESCALATION,
    },
    maxToolCallsPerTurn: c.WES_MAX_TOOL_CALLS,
    monthlyTokenBudgetPerCentre: c.WES_MONTHLY_TOKEN_BUDGET_PER_CENTRE,
    whatsappMaxChars: c.WES_WHATSAPP_MAX_CHARS,
  };
}
