/**
 * WhatsApp end to end against a mock Meta server: signed webhooks in, Graph API calls out.
 */
import { createHmac } from 'node:crypto';
import { createServer, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { WhatsAppCloudAdapter } from '@wes/channels';
import { SEED_IDS } from '@wes/db';
import { sendDueReminders, whatsappIdle } from '../src/modules/channels/routes';
import { createWhatsAppOtpSender } from '../src/platform/deps';
import { loadConfig } from '../src/config';
import { createHarness, type Harness } from './helpers';

const SECRET = 'test-only-whatsapp-app-secret';
const VERIFY = 'test-only-verify-token-123';

interface MetaCall {
  path: string;
  body: Record<string, unknown> | string;
}

let h: Harness;
let meta: Server;
let calls: MetaCall[] = [];
let n = 0;

beforeAll(async () => {
  meta = createServer((req, res) => {
    let raw = '';
    req.on('data', (c) => (raw += c));
    req.on('end', () => {
      const isJson = (req.headers['content-type'] ?? '').includes('json');
      calls.push({ path: req.url ?? '', body: isJson ? JSON.parse(raw) : raw });
      res.setHeader('content-type', 'application/json');
      res.end(
        JSON.stringify(
          req.url?.endsWith('/media')
            ? { id: 'media-77' }
            : { messages: [{ id: `wamid.out${calls.length}` }] },
        ),
      );
    });
  });
  await new Promise<void>((r) => meta.listen(0, '127.0.0.1', r));
  const { port } = meta.address() as AddressInfo;
  h = await createHarness({ config: { WHATSAPP_VERIFY_TOKEN: VERIFY } });
  h.deps.whatsapp = new WhatsAppCloudAdapter({
    phoneNumberId: '555',
    accessToken: 'test-only-token',
    appSecret: SECRET,
    baseUrl: `http://127.0.0.1:${port}`,
  });
});
afterAll(async () => {
  await h.close();
  await new Promise<void>((r) => meta.close(() => r()));
});
beforeEach(() => {
  calls = [];
});

function inbound(from: string, message: Record<string, unknown>) {
  n += 1;
  const payload = {
    object: 'whatsapp_business_account',
    entry: [
      {
        changes: [
          {
            value: {
              messages: [{ from, id: `wamid.in${n}`, timestamp: '1792310400', ...message }],
            },
          },
        ],
      },
    ],
  };
  return JSON.stringify(payload);
}

async function post(body: string, signed = true) {
  const sig = createHmac('sha256', SECRET).update(body).digest('hex');
  const res = await h.app.inject({
    method: 'POST',
    url: '/v1/channels/whatsapp/webhook',
    headers: {
      'content-type': 'application/json',
      ...(signed ? { 'x-hub-signature-256': `sha256=${sig}` } : {}),
    },
    payload: body,
  });
  await whatsappIdle();
  return res;
}

const NOMSA = '27600000001';
const sentTexts = () =>
  calls
    .filter((c) => typeof c.body === 'object' && (c.body as { type?: string }).type === 'text')
    .map((c) => (c.body as { text: { body: string } }).text.body);

describe('webhook security', () => {
  it('completes Meta verification only with the right token', async () => {
    const ok = await h.app.inject({
      method: 'GET',
      url: `/v1/channels/whatsapp/webhook?hub.mode=subscribe&hub.verify_token=${VERIFY}&hub.challenge=abc123`,
    });
    expect(ok.statusCode).toBe(200);
    expect(ok.body).toBe('abc123');
    const bad = await h.app.inject({
      method: 'GET',
      url: '/v1/channels/whatsapp/webhook?hub.mode=subscribe&hub.verify_token=nope&hub.challenge=abc',
    });
    expect(bad.statusCode).toBe(403);
  });

  it('refuses unsigned and wrongly signed messages', async () => {
    const body = inbound(NOMSA, { type: 'text', text: { body: 'hi' } });
    expect((await post(body, false)).statusCode).toBe(401);
    const forged = await h.app.inject({
      method: 'POST',
      url: '/v1/channels/whatsapp/webhook',
      headers: { 'content-type': 'application/json', 'x-hub-signature-256': 'sha256=deadbeef' },
      payload: body,
    });
    expect(forged.statusCode).toBe(401);
    expect(calls).toEqual([]);
  });
});

describe('conversations', () => {
  it('points unknown numbers to the app and reveals nothing else', async () => {
    await post(
      inbound('27719998888', { type: 'text', text: { body: 'What children are at Siyakhula?' } }),
    );
    expect(sentTexts()).toHaveLength(1);
    expect(sentTexts()[0]).toMatch(/create your account in the Wes app/);
    expect(sentTexts()[0]).not.toMatch(/Siyakhula|Nomsa/);
  });

  it('greets a principal with a menu and follows numbered replies', async () => {
    await post(inbound(NOMSA, { type: 'text', text: { body: 'Molo' } }));
    const menu = calls[0]!.body as {
      type: string;
      interactive: { action: { sections: { rows: { id: string }[] }[] } };
    };
    expect(calls[0]!.path).toBe('/v21.0/555/messages');
    expect(menu.type).toBe('interactive');
    expect(menu.interactive.action.sections[0]!.rows.map((r) => r.id)).toEqual([
      'menu.ask',
      'menu.registration',
      'menu.plan',
      'menu.pack',
    ]);

    calls = [];
    await post(inbound(NOMSA, { type: 'text', text: { body: '2' } }));
    expect(sentTexts()[0]).toMatch(/registration is \d+% done/);

    calls = [];
    await post(
      inbound(NOMSA, {
        type: 'interactive',
        interactive: { list_reply: { id: 'menu.plan', title: 'This week’s plan' } },
      }),
    );
    expect(sentTexts()[0]).toMatch(/no plan for this week yet/);
  });

  it('sends the application pack as a PDF document', async () => {
    await post(inbound(NOMSA, { type: 'text', text: { body: '4' } }));
    const media = calls.find((c) => c.path === '/v21.0/555/media');
    expect(media).toBeDefined();
    expect(String(media!.body)).toContain('application/pdf');
    const doc = calls.find(
      (c) => typeof c.body === 'object' && (c.body as { type?: string }).type === 'document',
    );
    expect(doc!.body).toMatchObject({
      document: { id: 'media-77', filename: 'application-pack.pdf' },
    });
  });

  it('answers questions with the same Wes as the app, and handles each message once', async () => {
    const body = inbound(NOMSA, { type: 'text', text: { body: 'What is the registration fee?' } });
    await post(body);
    await post(body); // Meta retries
    const texts = sentTexts();
    expect(texts).toHaveLength(1);
    expect(texts[0]).toMatch(/Reply MENU for options\.$/);
    expect(texts[0]!.length).toBeLessThanOrEqual(1000);
  });

  it('runs the child protection flow on WhatsApp too', async () => {
    await post(
      inbound(NOMSA, {
        type: 'text',
        text: { body: 'A child told me her uncle hits her at home' },
      }),
    );
    expect(sentTexts().join('\n')).toMatch(/116/);
    const [row] = await h.db.query(
      `select channel from audit_log where action = 'child_protection_escalation' order by occurred_at desc limit 1`,
    );
    expect(row?.channel).toBe('whatsapp');
  });
});

describe('reminders and PINs', () => {
  it('sends due reminders once: a message inside the 24-hour window, a template outside it', async () => {
    await h.db.query(
      `insert into reminders (centre_id, user_id, kind, message, due_at) values
        ($1, $2, 'custom', 'Renew the fire certificate', now() - interval '1 hour'),
        ($3, $4, 'custom', 'Check the first aid kit', now() - interval '1 hour')`,
      [
        SEED_IDS.centres.siyakhula,
        SEED_IDS.users.principalNomsa,
        SEED_IDS.centres.ikhaya,
        SEED_IDS.users.principalFatima,
      ],
    );
    // The reminder job runs on real time; Nomsa writes now, so she is inside the window.
    h.clock.now = new Date();
    await post(inbound(NOMSA, { type: 'text', text: { body: 'hi' } }));
    calls = [];
    const config = loadConfig({ ...process.env, NODE_ENV: 'test' });
    expect(await sendDueReminders(h.deps, config)).toBe(2);
    expect(await sendDueReminders(h.deps, config)).toBe(0);
    const toNomsa = calls.find((c) => (c.body as { to?: string }).to === NOMSA)!.body as {
      type: string;
    };
    const toFatima = calls.find((c) => (c.body as { to?: string }).to === '27600000003')!.body as {
      type: string;
      template?: { name: string };
    };
    expect(toNomsa.type).toBe('text'); // Nomsa has been chatting today
    expect(toFatima).toMatchObject({ type: 'template', template: { name: 'wes_reminder' } });
  });

  it('delivers sign-in PINs as the approved authentication template', async () => {
    const sender = createWhatsAppOtpSender(h.deps.whatsapp!, {
      template: 'wes_sign_in_code',
      language: 'en',
    });
    await sender.send('+27600000002', '482913', 'sign_in');
    expect(calls[0]!.body).toMatchObject({
      to: '27600000002',
      type: 'template',
      template: {
        name: 'wes_sign_in_code',
        components: [{ type: 'body', parameters: [{ text: '482913' }] }, { type: 'button' }],
      },
    });
  });
});
