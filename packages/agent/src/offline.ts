import { heuristicClassify } from './classify';
import type { ConversationMessage, ModelClient, TurnRequest, TurnResult } from './model';
import { precheck } from './safety';
import { ZERO_USAGE } from './types';

/**
 * Deterministic stand-in for Claude, used in development without an API key, in tests and in
 * CI evals. It follows the same contract (tool calls, streaming, citations) but never invents
 * content: it either quotes the official documents it was given or says it can't help yet.
 */
export const OFFLINE_NOTE =
  '(Wes is in offline mode, so answers come straight from the documents.)';

function lastUserText(messages: ConversationMessage[]): string {
  for (let i = messages.length - 1; i >= 0; i -= 1) {
    const m = messages[i]!;
    if (m.role !== 'user') continue;
    if (typeof m.content === 'string') return m.content;
    const text = m.content.find((b) => b.type === 'text');
    if (text && text.type === 'text') return text.text;
  }
  return '';
}

function toolResultsOf(message: ConversationMessage | undefined): string[] {
  if (!message || message.role !== 'user' || typeof message.content === 'string') return [];
  return message.content.flatMap((b) => {
    if (b.type !== 'tool_result') return [];
    return [typeof b.content === 'string' ? b.content : JSON.stringify(b.content)];
  });
}

function firstSentences(text: string, max = 2): string {
  const parts = text
    .replace(/\s+/g, ' ')
    .trim()
    .split(/(?<=[.!?])\s+/);
  return parts.slice(0, max).join(' ');
}

const REPLIES = {
  offTopic:
    'I’m here to help with running your ECD centre: registration, planning, printables, children and parents. I can’t help with that one, but ask me anything about your centre.',
  injection: 'I can’t change how I work, but I’m happy to help with your centre. What do you need?',
  diagnosis: [
    'I can’t say whether a child has a condition — only a health professional can do that.',
    '',
    'What helps:',
    '1. Write down what you notice, when it happens, and for how long.',
    '2. Talk with the parents or caregivers kindly, and share what you’ve seen.',
    '3. Suggest they visit the clinic nurse or a doctor, who can refer them if needed.',
  ].join('\n'),
  general: `I’m in offline mode right now, so I can only answer from the official documents I have. Try asking about registration, or come back when I’m fully connected.`,
};

function textTurn(text: string, req: TurnRequest): TurnResult {
  if (req.onText) for (const piece of text.match(/\S+\s*/g) ?? []) req.onText(piece);
  return {
    stopReason: 'end_turn',
    text,
    toolCalls: [],
    assistantContent: [{ type: 'text', text }],
    usage: ZERO_USAGE,
    servedBy: 'offline',
  };
}

export function createOfflineModelClient(): ModelClient {
  let callId = 0;
  return {
    mode: 'offline',

    async classify() {
      // The pipeline falls back to the same heuristics.
      return { classification: null, usage: ZERO_USAGE };
    },

    async turn(req) {
      const results = toolResultsOf(req.messages.at(-1));
      const question = lastUserText(req.messages);

      // Second turn: answer from the search results, quoting and citing them.
      if (results.length > 0) {
        const parsed = results.map((r) => {
          try {
            return JSON.parse(r) as {
              results?: { n: number; source: string; excerpt: string }[];
              started?: boolean;
            };
          } catch {
            return {};
          }
        });
        if (parsed.some((p) => p.started)) return textTurn('', req);
        const hits = parsed.flatMap((p) => p.results ?? []);
        if (hits.length === 0) {
          return textTurn(
            'I couldn’t find this in the official documents I have, so I won’t guess. Your district ECD office or a local ECD support organisation can confirm it for you.',
            req,
          );
        }
        const lines = hits.slice(0, 2).map((h) => `- ${firstSentences(h.excerpt)} [${h.n}]`);
        return textTurn(
          [`Here’s what the official documents say:`, '', ...lines, '', OFFLINE_NOTE].join('\n'),
          req,
        );
      }

      const safety = precheck(question);
      if (safety.childProtection && req.tools.some((t) => t.name === 'escalate_child_protection')) {
        callId += 1;
        return {
          stopReason: 'tool_use',
          text: '',
          toolCalls: [{ id: `offline_${callId}`, name: 'escalate_child_protection', input: {} }],
          assistantContent: [
            {
              type: 'tool_use',
              id: `offline_${callId}`,
              name: 'escalate_child_protection',
              input: {},
            },
          ],
          usage: ZERO_USAGE,
          servedBy: 'offline',
        };
      }
      if (safety.injectionAttempt) return textTurn(REPLIES.injection, req);
      if (safety.diagnosisRequest) return textTurn(REPLIES.diagnosis, req);

      const c = heuristicClassify(question, safety);
      if (c.intent === 'off_topic') return textTurn(REPLIES.offTopic, req);

      const canSearch = req.tools.some((t) => t.name === 'search_knowledge');
      if (canSearch && (c.needsSources || c.intent === 'registration' || c.intent === 'planning')) {
        callId += 1;
        const input = { query: question.slice(0, 300) };
        return {
          stopReason: 'tool_use',
          text: '',
          toolCalls: [{ id: `offline_${callId}`, name: 'search_knowledge', input }],
          assistantContent: [
            { type: 'tool_use', id: `offline_${callId}`, name: 'search_knowledge', input },
          ],
          usage: ZERO_USAGE,
          servedBy: 'offline',
        };
      }
      return textTurn(REPLIES.general, req);
    },
  };
}
