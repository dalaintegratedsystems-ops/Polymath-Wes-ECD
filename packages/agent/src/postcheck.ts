import { PROMPT_CANARY } from './prompts';
import { DIAGNOSTIC_ASSERTIONS } from './safety';
import type { KnowledgeHit } from './tools';
import type { Citation, Classification, PostCheckResult } from './types';

/**
 * Post-check (pipeline stage 6). Last line of defence on what the model wrote:
 * - no diagnosing or labelling a child
 * - no leaked system prompt
 * - claims that need sources must carry real citations, or the answer becomes "I couldn't find it"
 * - plain-language reading level (reported, not blocking)
 */
export const NO_SOURCE_REPLY =
  'I couldn’t find this in the official documents I have, so I won’t guess. Your district ECD office or a local ECD support organisation can confirm it for you.';

export const NO_DIAGNOSIS_REPLY = [
  'I can’t say whether a child has a condition — only a health professional can do that.',
  '',
  'What helps:',
  '1. Write down what you notice, when it happens, and for how long.',
  '2. Talk with the parents or caregivers kindly, and share what you’ve seen.',
  '3. Suggest they visit the clinic nurse or a doctor, who can refer them if needed.',
].join('\n');

export const LEAK_REPLY =
  'I can’t share how I work, but I’m happy to help with your centre. What do you need?';

export function readingLevelOk(text: string): boolean {
  const sentences = text
    .replace(/\[\d+\]/g, '')
    .split(/(?<=[.!?])\s+|\n+/)
    .map((s) => s.trim())
    .filter((s) => s.split(/\s+/).length > 2);
  if (sentences.length === 0) return true;
  const lengths = sentences.map((s) => s.split(/\s+/).length);
  const avg = lengths.reduce((a, b) => a + b, 0) / lengths.length;
  return avg <= 22 && Math.max(...lengths) <= 45;
}

export function postCheck(input: {
  text: string;
  classification: Classification;
  hits: (KnowledgeHit & { n: number })[];
}): { text: string; citations: Citation[]; result: PostCheckResult } {
  let text = input.text;
  const banned: string[] = [];

  if (text.includes(PROMPT_CANARY)) {
    banned.push('system_prompt_leak');
    return {
      text: LEAK_REPLY,
      citations: [],
      result: {
        citationsPresent: 'not_required',
        bannedContent: banned,
        readingLevelOk: true,
        replaced: true,
      },
    };
  }
  for (const re of DIAGNOSTIC_ASSERTIONS) {
    if (re.test(text)) {
      banned.push('diagnosis');
      return {
        text: NO_DIAGNOSIS_REPLY,
        citations: [],
        result: {
          citationsPresent: 'not_required',
          bannedContent: banned,
          readingLevelOk: true,
          replaced: true,
        },
      };
    }
  }

  // Keep only markers that point at a real search hit; drop invented ones.
  const used = new Set<number>();
  text = text.replace(/\s?\[(\d{1,2})\]/g, (m, num: string) => {
    const n = Number(num);
    if (input.hits.some((h) => h.n === n)) {
      used.add(n);
      return m;
    }
    return '';
  });
  const citations: Citation[] = input.hits
    .filter((h) => used.has(h.n))
    .map((h) => ({
      n: h.n,
      sourceSlug: h.sourceSlug,
      title: h.title,
      anchor: h.anchor,
      corpusVersion: h.corpusVersion,
    }));

  const needsSources = input.classification.needsSources;
  const saysNotFound = /couldn’t find|could not find|couldn't find/i.test(text);
  if (needsSources && citations.length === 0 && !saysNotFound) {
    return {
      text: NO_SOURCE_REPLY,
      citations: [],
      result: {
        citationsPresent: false,
        bannedContent: banned,
        readingLevelOk: true,
        replaced: true,
      },
    };
  }

  return {
    text,
    citations,
    result: {
      citationsPresent: needsSources ? citations.length > 0 : 'not_required',
      bannedContent: banned,
      readingLevelOk: readingLevelOk(text),
      replaced: false,
    },
  };
}
