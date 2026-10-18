'use server';

/**
 * Server actions: the only place the web app talks to the API with the user's token.
 * Each returns a friendly error string (or a small result) instead of throwing, so screens
 * can show plain-language messages.
 */
import { cookies } from 'next/headers';
import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import type { Centre, ChildListItem, TokenPair } from '@wes/shared';
import { normaliseSaPhone } from '@wes/shared';
import { COOKIES, centreCookie, secure } from '@/lib/session-cookies';
import { ApiError, api } from '@/lib/server/api';
import { clearSession, requireCentre, requireSession, setSession } from '@/lib/server/session';

const message = (err: unknown) =>
  err instanceof ApiError
    ? err.userMessage
    : 'Something went wrong. Check your signal and try again.';

export async function requestPin(phoneInput: string): Promise<string | null> {
  const phone = normaliseSaPhone(phoneInput);
  if (!phone) return 'Use a South African mobile number, e.g. 082 123 4567';
  try {
    await api('/v1/auth/otp', { method: 'POST', body: { phone } });
  } catch (err) {
    return message(err);
  }
  (await cookies()).set({
    name: COOKIES.pendingPhone,
    value: phone,
    httpOnly: true,
    secure,
    sameSite: 'lax',
    path: '/',
    maxAge: 15 * 60,
  });
  redirect('/verify');
}

export async function resendPin(): Promise<string | null> {
  const phone = (await cookies()).get(COOKIES.pendingPhone)?.value;
  if (!phone) return 'Please enter your number again.';
  try {
    await api('/v1/auth/otp', { method: 'POST', body: { phone } });
    return null;
  } catch (err) {
    return message(err);
  }
}

export async function verifyPin(code: string): Promise<string | null> {
  const jar = await cookies();
  const phone = jar.get(COOKIES.pendingPhone)?.value;
  if (!phone) return 'That took a while. Please enter your number again.';
  let pair: TokenPair;
  try {
    pair = await api<TokenPair>('/v1/auth/token', { method: 'POST', body: { phone, code } });
  } catch (err) {
    return message(err);
  }
  await setSession(pair);
  jar.delete(COOKIES.pendingPhone);
  redirect(
    pair.isNewUser || (pair.me.memberships.length === 0 && !pair.me.isPlatformAdmin)
      ? '/setup'
      : '/',
  );
}

export async function saveProfile(input: {
  displayName: string;
  locale: 'en' | 'af' | 'xh' | 'zu';
}): Promise<string | null> {
  const { token } = await requireSession();
  try {
    await api('/v1/me', { method: 'PATCH', token, body: input });
    return null;
  } catch (err) {
    return message(err);
  }
}

export async function createCentre(input: {
  name: string;
  addressLine: string;
  suburb: string;
  city: string;
  province: Centre['province'];
  agesServedMinMonths: number;
  agesServedMaxMonths: number;
  childCount: number;
}): Promise<string | null> {
  const { token } = await requireSession();
  try {
    const centre = await api<Centre>('/v1/centres', { method: 'POST', token, body: input });
    (await cookies()).set(centreCookie(centre.id));
    return null;
  } catch (err) {
    return message(err);
  }
}

export async function addChild(input: {
  firstName: string;
  birthMonth: string;
  groupId?: string;
  guardian: { displayName: string; phone: string; relationship: string };
}): Promise<string | null> {
  const { token, membership } = await requireCentre();
  let child: ChildListItem;
  try {
    child = await api<ChildListItem>(`/v1/centres/${membership.centreId}/children`, {
      method: 'POST',
      token,
      body: input,
    });
  } catch (err) {
    return message(err);
  }
  redirect(`/children/${child.id}/consent`);
}

export async function sendConsentPin(
  childId: string,
): Promise<{ sentTo: string } | { error: string }> {
  const { token, membership } = await requireCentre();
  try {
    return await api<{ sentTo: string }>(`/v1/children/${childId}/consents/otp`, {
      method: 'POST',
      token,
      centreId: membership.centreId,
    });
  } catch (err) {
    return { error: message(err) };
  }
}

export async function confirmConsent(
  childId: string,
  input: { purposes: string[]; code: string },
): Promise<string | null> {
  const { token, membership } = await requireCentre();
  try {
    await api(`/v1/children/${childId}/consents`, {
      method: 'POST',
      token,
      centreId: membership.centreId,
      body: { purposes: input.purposes, method: 'guardian_otp', code: input.code },
    });
    return null;
  } catch (err) {
    return message(err);
  }
}

