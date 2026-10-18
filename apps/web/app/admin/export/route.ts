import { cookies } from 'next/headers';
import { COOKIES } from '@/lib/session-cookies';
import { API_URL } from '@/lib/server/api';

const KEYS = ['from', 'to', 'province', 'city', 'size', 'status', 'role'];

/** CSV download of the filtered centre table (platform admins; the API checks the role). */
export async function GET(req: Request) {
  const token = (await cookies()).get(COOKIES.access)?.value;
  if (!token) return new Response('Please sign in', { status: 401 });
  const incoming = new URL(req.url).searchParams;
  const qs = new URLSearchParams();
  for (const k of KEYS) {
    const v = incoming.get(k);
    if (v) qs.set(k, v.slice(0, 60));
  }
  const res = await fetch(`${API_URL}/v1/admin/metrics/export.csv?${qs}`, {
    headers: { authorization: `Bearer ${token}` },
    cache: 'no-store',
  }).catch(() => null);
  if (!res?.ok) return new Response('Could not export', { status: res?.status ?? 503 });
  return new Response(res.body, {
    headers: {
      'content-type': 'text/csv; charset=utf-8',
      'content-disposition':
        res.headers.get('content-disposition') ?? 'attachment; filename="wes-centres.csv"',
      'cache-control': 'no-store',
    },
  });
}
