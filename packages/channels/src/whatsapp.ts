import { createHmac, timingSafeEqual } from 'node:crypto';
import type { ChannelAdapter, NormalisedInbound, OutboundPart, SendResult } from './types';
import { formatNumberedMenu, splitForWhatsApp } from './whatsapp-format';

/**
 * Meta WhatsApp Cloud API (BSP-agnostic: a BSP adapter implements the same interface).
 * Webhooks are verified with the app secret (X-Hub-Signature-256); messages are sent through
 * the Graph API. `baseUrl` and `fetchImpl` let tests point it at a mock Meta server.
 */
export interface WhatsAppOptions {
  phoneNumberId: string;
  accessToken: string;
  appSecret: string;
  graphVersion?: string;
  baseUrl?: string;
  fetchImpl?: typeof fetch;
}

export class WhatsAppApiError extends Error {
  constructor(
    readonly status: number,
    message: string,
  ) {
    super(message);
    this.name = 'WhatsAppApiError';
  }
}

interface MetaMessage {
  from?: string;
  id?: string;
  timestamp?: string;
  type?: string;
  text?: { body?: string };
  interactive?: {
    button_reply?: { id: string; title: string };
    list_reply?: { id: string; title: string };
  };
  button?: { payload?: string; text?: string };
}

/** Interactive lists allow up to 10 rows with titles of at most 24 characters. */
const LIST_MAX_ROWS = 10;
const ROW_TITLE_MAX = 24;

export class WhatsAppCloudAdapter implements ChannelAdapter {
  readonly kind = 'whatsapp' as const;
  private readonly base: string;
  private readonly f: typeof fetch;

  constructor(private readonly opts: WhatsAppOptions) {
    this.base = `${(opts.baseUrl ?? 'https://graph.facebook.com').replace(/\/$/, '')}/${opts.graphVersion ?? 'v21.0'}`;
    this.f = opts.fetchImpl ?? fetch;
  }

  verifySignature(rawBody: string, headers: Record<string, string | undefined>): boolean {
    const header = headers['x-hub-signature-256'];
    if (!header?.startsWith('sha256=')) return false;
    const expected = createHmac('sha256', this.opts.appSecret).update(rawBody, 'utf8').digest();
    const given = Buffer.from(header.slice(7), 'hex');
    return given.length === expected.length && timingSafeEqual(given, expected);
  }

  parseInbound(payload: unknown): NormalisedInbound[] {
    const out: NormalisedInbound[] = [];
    const entries = (
      payload as { entry?: { changes?: { value?: { messages?: MetaMessage[] } }[] }[] }
    )?.entry;
    for (const entry of entries ?? []) {
      for (const change of entry.changes ?? []) {
        for (const m of change.value?.messages ?? []) {
          if (!m.from || !m.id || !/^\d{8,15}$/.test(m.from)) continue;
          const choice = m.interactive?.button_reply ?? m.interactive?.list_reply;
          const text = m.text?.body ?? choice?.title ?? m.button?.text ?? m.button?.payload ?? '';
          if (!text && !choice) continue; // images, voice notes and stickers: not yet
          out.push({
            channel: 'whatsapp',
            providerMessageId: m.id,
            fromPhoneE164: `+${m.from}`,
            text: text.slice(0, 4000),
            ...(choice
              ? { menuChoice: choice.id }
              : m.button?.payload
                ? { menuChoice: m.button.payload }
                : {}),
            receivedAt: m.timestamp ? new Date(Number(m.timestamp) * 1000) : new Date(),
          });
        }
      }
    }
    return out;
  }

  private async post(
    path: string,
    body: unknown,
  ): Promise<{ messages?: { id: string }[]; id?: string }> {
    const res = await this.f(`${this.base}/${this.opts.phoneNumberId}/${path}`, {
      method: 'POST',
      headers: {
        authorization: `Bearer ${this.opts.accessToken}`,
        'content-type': 'application/json',
      },
      body: JSON.stringify(body),
    });
    if (!res.ok) throw new WhatsAppApiError(res.status, `WhatsApp ${path} failed: ${res.status}`);
    return (await res.json()) as { messages?: { id: string }[] };
  }

  /** Upload a file (e.g. a PDF) so it can be sent as a document without a public link. */
  async uploadMedia(bytes: Uint8Array, mimeType: string, filename: string): Promise<string> {
    const form = new FormData();
    form.set('messaging_product', 'whatsapp');
    form.set('type', mimeType);
    form.set('file', new Blob([bytes], { type: mimeType }), filename);
    const res = await this.f(`${this.base}/${this.opts.phoneNumberId}/media`, {
      method: 'POST',
      headers: { authorization: `Bearer ${this.opts.accessToken}` },
      body: form,
    });
    if (!res.ok)
      throw new WhatsAppApiError(res.status, `WhatsApp media upload failed: ${res.status}`);
    return ((await res.json()) as { id: string }).id;
  }

  async send(toPhoneE164: string, parts: OutboundPart[]): Promise<SendResult> {
    const to = toPhoneE164.replace(/^\+/, '');
    const ids: string[] = [];
    const push = async (message: Record<string, unknown>) => {
      const r = await this.post('messages', {
        messaging_product: 'whatsapp',
        recipient_type: 'individual',
        to,
        ...message,
      });
      ids.push(...(r.messages ?? []).map((m) => m.id));
    };
    for (const part of parts) {
      if (part.kind === 'text') {
        for (const chunk of splitForWhatsApp(part.text)) {
          await push({ type: 'text', text: { body: chunk, preview_url: false } });
        }
      } else if (part.kind === 'menu') {
        const fitsList =
          part.options.length <= LIST_MAX_ROWS &&
          part.options.every((o) => o.label.length <= ROW_TITLE_MAX) &&
          part.text.length <= 1024;
        if (fitsList) {
          await push({
            type: 'interactive',
            interactive: {
              type: 'list',
              body: { text: part.text },
              action: {
                button: 'Choose',
                sections: [
                  {
                    title: 'Options',
                    rows: part.options.map((o) => ({ id: o.id, title: o.label })),
                  },
                ],
              },
            },
          });
        } else {
          // Numbered text works on every phone.
          await push({ type: 'text', text: { body: formatNumberedMenu(part.text, part.options) } });
        }
      } else if (part.kind === 'document') {
        await push({
          type: 'document',
          document: {
            ...(part.mediaId ? { id: part.mediaId } : { link: part.url }),
            filename: part.filename,
            ...(part.caption ? { caption: part.caption } : {}),
          },
        });
      } else {
        await push({
          type: 'template',
          template: {
            name: part.name,
            language: { code: part.language },
            components: [
              ...(part.variables.length
                ? [
                    {
                      type: 'body',
                      parameters: part.variables.map((v) => ({ type: 'text', text: v })),
                    },
                  ]
                : []),
              // Authentication templates: the code also fills the copy-code button.
              ...(part.buttonText
                ? [
                    {
                      type: 'button',
                      sub_type: 'url',
                      index: '0',
                      parameters: [{ type: 'text', text: part.buttonText }],
                    },
                  ]
                : []),
            ],
          },
        });
      }
    }
    return { providerMessageIds: ids };
  }
}
