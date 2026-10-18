/**
 * Polymath Wes design tokens — the single source of truth for colour, type, space and shape.
 * `pnpm --filter @wes/ui tokens` writes `src/tokens.css` from this file; a test fails if
 * the CSS drifts or any text/background pair misses WCAG 2.2 AA.
 *
 * Palette story: warm ochre (sun on the veld), sunbaked clay (Cape earth, our action colour),
 * fynbos green (growth, success), protea pink (delight), deep ink and soft sand.
 */

export const palette = {
  sand50: '#FCF7F0',
  sand100: '#F6ECDD',
  sand200: '#EDDCC4',
  sand300: '#E0C8A8',
  ochre300: '#F5C66E',
  ochre400: '#E9A93F',
  ochre700: '#8C520A',
  clay400: '#E58A5F',
  clay600: '#B04E24',
  clay700: '#933F1C',
  fynbos100: '#E2F0E6',
  fynbos300: '#7FC9A0',
  fynbos700: '#2B6A4C',
  protea100: '#FBE3EA',
  protea300: '#F28CAD',
  protea600: '#B83A63',
  ink900: '#22180F',
  ink700: '#5A4A3C',
  ink500: '#7D6A58',
  night900: '#15100C',
  night800: '#1F1812',
  night700: '#2A2019',
  night600: '#3B2E24',
  cream50: '#F8EFE4',
  cream200: '#D8C6B2',
  red700: '#AE2A1F',
  red300: '#FF9B8F',
  white: '#FFFFFF',
} as const;

type Semantic = {
  canvas: string;
  surface: string;
  surfaceSunk: string;
  line: string;
  ink: string;
  inkMuted: string;
  primary: string;
  primaryHover: string;
  onPrimary: string;
  brand: string;
  onBrand: string;
  brandSoft: string;
  brandStrong: string;
  success: string;
  successSoft: string;
  onSuccess: string;
  accent: string;
  accentSoft: string;
  onAccent: string;
  danger: string;
  onDanger: string;
  focus: string;
};

const p = palette;

export const themes: Record<'light' | 'dark', Semantic> = {
  light: {
    canvas: p.sand50,
    surface: p.white,
    surfaceSunk: p.sand100,
    line: p.sand200,
    ink: p.ink900,
    inkMuted: p.ink700,
    primary: p.clay600,
    primaryHover: p.clay700,
    onPrimary: p.white,
    brand: p.ochre400,
    onBrand: p.ink900,
    brandSoft: '#FCEBCB',
    brandStrong: p.ochre700,
    success: p.fynbos700,
    successSoft: p.fynbos100,
    onSuccess: p.white,
    accent: p.protea600,
    accentSoft: p.protea100,
    onAccent: p.white,
    danger: p.red700,
    onDanger: p.white,
    focus: '#1D5FD1',
  },
  dark: {
    canvas: p.night900,
    surface: p.night800,
    surfaceSunk: p.night700,
    line: p.night600,
    ink: p.cream50,
    inkMuted: p.cream200,
    primary: p.clay400,
    primaryHover: '#EEA07A',
    onPrimary: p.night900,
    brand: p.ochre300,
    onBrand: p.night900,
    brandSoft: '#3A2A12',
    brandStrong: p.ochre300,
    success: p.fynbos300,
    successSoft: '#17321F',
    onSuccess: p.night900,
    accent: p.protea300,
    accentSoft: '#3A1824',
    onAccent: p.night900,
    danger: p.red300,
    onDanger: p.night900,
    focus: '#8DB6FF',
  },
};

/** Pairs that carry text. Every pair must reach 4.5:1 in both themes. */
export const TEXT_PAIRS: [keyof Semantic, keyof Semantic][] = [
  ['ink', 'canvas'],
  ['ink', 'surface'],
  ['ink', 'surfaceSunk'],
  ['inkMuted', 'canvas'],
  ['inkMuted', 'surface'],
  ['inkMuted', 'surfaceSunk'],
  ['onPrimary', 'primary'],
  ['onPrimary', 'primaryHover'],
  ['brandStrong', 'canvas'],
  ['brandStrong', 'surface'],
  ['brandStrong', 'brandSoft'],
  ['ink', 'brandSoft'],
  ['success', 'successSoft'],
  ['success', 'surface'],
  ['onSuccess', 'success'],
  ['accent', 'accentSoft'],
  ['accent', 'surface'],
  ['onAccent', 'accent'],
  ['danger', 'surface'],
  ['onDanger', 'danger'],
  ['onBrand', 'brand'],
];

/** Non-text UI (icons, focus rings, borders of inputs) needs 3:1. */
export const UI_PAIRS: [keyof Semantic, keyof Semantic][] = [
  ['focus', 'canvas'],
  ['focus', 'surface'],
  ['primary', 'canvas'],
];

export const typography = {
  fontFamily: "var(--font-nunito, 'Nunito'), ui-rounded, 'Segoe UI', Roboto, system-ui, sans-serif",
  /** 16px minimum body text (CLAUDE.md §6). */
  size: {
    xs: '0.8125rem',
    sm: '0.9375rem',
    base: '1rem',
    lg: '1.125rem',
    xl: '1.375rem',
    '2xl': '1.75rem',
    '3xl': '2.125rem',
  },
  lineHeight: { tight: '1.2', snug: '1.35', normal: '1.55' },
  weight: { regular: '500', bold: '750', black: '850' },
} as const;

export const radius = { sm: '10px', md: '16px', lg: '22px', xl: '28px', pill: '999px' } as const;
export const space = { touch: '48px', touchLg: '56px', gutter: '16px' } as const;
export const shadow = {
  card: '0 1px 2px rgb(60 35 15 / 0.06), 0 4px 16px rgb(60 35 15 / 0.06)',
  raised: '0 2px 4px rgb(60 35 15 / 0.08), 0 12px 32px rgb(60 35 15 / 0.12)',
} as const;

const kebab = (s: string) => s.replace(/[A-Z]/g, (m) => `-${m.toLowerCase()}`);

function vars(t: Semantic, indent = '  '): string {
  return Object.entries(t)
    .map(([k, v]) => `${indent}--wes-${kebab(k)}: ${v};`)
    .join('\n');
}

/** Render tokens.css: light by default, dark by OS preference or explicit data-theme. */
export function renderTokensCss(): string {
  const shared = [
    `  --wes-font: ${typography.fontFamily};`,
    ...Object.entries(radius).map(([k, v]) => `  --wes-radius-${k}: ${v};`),
    ...Object.entries(shadow).map(([k, v]) => `  --wes-shadow-${k}: ${v};`),
    `  --wes-touch: ${space.touch};`,
    `  --wes-touch-lg: ${space.touchLg};`,
  ].join('\n');

  return `/* GENERATED from src/tokens.ts: run \`pnpm --filter @wes/ui tokens\`. Do not edit by hand. */
:root {
  color-scheme: light;
${vars(themes.light)}
${shared}
}

@media (prefers-color-scheme: dark) {
  :root:not([data-theme='light']) {
    color-scheme: dark;
${vars(themes.dark, '    ')}
  }
}

:root[data-theme='dark'] {
  color-scheme: dark;
${vars(themes.dark)}
}
`;
}
