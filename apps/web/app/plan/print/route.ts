import { cookies } from 'next/headers';
import { COOKIES } from '@/lib/session-cookies';
import { API_URL } from '@/lib/server/api';

/** Printable PDFs from a plain form post (works without JavaScript). */
export async function POST(req: Request) {
  const jar = await cookies();
  const token = jar.get(COOKIES.access)?.value;
  const centreId = jar.get(COOKIES.centre)?.value;
  if (!token || !centreId) return new Response('Please sign in', { status: 401 });
  const form = await req.formData();
  const kind = String(form.get('kind') ?? '');
  const title = String(form.get('title') ?? '').slice(0, 60);
  const words = String(form.get('words') ?? '')
    .split(',')
    .map((w) => w.trim())
    .filter(Boolean)
    .slice(0, 12);
  const upTo = Number(form.get('upTo') ?? 5) || 5;
  const res = await fetch(`${API_URL}/v1/printables`, {
    method: 'POST',
    headers: {
      authorization: `Bearer ${token}`,
      'x-centre-id': centreId,
      'content-type': 'application/json',
    },
    body: JSON.stringify({ kind, title, words, upTo }),
    cache: 'no-store',
  }).catch(() => null);
  if (!res?.ok) {
    const message =
      res?.status === 422
        ? 'Please check the title and words (letters only, up to 14 characters each).'
        : 'We could not make that sheet right now. Please try again.';
    return new Response(message, {
      status: res?.status ?? 502,
      headers: { 'content-type': 'text/plain; charset=utf-8' },
    });
  }
  return new Response(res.body, {
    headers: {
      'content-type': 'application/pdf',
      'content-disposition': `attachment; filename="${kind}.pdf"`,
      'cache-control': 'no-store',
    },
  });
}
