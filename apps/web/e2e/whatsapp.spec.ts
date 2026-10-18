import { createHmac } from 'node:crypto';
import { expect, test } from '@playwright/test';

// Matches the e2e API settings in playwright.config.ts (labelled test-only values).
const SECRET = 'e2e-only-whatsapp-secret';
const MOCK_META = 'http://127.0.0.1:4200';

interface MetaCall {
  path: string;
  body: { to?: string; type?: string; text?: { body: string }; interactive?: unknown };
}

const signed = (body: string) => ({
  'content-type': 'application/json',
  'x-hub-signature-256': `sha256=${createHmac('sha256', SECRET).update(body).digest('hex')}`,
});

function message(from: string, id: string, text: string) {
  return JSON.stringify({
    object: 'whatsapp_business_account',
    entry: [
      {
        changes: [
          {
            value: {
              messages: [{ from, id, timestamp: '1792310400', type: 'text', text: { body: text } }],
            },
          },
        ],
      },
    ],
  });
}

test.describe('WhatsApp through the public web app', () => {
  test('Meta verification and signed messages reach Wes; replies go to the Graph API', async ({
    request,
  }) => {
    const verify = await request.get(
      '/api/whatsapp/webhook?hub.mode=subscribe&hub.verify_token=e2e-only-verify-token&hub.challenge=ping-42',
    );
    expect(verify.status()).toBe(200);
    expect(await verify.text()).toBe('ping-42');

    const unsigned = await request.post('/api/whatsapp/webhook', {
      headers: { 'content-type': 'application/json' },
      data: message('27600000001', 'wamid.e2e.0', 'hi'),
    });
    expect(unsigned.status()).toBe(401);

    const body = message('27600000001', `wamid.e2e.${Date.now()}`, 'Molo');
    const res = await request.post('/api/whatsapp/webhook', { headers: signed(body), data: body });
    expect(res.status()).toBe(200);

    // Nomsa is a principal: Wes answers with the menu, sent to Meta's Graph API.
    await expect
      .poll(async () => {
        const calls = (await (await request.get(`${MOCK_META}/_calls`)).json()) as MetaCall[];
        return calls.find((c) => c.body.to === '27600000001' && c.body.type === 'interactive')
          ?.path;
      })
      .toBe('/v21.0/555/messages');
  });
});
