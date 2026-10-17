import { cookies } from 'next/headers';
import { COOKIES } from '@/lib/session-cookies';
import { API_URL } from '@/lib/server/api';

/**
 * Streams Ask Wes from the API to the browser. The browser never sees the access token: this
 * route reads it from the httpOnly cookie and forwards the server-sent events unchanged.
 */
export const dynamic = 'force-dynamic';

export async function POST(req: Request) {
  const jar = await cookies();
  const token = jar.get(COOKIES.access)?.value;
  const centreId = jar.get(COOKIES.centre)?.value;
  if (!token || !centreId) return new Response('Please sign in again.', { status: 401 });

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return new Response('Bad request', { status: 400 });
  }

  const upstream = await fetch(`${API_URL}/v1/assistant/messages`, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      authorization: `Bearer ${token}`,
      'x-centre-id': centreId,
    },
    body: JSON.stringify(body),
    cache: 'no-store',
  }).catch(() => null);

  if (!upstream) return new Response('Wes can’t be reached right now.', { status: 503 });
  if (!upstream.ok || !upstream.body) {
    return new Response(await upstream.text(), {
      status: upstream.status,
      headers: { 'content-type': 'application/json' },
    });
  }
  return new Response(upstream.body, {
    headers: {
      'content-type': 'text/event-stream; charset=utf-8',
      'cache-control': 'no-cache, no-transform',
      'x-accel-buffering': 'no',
    },
  });
}
