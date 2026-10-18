import { cookies } from 'next/headers';
import { COOKIES } from '@/lib/session-cookies';
import { API_URL } from '@/lib/server/api';

/**
 * Replays writes queued on the phone while offline (lib/offline/outbox.ts). Only the
 * offline-capable writes are allowed through, each with the idempotency key it was given
 * when it was first made, so a retried sync never saves twice.
 */
const ALLOWED: { method: string; path: RegExp }[] = [
  { method: 'POST', path: /^\/v1\/centres\/[0-9a-f-]{36}\/attendance$/ },
];

export async function POST(req: Request) {
  const token = (await cookies()).get(COOKIES.access)?.value;
  if (!token) return Response.json({ status: 401, body: null }, { status: 401 });
  const item = (await req.json().catch(() => null)) as {
    method?: string;
    path?: string;
    body?: unknown;
    idempotencyKey?: string;
  } | null;
  if (
    !item?.method ||
    !item.path ||
    !item.idempotencyKey ||
    !/^[\w-]{8,128}$/.test(item.idempotencyKey) ||
    !ALLOWED.some((a) => a.method === item.method && a.path.test(item.path!))
  ) {
    return Response.json({ status: 400, body: null }, { status: 400 });
  }
  const res = await fetch(`${API_URL}${item.path}`, {
    method: item.method,
    headers: {
      authorization: `Bearer ${token}`,
      'content-type': 'application/json',
      'idempotency-key': item.idempotencyKey,
    },
    body: JSON.stringify(item.body),
    cache: 'no-store',
  }).catch(() => null);
  if (!res) return Response.json({ status: 503, body: null }, { status: 503 });
  const body = await res.json().catch(() => null);
  // Always 200 to the page: the outbox reads the API status from the body.
  return Response.json({ status: res.status, body });
}
