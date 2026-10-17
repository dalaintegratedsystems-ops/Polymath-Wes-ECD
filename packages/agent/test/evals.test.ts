import { describe, expect, it } from 'vitest';
import { loadCases } from '../evals/run';
import {
  caseScore,
  CATEGORIES,
  checkRules,
  gate,
  summarise,
  type CaseResult,
  type EvalCase,
} from '../evals/score';

const base: EvalCase = {
  id: 'registration-99',
  category: 'registration',
  input: 'x',
  role: 'principal',
  corpus: 'fixture',
  expect: { mustContain: [], mustNotContain: [], citations: 'any' },
};

const result = (over: Partial<CaseResult>): CaseResult => ({
  id: 'registration-01',
  category: 'registration',
  passed: true,
  failures: [],
  score: 1,
  ...over,
});

describe('eval cases', () => {
  const cases = loadCases();

  it('has at least 30 valid golden cases covering every category', () => {
    expect(cases.length).toBeGreaterThanOrEqual(30);
    expect(new Set(cases.map((c) => c.category))).toEqual(new Set(CATEGORIES));
  });

  it('uses unique ids that match their category', () => {
    expect(new Set(cases.map((c) => c.id)).size).toBe(cases.length);
    for (const c of cases) expect(c.id.startsWith(`${c.category}-`)).toBe(true);
  });
});

describe('rule checks', () => {
  it('checks escalation, patterns, citations and length', () => {
    const c: EvalCase = {
      ...base,
      expect: {
        escalated: false,
        mustContain: ["couldn[’']t find"],
        mustNotContain: ['R\\s?\\d+'],
        citations: 'none',
        maxChars: 50,
      },
    };
    expect(checkRules(c, { text: 'I couldn’t find it.', escalated: false, citations: [] })).toEqual(
      [],
    );
    const failures = checkRules(c, {
      text: 'It costs R24 per child, see [1]. '.repeat(3),
      escalated: true,
      citations: [{ n: 1 }],
    });
    expect(failures).toEqual([
      'escalated when it should not',
      "missing /couldn[’']t find/",
      'contains forbidden /R\\s?\\d+/',
      'unexpected citations',
      expect.stringMatching(/^too long/),
    ]);
  });

  it('requires citations when asked', () => {
    expect(
      checkRules(
        { ...base, expect: { ...base.expect, citations: 'required' } },
        { text: 'x', escalated: false, citations: [] },
      ),
    ).toEqual(['no citations']);
  });
});

describe('scoring and the CI gate', () => {
  it('blends rules (70%) with the rubric (30%) in live runs', () => {
    expect(caseScore(true)).toBe(1);
    expect(caseScore(false)).toBe(0);
    expect(
      caseScore(true, { helpfulness: 5, grounded: true, plainLanguage: true, notes: '' }),
    ).toBeCloseTo(1);
    expect(
      caseScore(true, { helpfulness: 1, grounded: false, plainLanguage: false, notes: '' }),
    ).toBeCloseTo(0.7);
  });

  it('summarises per category', () => {
    const s = summarise('offline', [
      result({}),
      result({ id: 'registration-02', passed: false, score: 0 }),
    ]);
    expect(s).toMatchObject({
      total: 2,
      passed: 1,
      overall: 50,
      categories: { registration: { total: 2, passed: 1, score: 50 } },
    });
  });

  it('fails on any safety failure, even with a perfect overall elsewhere', () => {
    const results = [
      result({}),
      result({
        id: 'diagnosis-01',
        category: 'diagnosis',
        passed: false,
        failures: ['missing /clinic/'],
        score: 0,
      }),
    ];
    const v = gate(summarise('offline', results), results, { offline: { overall: 0 }, live: null });
    expect(v.ok).toBe(false);
    expect(v.reasons[0]).toContain('diagnosis-01');
  });

  it('fails when the overall score drops more than 3 points below baseline', () => {
    const results = [result({ score: 0.95 })];
    expect(
      gate(summarise('offline', results), results, { offline: { overall: 98 }, live: null }).ok,
    ).toBe(true);
    expect(
      gate(summarise('offline', results), results, { offline: { overall: 99 }, live: null }).ok,
    ).toBe(false);
  });
});
