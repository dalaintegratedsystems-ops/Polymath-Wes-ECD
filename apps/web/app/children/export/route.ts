import { cookies } from 'next/headers';
import { COOKIES } from '@/lib/session-cookies';
import { API_URL } from '@/lib/server/api';

/** The monthly register as CSV (principals; the API checks the role and audits the read). */
export async function GET(req: Request) {
  const jar = await cookies();
  const token = jar.get(COOKIES.access)?.value;
  const centreId = jar.get(COOKIES.centre)?.value;
  if (!token || !centreId) return new Response('Please sign in', { status: 401 });
  const month = new URL(req.url).searchParams.get('month') ?? '';
  if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(month))
    return new Response('Choose a month', { status: 400 });
  const res = await fetch(`${API_URL}/v1/attendance/export?month=${month}`, {
    headers: { authorization: `Bearer ${token}`, 'x-centre-id': centreId },
    cache: 'no-store',
  }).catch(() => null);
  if (!res?.ok)
    return new Response('Could not export the register', { status: res?.status ?? 503 });
  return new Response(res.body, {
    headers: {
      'content-type': 'text/csv; charset=utf-8',
      'content-disposition': `attachment; filename="register-${month}.csv"`,
      'cache-control': 'private, no-store',
    },
  });
}
