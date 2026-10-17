import { NextResponse, type NextRequest } from 'next/server';
import { COOKIES, accessCookie, refreshCookie } from './lib/session-cookies';

const API_URL = process.env.API_URL ?? process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:4000';
const PUBLIC = ['/welcome', '/verify'];

/**
 * Keeps sessions alive without exposing tokens to the page: when the short-lived access
 * cookie has expired but a refresh cookie exists, rotate it here, before any page renders.
 */
export async function middleware(req: NextRequest) {
  const isPublic = PUBLIC.some((p) => req.nextUrl.pathname.startsWith(p));
  const access = req.cookies.get(COOKIES.access)?.value;
  const refresh = req.cookies.get(COOKIES.refresh)?.value;

  if (access || isPublic) return NextResponse.next();
  if (!refresh) return NextResponse.redirect(new URL('/welcome', req.url));

  try {
    const res = await fetch(`${API_URL}/v1/auth/refresh`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ refreshToken: refresh }),
      cache: 'no-store',
    });
    if (!res.ok) throw new Error(`refresh failed: ${res.status}`);
    const pair = (await res.json()) as {
      accessToken: string;
      refreshToken: string;
      expiresInSeconds: number;
    };

    // Make the new tokens visible to this request's server components…
    req.cookies.set(COOKIES.access, pair.accessToken);
    req.cookies.set(COOKIES.refresh, pair.refreshToken);
    const next = NextResponse.next({ request: { headers: req.headers } });
    // …and store them in the browser.
    next.cookies.set(accessCookie(pair.accessToken, pair.expiresInSeconds));
    next.cookies.set(refreshCookie(pair.refreshToken));
    return next;
  } catch {
    const out = NextResponse.redirect(new URL('/welcome', req.url));
    out.cookies.delete(COOKIES.access);
    out.cookies.delete(COOKIES.refresh);
    return out;
  }
}

export const config = {
  // Everything except static assets, PWA files and the offline page.
  matcher: ['/((?!_next/|icons/|icon\\.svg|manifest\\.webmanifest|sw\\.js|swe-worker|~offline).*)'],
};
