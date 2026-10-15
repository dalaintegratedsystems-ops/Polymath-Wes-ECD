'use client';

/**
 * Client wrappers for interactive screens. Server pages pass plain data; these supply
 * the Next.js link renderer (functions can't cross the server → client boundary).
 */
import {
  ChildrenScreen,
  PlanScreen,
  RegistrationScreen,
  WesScreen,
  type ChatMessage,
  type ChildRow,
  type JourneyStep,
  type WeekPlan,
} from '@wes/ui';
import { nextRenderLink } from '@/lib/render-link';

export function ChildrenView(props: {
  childrenList: ChildRow[];
  groups: string[];
  todayIso: string;
  demo?: boolean;
}) {
  return <ChildrenScreen {...props} today={new Date(props.todayIso)} renderLink={nextRenderLink} />;
}

export function PlanView(props: { plan: WeekPlan | null; todayKey?: string; demo?: boolean }) {
  return <PlanScreen {...props} renderLink={nextRenderLink} />;
}

export function RegistrationView(props: { steps: JourneyStep[]; demo?: boolean }) {
  return <RegistrationScreen {...props} renderLink={nextRenderLink} />;
}

export function WesView(props: {
  messages: ChatMessage[];
  suggestions: string[];
  initialDraft?: string;
}) {
  return <WesScreen {...props} renderLink={nextRenderLink} />;
}
