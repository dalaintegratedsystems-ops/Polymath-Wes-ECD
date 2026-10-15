import { describe, expect, it } from 'vitest';
import { demoSteps } from '../src/demo';
import { ageLabel, greetingFor, stepsLeftLabel } from '../src/format';
import { registrationPercent } from '../src/screens/RegistrationScreen';

describe('format', () => {
  const today = new Date('2026-10-15T09:00:00');

  it.each([
    ['2025-03', '1 yr 7 mths'],
    ['2026-01', '9 mths'],
    ['2024-10', '2 yrs'],
    ['2026-09', '1 mth'],
    ['2027-01', 'Not born yet'],
  ])('ageLabel(%s) = %s', (birth, expected) => {
    expect(ageLabel(birth, today)).toBe(expected);
  });

  it('greets by time of day', () => {
    expect(greetingFor(7)).toBe('morning');
    expect(greetingFor(13)).toBe('afternoon');
    expect(greetingFor(19)).toBe('evening');
  });

  it('pluralises steps left', () => {
    expect(stepsLeftLabel(1)).toBe('1 step left to submit your registration');
    expect(stepsLeftLabel(3)).toBe('3 steps left to submit your registration');
    expect(stepsLeftLabel(0)).toBe('Ready to submit your registration');
  });

  it('scores the registration journey, counting the current step as half', () => {
    expect(registrationPercent(demoSteps)).toBe(42);
    expect(registrationPercent([])).toBe(0);
    expect(registrationPercent(demoSteps.map((s) => ({ ...s, status: 'done' as const })))).toBe(
      100,
    );
  });
});
