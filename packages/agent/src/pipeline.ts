import { heuristicClassify } from './classify';
import type { AgentConfig } from './config';
import { generate } from './generate';
import { ModelUnavailableError, type ConversationMessage, type ModelClient } from './model';
import { postCheck } from './postcheck';
import { buildSystem, ROUTER_SYSTEM } from './prompts';
import { createRedactor, createStreamingRestorer, restore, type KnownNames } from './redact';
import { escalationMessage, maxRisk, precheck } from './safety';
import { toolsForRole, type ToolContext, type ToolServices } from './tools';
import { addUsage, ZERO_USAGE, type AgentReply, type Channel, type Classification } from './types';

/**
 * The Wes pipeline (CLAUDE.md §5). The order is fixed here, so no stage can skip the safety gate:
 *
 *   1 redact → 2 classify (+ deterministic safety pre-check) → 3 safety gate → 4–5 plan, act and
 *   ground → 6 post-check → restore names → 7 persist (by the caller, from the returned reply)
 */
export interface WesDeps {
  config: AgentConfig;
  model: ModelClient;
  now: () => Date;
}

export interface WesTurnInput {
  text: string;
  centreId: string;
  centreName: string;
  userId: string;
  role: 'principal' | 'practitioner' | 'parent';
  channel: Channel;
  safeguardingName?: string | null;
  knownNames: KnownNames;
  /** Earlier turns, already redacted, oldest first. */
  history: { role: 'user' | 'assistant'; text: string }[];
  services: ToolServices;
  /** Tokens left in this centre's monthly budget. */
  budgetRemaining: number;
  /** Restored text deltas as the answer is written. */
  onDelta?: (text: string) => void;
}

export const BUDGET_REPLY =
  'Your centre has used this month’s Wes allowance. It renews on the 1st. Your plans, documents and register still work as normal.';

export const UNAVAILABLE_REPLY = 'Wes is very busy right now. Please try again in a minute.';

export const REFUSAL_REPLY =
  'I can’t help with that one. Ask me anything else about running your centre.';

function historyMessages(history: WesTurnInput['history'], text: string): ConversationMessage[] {
  const out: { role: 'user' | 'assistant'; content: string }[] = [];
  for (const h of history.slice(-12)) {
    const last = out.at(-1);
    if (last && last.role === h.role) last.content += `\n\n${h.text}`;
    else out.push({ role: h.role, content: h.text });
  }
  while (out[0]?.role === 'assistant') out.shift();
  const last = out.at(-1);
  if (last?.role === 'user') last.content += `\n\n${text}`;
  else out.push({ role: 'user', content: text });
  return out;
}

export function createWes(deps: WesDeps) {
  const { config, model } = deps;

  return {
    async respond(input: WesTurnInput): Promise<AgentReply> {
      const redactor = createRedactor(input.centreId, input.knownNames);

      // 1. Redact before anything leaves this process.
      const red = redactor.redact(input.text);
      const vault = { ...redactor.fullVault(), ...red.vault };

      // 3a. Deterministic safety rules run on the original text, locally.
      const safety = precheck(input.text);
      let usage = ZERO_USAGE;
      let routerModel: string | null = null;

      const reply = (
        partial: Pick<AgentReply, 'text' | 'escalated' | 'classification'> & Partial<AgentReply>,
      ): AgentReply => ({
        citations: [],
        postCheck: {
          citationsPresent: 'not_required',
          bannedContent: [],
          readingLevelOk: true,
          replaced: false,
        },
        usage,
        toolCalls: [],
        models: { router: routerModel, main: null },
        redactedText: red.text,
        ...partial,
      });

      const escalate = (
        classification: Classification,
        extra: Partial<AgentReply> = {},
      ): AgentReply => {
        const text = escalationMessage({ safeguardingName: input.safeguardingName });
        input.onDelta?.(text);
        return reply({
          text,
          escalated: true,
          classification: { ...classification, risk: 'child_protection' },
          ...extra,
        });
      };

      // 3b. Child-protection disclosures never reach a model.
      if (safety.childProtection) return escalate(heuristicClassify(input.text, safety));

      if (input.budgetRemaining <= 0) {
        input.onDelta?.(BUDGET_REPLY);
        return reply({
          text: BUDGET_REPLY,
          escalated: false,
          classification: heuristicClassify(input.text, safety),
        });
      }

      // 2. Classify with the router model; fall back to heuristics. Risk can only go up.
      let classification = heuristicClassify(red.text, safety);
      if (model.mode === 'live') {
        try {
          routerModel = config.models.router;
          const r = await model.classify({
            model: config.models.router,
            system: ROUTER_SYSTEM,
            text: red.text,
          });
          usage = addUsage(usage, r.usage);
          if (r.classification) classification = r.classification;
        } catch {
          // Heuristics already in place.
        }
      }
      let risk = maxRisk(classification.risk, safety.risk);
      if (safety.diagnosisRequest) risk = maxRisk(risk, 'sensitive');
      classification = { ...classification, risk };

      // 3c. The router may detect a disclosure the rules missed.
      if (classification.risk === 'child_protection') return escalate(classification);

      // 4–5. Plan, act, ground.
      const ctx: ToolContext = {
        centreId: input.centreId,
        userId: input.userId,
        role: input.role,
        services: input.services,
        hits: [],
        escalationRequested: false,
        resolveName: (name) => restore(name, vault).trim(),
      };
      const restorer = createStreamingRestorer(vault);
      let gen;
      try {
        gen = await generate({
          model,
          config,
          system: buildSystem({
            centreName: input.centreName,
            role: input.role,
            channel: input.channel,
            todayIso: deps.now().toISOString().slice(0, 10),
            language: classification.language,
          }),
          messages: historyMessages(input.history, red.text),
          tools: toolsForRole(input.role),
          ctx,
          onText: input.onDelta ? (d) => input.onDelta!(restorer.push(d)) : undefined,
        });
      } catch (err) {
        input.onDelta?.(UNAVAILABLE_REPLY);
        return reply({
          text: UNAVAILABLE_REPLY,
          escalated: false,
          classification,
          error: err instanceof ModelUnavailableError ? err.message : 'generation failed',
        });
      }
      if (input.onDelta) {
        const tail = restorer.flush();
        if (tail) input.onDelta(tail);
      }
      usage = addUsage(usage, gen.usage);
      const common = {
        toolCalls: gen.toolCalls,
        models: { router: routerModel, main: gen.servedBy },
      };

      if (ctx.escalationRequested) return escalate(classification, { ...common, usage });
      if (gen.stop === 'refusal') {
        return reply({ text: REFUSAL_REPLY, escalated: false, classification, ...common, usage });
      }

      // 6. Post-check, then put real names back.
      const checked = postCheck({ text: gen.text, classification, hits: ctx.hits });
      return reply({
        text: restore(checked.text, vault),
        escalated: false,
        classification,
        citations: checked.citations,
        postCheck: checked.result,
        ...common,
        usage,
      });
    },
  };
}