export async function sendFeedback(input: {
  messageId: string;
  rating: 'up' | 'down';
  reason?: 'wrong' | 'not_helpful' | 'not_relevant_locally' | 'too_long' | 'unsafe' | 'other';
}): Promise<string | null> {
  const { token, membership } = await requireCentre();
  try {
    await api('/v1/assistant/feedback', {
      method: 'POST',
      token,
      centreId: membership.centreId,
      body: input,
    });
    return null;
  } catch (err) {
    return message(err);
  }
}

export async function signOut(): Promise<void> {
  const refresh = (await cookies()).get(COOKIES.refresh)?.value;
  if (refresh) {
    await api('/v1/auth/logout', { method: 'POST', body: { refreshToken: refresh } }).catch(
      () => undefined,
    );
  }
  await clearSession();
  redirect('/welcome');
}

// ---------- Username sign-in and passwords ----------

export async function passwordSignIn(input: {
  username: string;
  password: string;
}): Promise<string | null> {
  let pair: TokenPair;
  try {
    pair = await api<TokenPair>('/v1/auth/password', { method: 'POST', body: input });
  } catch (err) {
    return message(err);
  }
  await setSession(pair);
  if (pair.me.mustChangePassword) redirect('/account/password');
  redirect(pair.me.memberships.length === 0 && !pair.me.isPlatformAdmin ? '/setup' : '/');
}

export async function changePassword(input: {
  currentPassword: string;
  newPassword: string;
}): Promise<string | null> {
  const { token } = await requireSession(true);
  try {
    await api('/v1/auth/password/change', { method: 'POST', token, body: input });
  } catch (err) {
    return message(err);
  }
  redirect('/account?changed=1');
}

// ---------- People ----------

type Created = { temporaryPassword: string | null } | { error: string };

export async function createPerson(input: {
  displayName: string;
  centreId: string;
  role: string;
  username?: string;
  phone?: string;
}): Promise<Created> {
  const { token } = await requireSession();
  try {
    const res = await api<{ temporaryPassword: string | null }>('/v1/admin/users', {
      method: 'POST',
      token,
      body: input,
    });
    revalidatePath('/people');
    return { temporaryPassword: res.temporaryPassword };
  } catch (err) {
    return { error: message(err) };
  }
}

export async function resetPersonPassword(userId: string): Promise<Created> {
  const { token } = await requireSession();
  try {
    const res = await api<{ temporaryPassword: string }>(
      `/v1/admin/users/${encodeURIComponent(userId)}/reset-password`,
      { method: 'POST', token },
    );
    revalidatePath('/people');
    return res;
  } catch (err) {
    return { error: message(err) };
  }
}

export async function setPersonStatus(
  userId: string,
  status: 'active' | 'deactivated',
): Promise<string | null> {
  const { token } = await requireSession();
  try {
    await api(`/v1/admin/users/${encodeURIComponent(userId)}/status`, {
      method: 'PATCH',
      token,
      body: { status },
    });
    revalidatePath('/people');
    return null;
  } catch (err) {
    return message(err);
  }
}

// ---------- Profile photo and centre logo ----------

async function imageFrom(
  form: FormData,
): Promise<{ bytes: ArrayBuffer; contentType: string } | null> {
  const file = form.get('image');
  if (!(file instanceof Blob) || file.size === 0 || file.size > 512 * 1024) return null;
  return { bytes: await file.arrayBuffer(), contentType: file.type || 'image/jpeg' };
}

export async function uploadAvatar(form: FormData): Promise<string | null> {
  const { token } = await requireSession();
  const raw = await imageFrom(form);
  if (!raw) return 'Use a photo under 512 KB.';
  try {
    await api('/v1/me/avatar', { method: 'PUT', token, raw });
    revalidatePath('/account');
    return null;
  } catch (err) {
    return message(err);
  }
}

export async function removeAvatar(): Promise<string | null> {
  const { token } = await requireSession();
  try {
    await api('/v1/me/avatar', { method: 'DELETE', token });
    revalidatePath('/account');
    return null;
  } catch (err) {
    return message(err);
  }
}

export async function uploadLogo(form: FormData): Promise<string | null> {
  const { token, membership } = await requireCentre();
  const raw = await imageFrom(form);
  if (!raw) return 'Use a picture under 512 KB.';
  try {
    await api(`/v1/centres/${membership.centreId}/logo`, { method: 'PUT', token, raw });
    revalidatePath('/account');
    return null;
  } catch (err) {
    return message(err);
  }
}

// ---------- Registration copilot ----------

async function centreCall<T>(
  path: string,
  init: { method?: 'POST' | 'PATCH' | 'PUT' | 'DELETE'; body?: unknown } = {},
) {
  const { token, membership } = await requireCentre();
  return api<T>(path, { ...init, token, centreId: membership.centreId });
}

