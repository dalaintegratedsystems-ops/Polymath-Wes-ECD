import 'server-only';
import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { cache } from 'react';
import type { Me, Membership, TokenPair } from '@wes/shared';
import { COOKIES, accessCookie, centreCookie, refreshCookie } from '../session-cookies';
import { ApiError, api } from './api';

/** Store a fresh token pair (only callable from server actions and route handlers). */
export async function setSession(pair: TokenPair): Promise<void> {
  const jar = await cookies();
  jar.set(accessCookie(pair.accessToken, pair.expiresInSeconds));
  jar.set(refreshCookie(pair.refreshToken));
  const current = jar.get(COOKIES.centre)?.value;
  const chosen = pickCentre(pair.me.memberships, current);
  if (chosen) jar.set(centreCookie(chosen.centreId));
}

export async function clearSession(): Promise<void> {
  const jar = await cookies();
  for (const name of Object.values(COOKIES)) jar.delete(name);
}

/** Keep the current centre if still valid; otherwise prefer one you run. */
export function pickCentre(memberships: Membership[], current?: string): Membership | undefined {
  return (
    memberships.find((m) => m.centreId === current) ??
    memberships.find((m) => m.role === 'principal') ??
    memberships.find((m) => m.role === 'practitioner') ??
    memberships[0]
  );
}

export interface Session {
  token: string;
  me: Me;
  membership: Membership | undefined;
}

/** The signed-in user for this request, or a redirect to sign-in. Cached per request. */
export const requireSession = cache(async (allowPasswordChange = false): Promise<Session> => {
  const jar = await cookies();
  const token = jar.get(COOKIES.access)?.value;
  if (!token) redirect('/welcome');
  try {
    const me = await api<Me>('/v1/me', { token });
    // Accounts made by an admin must choose their own password before anything else.
    if (me.mustChangePassword && !allowPasswordChange) redirect('/account/password');
    return { token, me, membership: pickCentre(me.memberships, jar.get(COOKIES.centre)?.value) };
  } catch (err) {
    if (err instanceof ApiError && err.status === 401) redirect('/welcome');
    throw err;
  }
});

/** Like requireSession, but also requires a centre (otherwise: set one up). */
export async function requireCentre(): Promise<Session & { membership: Membership }> {
  const session = await requireSession();
  if (!session.membership) redirect('/setup');
  return session as Session & { membership: Membership };
}
