/**
 * Session cookies (shared by middleware and server code). All httpOnly: page scripts can't
 * read tokens, which limits the damage of any XSS. SameSite=Lax keeps them off cross-site posts.
 */
export const COOKIES = {
  access: 'wes_at',
  refresh: 'wes_rt',
  centre: 'wes_centre',
  /** The phone number between "send PIN" and "enter PIN" (never put in the URL). */
  pendingPhone: 'wes_phone',
} as const;

export const secure = process.env.NODE_ENV === 'production';

export function accessCookie(token: string, ttlSeconds: number) {
  // Expire a little early so we refresh before the API would reject it.
  return {
    name: COOKIES.access,
    value: token,
    httpOnly: true,
    secure,
    sameSite: 'lax' as const,
    path: '/',
    maxAge: Math.max(60, ttlSeconds - 30),
  };
}

export function refreshCookie(token: string) {
  return {
    name: COOKIES.refresh,
    value: token,
    httpOnly: true,
    secure,
    sameSite: 'lax' as const,
    path: '/',
    maxAge: 30 * 24 * 3600,
  };
}

export function centreCookie(centreId: string) {
  return {
    name: COOKIES.centre,
    value: centreId,
    httpOnly: true,
    secure,
    sameSite: 'lax' as const,
    path: '/',
    maxAge: 365 * 24 * 3600,
  };
}
