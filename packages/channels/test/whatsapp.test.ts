import { createHmac } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { WhatsAppApiError, WhatsAppCloudAdapter } from '../src';

const SECRET = 'test-only-app-secret';

function fakeGraph(status = 200) {
  const calls: { url: string; body: unknown }[] = [];
  const fetchImpl = (async (url: string | URL, init?: RequestInit) => {
    const body =
      init?.body instanceof FormData ? 'form-data' : JSON.parse(String(init?.body ?? '{}'));
    calls.push({ url: String(url), body });
    const json = String(url).endsWith('/media')
      ? { id: 'media-1' }
      : { messages: [{ id: `wamid.${calls.length}` }] };
    return new Response(JSON.stringify(json), { status });
  }) as typeof fetch;
  return { calls, fetchImpl };
}

const adapter = (fetchImpl?: typeof fetch) =>
  new WhatsAppCloudAdapter({
    phoneNumberId: '123',
    accessToken: 'test-only-token',
    appSecret: SECRET,
    baseUrl: 'http://mock-meta',
    fetchImpl,
  });

describe('webhook signatures', () => {
  it('accepts Meta-signed bodies and refuses anything else', () => {
    const body = '{"entry":[]}';
    const sig = `sha256=${createHmac('sha256', SECRET).update(body).digest('hex')}`;
    const a = adapter();
    expect(a.verifySignature(body, { 'x-hub-signature-256': sig })).toBe(true);
    expect(a.verifySignature(`${body} `, { 'x-hub-signature-256': sig })).toBe(false);
    expect(a.verifySignature(body, {})).toBe(false);
    expect(a.verifySignature(body, { 'x-hub-signature-256': 'sha256=00' })).toBe(false);
  });
});

describe('inbound messages', () => {
  it('normalises text, list replies and template buttons; ignores status updates', () => {
    const payload = {
      entry: [
        {
          changes: [
            {
              value: {
                statuses: [{ id: 'wamid.status', status: 'delivered' }],
                messages: [
                  {
                    from: '27821234567',
                    id: 'wamid.1',
                    timestamp: '1792310400',
                    type: 'text',
                    text: { body: 'Molo Wes' },
                  },
                  {
                    from: '27821234567',
                    id: 'wamid.2',
                    type: 'interactive',
                    interactive: { list_reply: { id: 'menu.plan', title: 'This week’s plan' } },
                  },
                  {
                    from: '27821234567',
                    id: 'wamid.3',
                    type: 'button',
                    button: { payload: 'menu', text: 'Menu' },
                  },
                  { from: '27821234567', id: 'wamid.4', type: 'image' },
                  { from: 'not-a-number', id: 'wamid.5', type: 'text', text: { body: 'x' } },
                ],
              },
            },
          ],
        },
      ],
    };
    const inbound = adapter().parseInbound(payload);
    expect(
      inbound.map((m) => [m.providerMessageId, m.fromPhoneE164, m.text, m.menuChoice]),
    ).toEqual([
      ['wamid.1', '+27821234567', 'Molo Wes', undefined],
      ['wamid.2', '+27821234567', 'This week’s plan', 'menu.plan'],
      ['wamid.3', '+27821234567', 'Menu', 'menu'],
    ]);
    expect(inbound[0]!.receivedAt.toISOString()).toBe('2026-10-18T08:00:00.000Z');
  });
});

describe('sending', () => {
  it('splits long text, sends lists that fit and numbered menus that do not', async () => {
    const g = fakeGraph();
    await adapter(g.fetchImpl).send('+27821234567', [
      { kind: 'text', text: 'Children learn through play. '.repeat(60) },
      {
        kind: 'menu',
        text: 'What would you like?',
        options: [
          { id: 'a', label: 'Ask Wes' },
          { id: 'b', label: 'Plan' },
        ],
      },
      {
        kind: 'menu',
        text: 'Pick one',
        options: [{ id: 'c', label: 'A label that is far too long for a list row' }],
      },
    ]);
    const bodies = g.calls.map((c) => c.body as Record<string, unknown>);
    expect(g.calls.every((c) => c.url === 'http://mock-meta/v21.0/123/messages')).toBe(true);
    const texts = bodies.filter((b) => b.type === 'text');
    expect(texts.length).toBeGreaterThanOrEqual(3);
    expect(texts.every((t) => (t.text as { body: string }).body.length <= 1000)).toBe(true);
    expect(bodies.find((b) => b.type === 'interactive')).toMatchObject({ to: '27821234567' });
    expect((texts.at(-1)!.text as { body: string }).body).toContain(
      '1. A label that is far too long',
    );
  });

  it('uploads a PDF and sends it as a document; sends authentication templates with the code', async () => {
    const g = fakeGraph();
    const a = adapter(g.fetchImpl);
    const id = await a.uploadMedia(new Uint8Array([37, 80, 68, 70]), 'application/pdf', 'pack.pdf');
    await a.send('+27821234567', [
      { kind: 'document', mediaId: id, filename: 'pack.pdf', caption: 'Your pack' },
      {
        kind: 'template',
        name: 'wes_sign_in_code',
        language: 'en',
        variables: ['123456'],
        buttonText: '123456',
      },
    ]);
    expect(g.calls[0]).toEqual({ url: 'http://mock-meta/v21.0/123/media', body: 'form-data' });
    expect(g.calls[1]!.body).toMatchObject({
      type: 'document',
      document: { id: 'media-1', filename: 'pack.pdf' },
    });
    expect(g.calls[2]!.body).toMatchObject({
      type: 'template',
      template: {
        name: 'wes_sign_in_code',
        components: [
          { type: 'body', parameters: [{ type: 'text', text: '123456' }] },
          { type: 'button', sub_type: 'url' },
        ],
      },
    });
  });

  it('raises a typed error when Meta refuses', async () => {
    await expect(
      adapter(fakeGraph(401).fetchImpl).send('+27821234567', [{ kind: 'text', text: 'hi' }]),
    ).rejects.toBeInstanceOf(WhatsAppApiError);
  });
});
