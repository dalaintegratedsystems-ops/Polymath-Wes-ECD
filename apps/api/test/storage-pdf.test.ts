import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { PDFDocument } from 'pdf-lib';
import { describe, expect, it } from 'vitest';
import { createAzureBlobStore, createFilesystemBlobStore } from '../src/platform/blob';
import { markdownPdf, pdfSafe } from '../src/platform/pdf';

describe('filesystem blob store', () => {
  it('round-trips files and refuses keys that escape the folder', async () => {
    const store = createFilesystemBlobStore(mkdtempSync(join(tmpdir(), 'wes-blobs-')));
    await store.put('centres/a/documents/1', Buffer.from('hello'), 'text/plain');
    expect(await store.get('centres/a/documents/1')).toEqual({
      bytes: Buffer.from('hello'),
      contentType: 'text/plain',
    });
    await store.delete('centres/a/documents/1');
    expect(await store.get('centres/a/documents/1')).toBeNull();
    await expect(store.put('../outside', Buffer.from('x'), 'text/plain')).rejects.toThrow();
    await expect(store.put('/etc/passwd', Buffer.from('x'), 'text/plain')).rejects.toThrow();
  });
});

describe('Azure blob store', () => {
  it('uses the managed identity token, caches it, and calls the blob REST API', async () => {
    const calls: { url: string; method: string; headers: Record<string, string> }[] = [];
    const fetchImpl = (async (input: string | URL, init?: RequestInit) => {
      const url = String(input);
      const headers = (init?.headers ?? {}) as Record<string, string>;
      calls.push({ url, method: init?.method ?? 'GET', headers });
      if (url.startsWith('http://identity')) {
        return new Response(JSON.stringify({ access_token: 'tok', expires_on: 2_000_000_000 }), {
          status: 200,
        });
      }
      if ((init?.method ?? 'GET') === 'GET') {
        return url.endsWith('/missing')
          ? new Response('', { status: 404 })
          : new Response('file', { status: 200, headers: { 'content-type': 'image/jpeg' } });
      }
      return new Response('', { status: 201 });
    }) as typeof fetch;
    const store = createAzureBlobStore({
      accountUrl: 'https://acct.blob.core.windows.net/',
      container: 'documents',
      clientId: 'client-123',
      fetchImpl,
      env: { IDENTITY_ENDPOINT: 'http://identity/token', IDENTITY_HEADER: 'secret-header' },
      now: () => 1_700_000_000_000,
    });
    await store.put('centres/a/documents/1', Buffer.from('x'), 'image/jpeg');
    const got = await store.get('centres/a/documents/1');
    expect(got?.contentType).toBe('image/jpeg');
    expect(await store.get('missing')).toBeNull();

    const tokenCalls = calls.filter((c) => c.url.startsWith('http://identity'));
    expect(tokenCalls).toHaveLength(1);
    expect(tokenCalls[0]!.url).toContain('client_id=client-123');
    expect(tokenCalls[0]!.headers['X-IDENTITY-HEADER']).toBe('secret-header');
    const put = calls.find((c) => c.method === 'PUT')!;
    expect(put.url).toBe('https://acct.blob.core.windows.net/documents/centres/a/documents/1');
    expect(put.headers.authorization).toBe('Bearer tok');
    expect(put.headers['x-ms-blob-type']).toBe('BlockBlob');
  });
});

describe('PDFs', () => {
  it('keeps text printable with standard fonts', () => {
    expect(pdfSafe('Molo — “hello” … ✓')).toBe('Molo - "hello" ... ?');
    expect(pdfSafe('Ngiyabonga, baie dankie: ê ë ô')).toBe('Ngiyabonga, baie dankie: ê ë ô');
  });

  it('renders Markdown over several pages with a draft mark', async () => {
    const long = Array.from(
      { length: 120 },
      (_, i) => `- Point ${i + 1} about keeping children safe`,
    ).join('\n');
    const bytes = await markdownPdf({
      title: 'Safety policy',
      subtitle: 'Test centre',
      markdown: `## Purpose\n\nKeep children safe.\n\n${long}`,
      draft: true,
      footer: 'Test centre',
    });
    const doc = await PDFDocument.load(bytes);
    expect(doc.getPageCount()).toBeGreaterThan(1);
    expect(bytes.length).toBeLessThan(60_000);
  });
});
