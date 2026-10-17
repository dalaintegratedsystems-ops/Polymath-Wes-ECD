import type { AgentConfig } from './config';
import type { ConversationMessage, ModelClient, SystemBlock, TurnResult } from './model';
import { toToolDef, type ToolContext, type ToolDefinition } from './tools';
import { addUsage, ZERO_USAGE, type ToolCallRecord, type Usage } from './types';

/**
 * Plan and act (pipeline stages 4–5): a manual tool-use loop so the safety rules stay in our
 * code — tools are validated with Zod, capped per turn, and an escalation request stops the loop.
 */
export interface GenerateResult {
  text: string;
  stop: TurnResult['stopReason'];
  toolCalls: ToolCallRecord[];
  usage: Usage;
  servedBy: string | null;
}

export async function generate(args: {
  model: ModelClient;
  config: AgentConfig;
  system: SystemBlock[];
  messages: ConversationMessage[];
  tools: ToolDefinition[];
  ctx: ToolContext;
  onText?: (delta: string) => void;
}): Promise<GenerateResult> {
  const { model, config, ctx } = args;
  const messages = [...args.messages];
  const toolDefs = args.tools.map(toToolDef);
  const byName = new Map(args.tools.map((t) => [t.name, t]));
  const records: ToolCallRecord[] = [];
  let usage = ZERO_USAGE;
  let servedBy: string | null = null;
  let text = '';

  for (let round = 0; ; round += 1) {
    // After the tool budget is spent, one last turn without tools forces a final answer.
    const allowTools = records.length < config.maxToolCallsPerTurn;
    const turn = await model.turn({
      model: config.models.main,
      system: args.system,
      messages,
      tools: allowTools ? toolDefs : [],
      maxTokens: config.maxOutputTokens,
      effort: config.mainEffort,
      onText: args.onText,
    });
    usage = addUsage(usage, turn.usage);
    servedBy = turn.servedBy;
    text += turn.text;

    if (turn.stopReason === 'refusal' || turn.toolCalls.length === 0) {
      return { text, stop: turn.stopReason, toolCalls: records, usage, servedBy };
    }
    if (turn.stopReason === 'max_tokens') {
      // A tool input cut off at max_tokens may parse as a valid partial object: never run it.
      return { text, stop: 'max_tokens', toolCalls: records, usage, servedBy };
    }

    messages.push({ role: 'assistant', content: turn.assistantContent });
    const results = await Promise.all(
      turn.toolCalls.map(async (call) => {
        const started = Date.now();
        const def = byName.get(call.name as ToolDefinition['name']);
        if (!def || !allowTools) {
          records.push({
            name: call.name,
            input: call.input,
            output: { error: 'unavailable' },
            ok: false,
            latencyMs: 0,
          });
          return {
            type: 'tool_result' as const,
            tool_use_id: call.id,
            is_error: true,
            content: 'That tool is not available. Answer with what you have.',
          };
        }
        const parsed = def.input.safeParse(call.input);
        if (!parsed.success) {
          records.push({
            name: call.name,
            input: call.input,
            output: { error: 'invalid_input' },
            ok: false,
            latencyMs: 0,
          });
          return {
            type: 'tool_result' as const,
            tool_use_id: call.id,
            is_error: true,
            content: `Invalid input: ${parsed.error.message}`,
          };
        }
        try {
          const output = await def.run(parsed.data, ctx);
          records.push({
            name: call.name,
            input: parsed.data,
            output,
            ok: true,
            latencyMs: Date.now() - started,
          });
          return {
            type: 'tool_result' as const,
            tool_use_id: call.id,
            content: JSON.stringify(output),
          };
        } catch {
          records.push({
            name: call.name,
            input: parsed.data,
            output: { error: 'failed' },
            ok: false,
            latencyMs: Date.now() - started,
          });
          return {
            type: 'tool_result' as const,
            tool_use_id: call.id,
            is_error: true,
            content: 'The tool failed. Tell the person you could not complete that step.',
          };
        }
      }),
    );
    // All results in one user message (keeps parallel tool use working).
    messages.push({ role: 'user', content: results });

    if (ctx.escalationRequested) {
      return { text: '', stop: 'end_turn', toolCalls: records, usage, servedBy };
    }
    if (round > config.maxToolCallsPerTurn + 1) {
      return { text, stop: 'other', toolCalls: records, usage, servedBy };
    }
  }
}
