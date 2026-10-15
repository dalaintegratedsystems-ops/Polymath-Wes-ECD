/** Plain-language age from a birth month, e.g. "2 yrs 4 mths" or "9 mths". */
export function ageLabel(birthMonth: string, today: Date = new Date()): string {
  const [y, m] = birthMonth.split('-').map(Number) as [number, number];
  const months = (today.getFullYear() - y) * 12 + (today.getMonth() + 1 - m);
  if (months < 0) return 'Not born yet';
  const yrs = Math.floor(months / 12);
  const mths = months % 12;
  if (yrs === 0) return `${mths} ${mths === 1 ? 'mth' : 'mths'}`;
  const yPart = `${yrs} ${yrs === 1 ? 'yr' : 'yrs'}`;
  return mths === 0 ? yPart : `${yPart} ${mths} ${mths === 1 ? 'mth' : 'mths'}`;
}

export type GreetingKey = 'morning' | 'afternoon' | 'evening';

export function greetingFor(hour: number): GreetingKey {
  if (hour < 12) return 'morning';
  if (hour < 17) return 'afternoon';
  return 'evening';
}

export function stepsLeftLabel(count: number): string {
  if (count === 0) return 'Ready to submit your registration';
  return `${count} ${count === 1 ? 'step' : 'steps'} left to submit your registration`;
}
