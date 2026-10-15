import type { z } from 'zod';

/** The tool catalogue (CLAUDE.md §5). Each tool calls a domain service, never the database. */
export const TOOL_NAMES = [
  'search_knowledge',
  'get_compliance_checklist',
  'run_self_audit',
  'generate_policy_draft',
  'build_application_pack',
  'create_weekly_plan',
  'adapt_activity',
  'generate_printable',
  'record_attendance',
  'get_child_summary',
  'escalate_child_protection',
  'create_reminder',
] as const;
export type ToolName = (typeof TOOL_NAMES)[number];

export interface ToolContext {
  centreId: string;
  userId: string;
  role: string;
  requestId: string;
}

export interface ToolDefinition<I extends z.ZodType = z.ZodType, O extends z.ZodType = z.ZodType> {
  name: ToolName;
  description: string;
  input: I;
  output: O;
  /** Roles allowed to trigger this tool through Wes. */
  roles: readonly string[];
  run(input: z.infer<I>, ctx: ToolContext): Promise<z.infer<O>>;
}

export function defineTool<I extends z.ZodType, O extends z.ZodType>(
  def: ToolDefinition<I, O>,
): ToolDefinition<I, O> {
  return def;
}
