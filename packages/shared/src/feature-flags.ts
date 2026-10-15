/**
 * Phase-2 capabilities are designed for but not built (CLAUDE.md §3).
 * Each has a flag that defaults off and a stub route returning 501. See ADR-0010.
 */
export const FEATURE_FLAGS = {
  voiceNotes: { default: false, phase: 2, route: '/v1/observations/voice' },
  behaviourCoach: { default: false, phase: 2, route: '/v1/behaviour/coach' },
  parentConnect: { default: false, phase: 2, route: '/v1/broadcasts' },
  academy: { default: false, phase: 2, route: '/v1/academy/courses' },
  billing: { default: false, phase: 2, route: '/v1/billing/subscription' },
  funderDashboard: { default: false, phase: 2, route: '/v1/funders/dashboard' },
  partnerApi: { default: false, phase: 2, route: '/v1/partners/webhooks' },
} as const;

export type FeatureFlag = keyof typeof FEATURE_FLAGS;

export function isFeatureEnabled(
  flag: FeatureFlag,
  overrides: Partial<Record<FeatureFlag, boolean>> = {},
): boolean {
  return overrides[flag] ?? FEATURE_FLAGS[flag].default;
}
