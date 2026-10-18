import { describe, expect, it } from 'vitest';
import { POLICY_KINDS, POLICY_QUESTIONS, type PolicyKind } from '@wes/shared';
import { draftPolicy, validateAnswers } from '../src/modules/compliance/policy-templates';

const ctx = { centreName: 'Test Centre', principalName: 'Nomsa', todayIso: '2026-10-18' };

/** A full set of answers: the first option for choices, a sentence otherwise. */
function answersFor(kind: PolicyKind): Record<string, string> {
  return Object.fromEntries(
    POLICY_QUESTIONS[kind].map((q) => [
      q.id,
      q.type === 'choice' ? q.options![0]!.value : `Answer for ${q.id.replace(/_/g, ' ')}.`,
    ]),
  );
}

describe('policy templates', () => {
  it.each(POLICY_KINDS)('drafts a %s policy from full answers with a review section', (kind) => {
    const answers = validateAnswers(kind, answersFor(kind));
    const { title, bodyMarkdown } = draftPolicy(kind, answers, ctx);
    expect(title.length).toBeGreaterThan(5);
    expect(bodyMarkdown).toContain('Test Centre');
    expect(bodyMarkdown).toContain('## Review');
    expect(bodyMarkdown).toContain('check it against the official requirements');
    // Every answer appears in the draft (choices as their label).
    for (const q of POLICY_QUESTIONS[kind].filter((x) => x.type !== 'choice')) {
      expect(bodyMarkdown).toContain(`Answer for ${q.id.replace(/_/g, ' ')}`);
    }
  });

  it.each(POLICY_KINDS)('drafts a %s policy with only the required answers', (kind) => {
    const required = Object.fromEntries(
      Object.entries(answersFor(kind)).filter(
        ([id]) => POLICY_QUESTIONS[kind].find((q) => q.id === id)!.required,
      ),
    );
    const { bodyMarkdown } = draftPolicy(kind, validateAnswers(kind, required), ctx);
    expect(bodyMarkdown).not.toContain('undefined');
  });

  it('refuses missing required answers and unknown choices', () => {
    expect(() => validateAnswers('health', {})).toThrow(/needed/);
    expect(() =>
      validateAnswers('safety', { ...answersFor('safety'), transport: 'by helicopter' }),
    ).toThrow(/options/);
  });
});
