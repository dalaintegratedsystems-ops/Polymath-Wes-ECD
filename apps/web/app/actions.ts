'use server';

/**
 * Server actions: the only place the web app talks to the API with the user's token.
 * Each returns a friendly error string (or a small result) instead of throwing, so screens
 * can show plain-language messages.
 */
import { cookies } from 'next/headers';
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
  redirect(pair.isNewUser || pair.me.memberships.length === 0 ? '/setup' : '/');
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