export async function runSelfAudit(
  answers: Record<string, 'yes' | 'no' | 'unsure'>,
): Promise<string | null> {
  try {
    await centreCall('/v1/compliance/audit', { method: 'POST', body: { answers } });
    revalidatePath('/registration', 'layout');
    return null;
  } catch (err) {
    return message(err);
  }
}

export async function saveCentreDetails(input: {
  addressLine: string;
  suburb: string;
  city: string;
  childCount: number;
}): Promise<string | null> {
  const { token, membership } = await requireCentre();
  try {
    await api(`/v1/centres/${membership.centreId}`, { method: 'PATCH', token, body: input });
    revalidatePath('/registration', 'layout');
    return null;
  } catch (err) {
    return message(err);
  }
}

export async function generatePolicy(
  kind: string,
  answers: Record<string, string>,
): Promise<string | null> {
  try {
    await centreCall('/v1/policies/generate', { method: 'POST', body: { kind, answers } });
    revalidatePath('/registration', 'layout');
    return null;
  } catch (err) {
    return message(err);
  }
}

export async function savePolicyText(id: string, bodyMarkdown: string): Promise<string | null> {
  try {
    await centreCall(`/v1/policies/${encodeURIComponent(id)}`, {
      method: 'PATCH',
      body: { bodyMarkdown },
    });
    revalidatePath('/registration', 'layout');
    return null;
  } catch (err) {
    return message(err);
  }
}

export async function approvePolicy(id: string): Promise<string | null> {
  try {
    await centreCall(`/v1/policies/${encodeURIComponent(id)}/approve`, { method: 'POST' });
    revalidatePath('/registration', 'layout');
    return null;
  } catch (err) {
    return message(err);
  }
}

const DOCUMENT_TYPES_ALLOWED = new Set([
  'image/jpeg',
  'image/png',
  'image/webp',
  'application/pdf',
]);

export async function uploadDocument(form: FormData): Promise<string | null> {
  const { token, membership } = await requireCentre();
  const file = form.get('file');
  const type = String(form.get('type') ?? '');
  const expiresOn = String(form.get('expiresOn') ?? '');
  if (!(file instanceof Blob) || file.size === 0) return 'Choose a photo or PDF first.';
  if (file.size > 5 * 1024 * 1024) return 'That file is too big. Use one under 5 MB.';
  const contentType = DOCUMENT_TYPES_ALLOWED.has(file.type) ? file.type : 'image/jpeg';
  const qs = new URLSearchParams({ type });
  if (/^\d{4}-\d{2}-\d{2}$/.test(expiresOn)) qs.set('expiresOn', expiresOn);
  try {
    await api(`/v1/compliance/documents?${qs}`, {
      method: 'POST',
      token,
      centreId: membership.centreId,
      raw: { bytes: await file.arrayBuffer(), contentType },
    });
    revalidatePath('/registration', 'layout');
    return null;
  } catch (err) {
    return message(err);
  }
}

export async function deleteDocument(id: string): Promise<string | null> {
  try {
    await centreCall(`/v1/compliance/documents/${encodeURIComponent(id)}`, { method: 'DELETE' });
    revalidatePath('/registration', 'layout');
    return null;
  } catch (err) {
    return message(err);
  }
}

export async function markSubmitted(): Promise<string | null> {
  const { token, membership } = await requireCentre();
  try {
    await api(`/v1/centres/${membership.centreId}`, {
      method: 'PATCH',
      token,
      body: { registrationStatus: 'submitted' },
    });
    revalidatePath('/registration', 'layout');
    revalidatePath('/');
    return null;
  } catch (err) {
    return message(err);
  }
}

// ---------- Planner ----------

export async function createPlan(input: {
  theme: string;
  ageGroups: string[];
  weekStarting: string;
}): Promise<string | null> {
  try {
    await centreCall('/v1/plans/weekly', { method: 'POST', body: input });
    revalidatePath('/plan', 'layout');
    return null;
  } catch (err) {
    return message(err);
  }
}

export async function approvePlan(id: string): Promise<string | null> {
  try {
    await centreCall(`/v1/plans/${encodeURIComponent(id)}/approve`, { method: 'POST' });
    revalidatePath('/plan', 'layout');
    return null;
  } catch (err) {
    return message(err);
  }
}

export async function adaptPlanActivity(
  planId: string,
  activityId: string,
  target: string,
): Promise<
  { title: string; steps: string[]; materials: string[]; note: string } | { error: string }
> {
  try {
    return await centreCall('/v1/activities/adapt', {
      method: 'POST',
      body: { planId, activityId, target },
    });
  } catch (err) {
    return { error: message(err) };
  }
}
