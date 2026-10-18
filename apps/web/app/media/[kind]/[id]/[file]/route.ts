import { cookies } from 'next/headers';
import { COOKIES } from '@/lib/session-cookies';
import { API_URL } from '@/lib/server/api';

const ALLOWED = { users: 'avatar', centres: 'logo' } as const;
const UUID = /^[0-9a-f-]{36}$/i;

/**
 * Profile photos and logos, fetched from the API with the user's token. The browser never
 * holds the token, so plain <img> tags point here instead of at the API.
 */
export async function GET(
  req: Request,
  { params }: { params: Promise<{ kind: string; id: string; file: string }> },
) {
  const { kind, id, file } = await params;
  if (!(kind in ALLOWED) || ALLOWED[kind as keyof typeof ALLOWED] !== file || !UUID.test(id)) {
    return new Response('Not found', { status: 404 });
  }
  const token = (await cookies()).get(COOKIES.access)?.value;
  if (!token) return new Response('Please sign in', { status: 401 });
  const res = await fetch(`${API_URL}/v1/${kind}/${id}/${file}`, {
    headers: { authorization: `Bearer ${token}` },
    cache: 'no-store',
  }).catch(() => null);
  if (!res?.ok) return new Response('Not found', { status: res?.status === 401 ? 401 : 404 });
  return new Response(res.body, {
    headers: {
      'content-type': res.headers.get('content-type') ?? 'application/octet-stream',
      'cache-control': new URL(req.url).searchParams.has('v')
        ? 'private, max-age=604800, immutable'
        : 'private, no-cache',
      'x-content-type-options': 'nosniff',
    },
  });
}
