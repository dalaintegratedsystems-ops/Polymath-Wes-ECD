'use client';

/**
 * Client wrappers for interactive screens. Server pages pass plain data; these supply the
 * Next.js link renderer and server actions (functions can't cross the server → client boundary).
 */
import {
  AddChildScreen,
  ChildrenScreen,
  ConsentScreen,
  PlanScreen,
  RegistrationScreen,
  SetupScreen,
  VerifyScreen,
  WelcomeScreen,
  WesScreen,
  type ChatMessage,
  type ChildRow,
  type JourneyStep,
  type WeekPlan,
} from '@wes/ui';
import {
  addChild,
  confirmConsent,
  createCentre,
  requestPin,
  resendPin,
  saveProfile,
  sendConsentPin,
  verifyPin,
} from '@/app/actions';
import { nextRenderLink } from '@/lib/render-link';

export function WelcomeView() {
  return <WelcomeScreen onSubmit={async (phone) => (await requestPin(phone)) ?? null} />;
}

export function VerifyView({ maskedPhone }: { maskedPhone: string }) {
  return (
    <VerifyScreen
      maskedPhone={maskedPhone}
      onSubmit={async (code) => (await verifyPin(code)) ?? null}
      onResend={resendPin}
    />
  );
}

export function SetupView({ initialName }: { initialName: string }) {
  return (
    <SetupScreen
      initialName={initialName === 'Friend' ? '' : initialName}
      onSaveProfile={saveProfile}
      onCreateCentre={createCentre}
    />
  );
}

export function ChildrenView(props: {
  childrenList: ChildRow[];
  groups: string[];
  todayIso: string;
  attendance?: boolean;
  canAdd?: boolean;
  demo?: boolean;
}) {
  return <ChildrenScreen {...props} today={new Date(props.todayIso)} renderLink={nextRenderLink} />;
}

export function AddChildView({
  groups,
  todayIso,
}: {
  groups: { id: string; name: string }[];
  todayIso: string;
}) {
  return (
    <AddChildScreen
      groups={groups}
      today={new Date(todayIso)}
      onSubmit={async (draft) => (await addChild(draft)) ?? null}
      renderLink={nextRenderLink}
    />
  );
}

export function ConsentView({ childId, childName }: { childId: string; childName: string }) {
  return (
    <ConsentScreen
      childName={childName}
      onSendPin={() => sendConsentPin(childId)}
      onConfirm={(input) => confirmConsent(childId, input)}
      renderLink={nextRenderLink}
    />
  );
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
