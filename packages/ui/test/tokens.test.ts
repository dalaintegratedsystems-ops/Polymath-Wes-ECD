import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { contrastRatio } from '../src/contrast';
import { TEXT_PAIRS, UI_PAIRS, renderTokensCss, themes, typography } from '../src/tokens';

describe('WCAG 2.2 AA contrast', () => {
  for (const theme of ['light', 'dark'] as const) {
    const t = themes[theme];
    it.each(TEXT_PAIRS)(`${theme}: %s on %s reaches 4.5:1`, (fg, bg) => {
      expect(contrastRatio(t[fg], t[bg])).toBeGreaterThanOrEqual(4.5);
    });
    it.each(UI_PAIRS)(`${theme}: %s on %s reaches 3:1`, (fg, bg) => {
      expect(contrastRatio(t[fg], t[bg])).toBeGreaterThanOrEqual(3);
    });
  }

  it('computes known ratios', () => {
    expect(contrastRatio('#000000', '#FFFFFF')).toBeCloseTo(21, 0);
    expect(contrastRatio('#777777', '#FFFFFF')).toBeCloseTo(4.48, 1);
  });
});

describe('tokens.css', () => {
  it('is in sync with tokens.ts', () => {
    const css = readFileSync(new URL('../src/tokens.css', import.meta.url), 'utf8');
    expect(css).toBe(renderTokensCss());
  });

  it('keeps body text at 16px or more', () => {
    expect(typography.size.base).toBe('1rem');
  });
});
