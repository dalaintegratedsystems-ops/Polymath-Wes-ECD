import { cookies } from 'next/headers';
import { COOKIES } from '@/lib/session-cookies';
import { API_URL } from '@/lib/server/api';

/** Builds the application pack (a POST, because it records that the pack was made). */
export async function POST() {
  const jar = await cookies();
  const token = jar.get(COOKIES.access)?.value;
  const centreId = jar.get(COOKIES.centre)?.value;
  if (!token || !centreId) return new Response('Please sign in', { status: 401 });
  const res = await fetch(`${API_URL}/v1/compliance/pack`, {
    method: 'POST',
    headers: { authorization: `Bearer ${token}`, 'x-centre-id': centreId },
    cache: 'no-store',
  }).catch(() => null);
  if (!res?.ok) {
    return new Response('We could not make your pack right now. Please try again.', {
      status: res?.status === 403 ? 403 : 502,
      headers: { 'content-type': 'text/plain; charset=utf-8' },
    });
  }
  return new Response(res.body, {
    headers: {
      'content-type': 'application/pdf',
      'content-disposition': 'attachment; filename="application-pack.pdf"',
      'cache-control': 'no-store',
    },
  });
}
