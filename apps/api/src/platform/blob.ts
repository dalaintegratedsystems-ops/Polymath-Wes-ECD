import { mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { dirname, join, resolve, sep } from 'node:path';

/**
 * Private storage for registration documents. Three drivers behind one small interface:
 * memory (tests), filesystem (local development) and Azure Blob (production, authenticated
 * with the container app's managed identity: no keys, no SDK).
 */
export interface BlobStore {
  readonly driver: 'memory' | 'filesystem' | 'azure';
  put(key: string, bytes: Buffer, contentType: string): Promise<void>;
  get(key: string): Promise<{ bytes: Buffer; contentType: string } | null>;
  delete(key: string): Promise<void>;
}

const KEY = /^[a-z0-9][a-z0-9/_.-]{0,250}$/;

function assertKey(key: string): void {
  if (!KEY.test(key) || key.includes('..')) throw new Error(`invalid blob key: ${key}`);
}

export function createMemoryBlobStore(): BlobStore {
  const items = new Map<string, { bytes: Buffer; contentType: string }>();
  return {
    driver: 'memory',
    async put(key, bytes, contentType) {
      assertKey(key);
      items.set(key, { bytes: Buffer.from(bytes), contentType });
    },
    async get(key) {
      assertKey(key);
      return items.get(key) ?? null;
    },
    async delete(key) {
      items.delete(key);
    },
  };
}

export function createFilesystemBlobStore(root: string): BlobStore {
  const base = resolve(root);
  const pathOf = (key: string) => {
    assertKey(key);
    const full = resolve(join(base, key));
    if (!full.startsWith(base + sep)) throw new Error('blob key escapes the store');
    return full;
  };
  return {
    driver: 'filesystem',
    async put(key, bytes, contentType) {
      const path = pathOf(key);
      await mkdir(dirname(path), { recursive: true });
      await writeFile(path, bytes);
      await writeFile(`${path}.type`, contentType);
    },
    async get(key) {
      const path = pathOf(key);
      try {
        const [bytes, type] = await Promise.all([readFile(path), readFile(`${path}.type`, 'utf8')]);
        return { bytes, contentType: type };
      } catch {
        return null;
      }
    },
    async delete(key) {
      const path = pathOf(key);
      await rm(path, { force: true });
      await rm(`${path}.type`, { force: true });
    },
  };
}

type Fetch = typeof fetch;

/**
 * Azure Blob over REST. Tokens come from the Container Apps managed identity endpoint
 * (IDENTITY_ENDPOINT / IDENTITY_HEADER) and are cached until shortly before they expire.
 */
export function createAzureBlobStore(opts: {
  accountUrl: string;
  container: string;
  clientId?: string;
  fetchImpl?: Fetch;
  env?: NodeJS.ProcessEnv;
  now?: () => number;
}): BlobStore {
  const f = opts.fetchImpl ?? fetch;
  const env = opts.env ?? process.env;
  const now = opts.now ?? Date.now;
  const base = `${opts.accountUrl.replace(/\/$/, '')}/${opts.container}`;
  let cached: { token: string; expiresAt: number } | null = null;

  async function token(): Promise<string> {
    if (cached && cached.expiresAt - 5 * 60_000 > now()) return cached.token;
    const endpoint = env.IDENTITY_ENDPOINT;
    const header = env.IDENTITY_HEADER;
    if (!endpoint || !header) throw new Error('Managed identity is not available');
    const url = new URL(endpoint);
    url.searchParams.set('resource', 'https://storage.azure.com/');
    url.searchParams.set('api-version', '2019-08-01');
    if (opts.clientId) url.searchParams.set('client_id', opts.clientId);
    const res = await f(url, { headers: { 'X-IDENTITY-HEADER': header } });
    if (!res.ok) throw new Error(`Managed identity token request failed: ${res.status}`);
    const body = (await res.json()) as { access_token: string; expires_on: string | number };
    cached = { token: body.access_token, expiresAt: Number(body.expires_on) * 1000 };
    return cached.token;
  }

  async function call(method: string, key: string, init: RequestInit = {}) {
    assertKey(key);
    return f(`${base}/${key}`, {
      ...init,
      method,
      headers: {
        authorization: `Bearer ${await token()}`,
        'x-ms-version': '2023-11-03',
        'x-ms-date': new Date(now()).toUTCString(),
        ...(init.headers as Record<string, string>),
      },
    });
  }

  return {
    driver: 'azure',
    async put(key, bytes, contentType) {
      const res = await call('PUT', key, {
        body: bytes,
        headers: { 'x-ms-blob-type': 'BlockBlob', 'content-type': contentType },
      });
      if (!res.ok) throw new Error(`Blob upload failed: ${res.status}`);
    },
    async get(key) {
      const res = await call('GET', key);
      if (res.status === 404) return null;
      if (!res.ok) throw new Error(`Blob download failed: ${res.status}`);
      return {
        bytes: Buffer.from(await res.arrayBuffer()),
        contentType: res.headers.get('content-type') ?? 'application/octet-stream',
      };
    },
    async delete(key) {
      const res = await call('DELETE', key);
      if (!res.ok && res.status !== 404) throw new Error(`Blob delete failed: ${res.status}`);
    },
  };
}
