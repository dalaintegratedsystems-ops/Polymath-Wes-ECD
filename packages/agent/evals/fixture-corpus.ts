import type { KnowledgeHit, ToolServices } from '../src';

/**
 * EVAL FIXTURE corpus. These excerpts are invented test material to exercise retrieval and
 * citations. They are NOT official NCF, ELDA or registration content and must never be shown
 * to users or copied into knowledge/.
 */
const FIXTURE: KnowledgeHit[] = [
  {
    sourceSlug: 'eval-fixture-registration',
    title: 'EVAL FIXTURE — Registration guide (not official)',
    anchor: 'Documents',
    content:
      'EVAL FIXTURE. A centre applying for registration keeps its policies, staff records and health documents together in one file.',
    corpusVersion: 'eval',
  },
  {
    sourceSlug: 'eval-fixture-registration',
    title: 'EVAL FIXTURE — Registration guide (not official)',
    anchor: 'Policies',
    content:
      'EVAL FIXTURE. Written policies cover admissions, health, safety and child protection.',
    corpusVersion: 'eval',
  },
  {
    sourceSlug: 'eval-fixture-curriculum',
    title: 'EVAL FIXTURE — Curriculum notes (not official)',
    anchor: 'Play-based learning',
    content:
      'EVAL FIXTURE. Young children learn through play, songs, stories and everyday routines.',
    corpusVersion: 'eval',
  },
  {
    sourceSlug: 'eval-fixture-curriculum',
    title: 'EVAL FIXTURE — Curriculum notes (not official)',
    anchor: 'Themes',
    content:
      'EVAL FIXTURE. A weekly theme such as water or animals links activities across the week.',
    corpusVersion: 'eval',
  },
];

const STOP = new Set([
  'what',
  'which',
  'with',
  'that',
  'this',
  'have',
  'need',
  'does',
  'from',
  'your',
  'about',
  'should',
  'there',
]);

function words(text: string): Set<string> {
  return new Set(
    (text.toLowerCase().match(/[\p{L}]+/gu) ?? []).filter((w) => w.length > 3 && !STOP.has(w)),
  );
}

/** Tool services for evals: keyword search over the fixture (or nothing), no side effects. */
export function evalToolServices(corpus: 'fixture' | 'empty'): ToolServices {
  return {
    async searchKnowledge(query, limit) {
      if (corpus === 'empty') return [];
      const q = words(query);
      return FIXTURE.map((h) => ({
        h,
        score: [...words(`${h.anchor} ${h.content}`)].filter((w) => q.has(w)).length,
      }))
        .filter((x) => x.score > 0)
        .sort((a, b) => b.score - a.score)
        .slice(0, limit)
        .map((x) => x.h);
    },
    async complianceChecklist() {
      return [];
    },
    async createReminder() {
      return { id: 'eval-reminder' };
    },
  };
}
