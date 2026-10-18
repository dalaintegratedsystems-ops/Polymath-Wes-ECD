'use client';

/**
 * Client wrappers for interactive screens. Server pages pass plain data; these supply the
 * Next.js link renderer and server actions (functions can't cross the server → client boundary).
 */
import {
  AddChildScreen,
  PackScreen,
  PoliciesScreen,
  CentreDetailsScreen,
  DocumentsScreen,
  PolicyScreen,
  SelfAuditScreen,
  SubmitScreen,
  ChangePasswordScreen,
  PasswordSignInScreen,
  PeopleScreen,
  PhotoPicker,
  type PersonRow,
  ChildrenScreen,
  ConsentScreen,
  PlanScreen,
  RegistrationScreen,
  SetupScreen,
  VerifyScreen,
  WelcomeScreen,
  type ChildRow,
  type JourneyStep,
  type WeekPlan,
} from '@wes/ui';
import {
  addChild,
  approvePolicy,
  deleteDocument,
  generatePolicy,
  markSubmitted,
  runSelfAudit,
  saveCentreDetails,
  savePolicyText,
  uploadDocument,
  changePassword,
  createPerson,
  passwordSignIn,
  removeAvatar,
  resetPersonPassword,
  setPersonStatus,
  uploadAvatar,
  uploadLogo,
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

export function RegistrationView(props: {
  steps: JourneyStep[];
  percent?: number;
  expiringDocuments?: number;
  demo?: boolean;
}) {
  return <RegistrationScreen {...props} renderLink={nextRenderLink} />;
}

// ---------- Accounts, people and profile ----------

export function PasswordSignInView() {
  return <PasswordSignInScreen onSubmit={passwordSignIn} renderLink={nextRenderLink} />;
}

export function ChangePasswordView({ forced }: { forced: boolean }) {
  return (
    <ChangePasswordScreen forced={forced} onSubmit={changePassword} renderLink={nextRenderLink} />
  );
}

export function PeopleView(props: {
  people: PersonRow[];
  centres: { id: string; name: string }[];
  isPlatformAdmin: boolean;
}) {
  return (
    <PeopleScreen
      {...props}
      onCreate={createPerson}
      onResetPassword={resetPersonPassword}
      onSetStatus={setPersonStatus}
      renderLink={nextRenderLink}
    />
  );
}

const asForm = (image: Blob) => {
  const form = new FormData();
  form.set('image', image, 'image.jpg');
  return form;
};

export function AvatarPicker({ name, src }: { name: string; src: string | null }) {
  return (
    <PhotoPicker
      name={name}
      src={src}
      label="photo"
      onUpload={(image) => uploadAvatar(asForm(image))}
      onRemove={removeAvatar}
    />
  );
}

export function LogoPicker({ name, src }: { name: string; src: string | null }) {
  return (
    <PhotoPicker
      name={name}
      src={src}
      label="logo"
      onUpload={(image) => uploadLogo(asForm(image))}
    />
  );
}

// ---------- Registration copilot ----------

export function SelfAuditView(
  props: Omit<Parameters<typeof SelfAuditScreen>[0], 'onSubmit' | 'renderLink'>,
) {
  return <SelfAuditScreen {...props} onSubmit={runSelfAudit} renderLink={nextRenderLink} />;
}

export function CentreDetailsView(
  props: Omit<Parameters<typeof CentreDetailsScreen>[0], 'onSave' | 'renderLink'>,
) {
  return (
    <CentreDetailsScreen
      {...props}
      onSave={({ addressLine, suburb, city, childCount }) =>
        saveCentreDetails({ addressLine, suburb, city, childCount })
      }
      renderLink={nextRenderLink}
    />
  );
}

export function PolicyView(
  props: Omit<
    Parameters<typeof PolicyScreen>[0],
    'onGenerate' | 'onSaveText' | 'onApprove' | 'renderLink'
  > & {
    kind: string;
  },
) {
  const { kind, ...rest } = props;
  const id = props.policy?.id;
  return (
    <PolicyScreen
      {...rest}
      onGenerate={(answers) => generatePolicy(kind, answers)}
      onSaveText={(body) =>
        id ? savePolicyText(id, body) : Promise.resolve('Write the draft first.')
      }
      onApprove={() => (id ? approvePolicy(id) : Promise.resolve('Write the draft first.'))}
      renderLink={nextRenderLink}
    />
  );
}

export function DocumentsView(
  props: Omit<Parameters<typeof DocumentsScreen>[0], 'onUpload' | 'onDelete' | 'renderLink'>,
) {
  return (
    <DocumentsScreen
      {...props}
      onUpload={uploadDocument}
      onDelete={deleteDocument}
      renderLink={nextRenderLink}
    />
  );
}

export function SubmitView(
  props: Omit<Parameters<typeof SubmitScreen>[0], 'onMarkSubmitted' | 'renderLink'>,
) {
  return <SubmitScreen {...props} onMarkSubmitted={markSubmitted} renderLink={nextRenderLink} />;
}

export function PoliciesView(props: Omit<Parameters<typeof PoliciesScreen>[0], 'renderLink'>) {
  return <PoliciesScreen {...props} renderLink={nextRenderLink} />;
}

export function PackView(props: Omit<Parameters<typeof PackScreen>[0], 'renderLink'>) {
  return <PackScreen {...props} renderLink={nextRenderLink} />;
}
