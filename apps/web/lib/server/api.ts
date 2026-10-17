import 'server-only';
import { randomUUID } from 'node:crypto';
import type { ErrorEnvelope } from '@wes/shared';

/** The API is called from the server only; the browser never sees tokens. */
export const API_URL =
  process.env.API_URL ?? process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:4000';

export class ApiError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    message: string,
    readonly details?: { path: string; message: string }[],
  ) {
    super(message);
  }

  /** The friendliest message for a person: a field message if there is one. */
  get userMessage(): string {
    return this.details?.[0]?.message ?? this.message;
  }
}

export async function api<T>(
  path: string,
  opts: {
    method?: 'GET' | 'POST' | 'PATCH';
    body?: unknown;
    token?: string;
    centreId?: string;
    /** Writes get an idempotency key so a retried submit never double-saves. */
    idempotencyKey?: string;
  } = {},
): Promise<T> {
  const method = opts.method ?? 'GET';
  const headers: Record<string, string> = { accept: 'application/json' };
  if (opts.body !== undefined) headers['content-type'] = 'application/json';
  if (opts.token) headers.authorization = `Bearer ${opts.token}`;
  if (opts.centreId) headers['x-centre-id'] = opts.centreId;
  if (method !== 'GET') headers['idempotency-key'] = opts.idempotencyKey ?? randomUUID();

  let res: Response;
  try {
    res = await fetch(`${API_URL}${path}`, {
      method,
      headers,
      body: opts.body === undefined ? undefined : JSON.stringify(opts.body),
      cache: 'no-store',
    });
  } catch {
    throw new ApiError(
      503,
      'unavailable',
      'We can’t reach Wes right now. Check your signal and try again.',
    );
  }

  if (res.status === 204) return undefined as T;
  const json = (await res.json().catch(() => null)) as unknown;
  if (!res.ok) {
    const err = (json as ErrorEnvelope | null)?.error;
    throw new ApiError(
      res.status,
      err?.code ?? 'internal',
      err?.message ?? 'Something went wrong.',
      err?.details,
    );
  }
  return json as T;
}
