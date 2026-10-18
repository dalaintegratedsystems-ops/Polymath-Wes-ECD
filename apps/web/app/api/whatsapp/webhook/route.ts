import { API_URL } from '@/lib/server/api';

/**
 * Meta's webhooks reach the public web app; the API stays private. Requests are passed on
 * byte for byte with Meta's signature header, so the API verifies the signature itself.
 */
const TARGET = `${API_URL}/v1/channels/whatsapp/webhook`;

export async function GET(req: Request) {
  const query = new URL(req.url).search;
  const res = await fetch(`${TARGET}${query}`, { cache: 'no-store' }).catch(() => null);
  if (!res) return new Response('Unavailable', { status: 503 });
  return new Response(await res.text(), {
    status: res.status,
    headers: { 'content-type': 'text/plain; charset=utf-8' },
  });
}

export async function POST(req: Request) {
  const body = await req.text();
  if (body.length > 1_000_000) return new Response('Too large', { status: 413 });
  const signature = req.headers.get('x-hub-signature-256');
  const res = await fetch(TARGET, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      ...(signature ? { 'x-hub-signature-256': signature } : {}),
    },
    body,
    cache: 'no-store',
  }).catch(() => null);
  if (!res) return new Response('Unavailable', { status: 503 });
  return new Response(await res.text(), {
    status: res.status,
    headers: { 'content-type': 'application/json' },
  });
}
