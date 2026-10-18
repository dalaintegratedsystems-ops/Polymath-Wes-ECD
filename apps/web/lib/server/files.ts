import 'server-only';
import { cookies } from 'next/headers';
import { COOKIES } from '../session-cookies';
import { API_URL } from './api';

const UUID = /^[0-9a-f-]{36}$/i;

/** Stream a centre file from the API with the user's token; the browser never holds tokens. */
export async function proxyCentreFile(apiPath: string, id: string): Promise<Response> {
  if (!UUID.test(id)) return new Response('Not found', { status: 404 });
  const jar = await cookies();
  const token = jar.get(COOKIES.access)?.value;
  const centreId = jar.get(COOKIES.centre)?.value;
  if (!token || !centreId) return new Response('Please sign in', { status: 401 });
  const res = await fetch(`${API_URL}${apiPath}`, {
    headers: { authorization: `Bearer ${token}`, 'x-centre-id': centreId },
    cache: 'no-store',
  }).catch(() => null);
  if (!res?.ok) return new Response('Not found', { status: res?.status === 401 ? 401 : 404 });
  return new Response(res.body, {
    headers: {
      'content-type': res.headers.get('content-type') ?? 'application/octet-stream',
      'content-disposition': res.headers.get('content-disposition') ?? 'inline',
      'cache-control': 'private, no-store',
      'x-content-type-options': 'nosniff',
    },
  });
}
