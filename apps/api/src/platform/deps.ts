import type { Database, FieldCrypto } from '@wes/db';
import type { AgentServices } from './agent';
import type { WhatsAppCloudAdapter } from '@wes/channels';
import type { BlobStore } from './blob';

/** Something that can deliver a one-time PIN to a phone (WhatsApp template, SMS, console). */
export interface OtpSender {
  readonly channel: 'whatsapp' | 'sms' | 'console';
  send(phoneE164: string, code: string, purpose: 'sign_in' | 'consent'): Promise<void>;
}

/** Everything the API needs from the outside world, injected so tests can swap it. */
export interface AppDeps {
  db: Database;
  crypto: FieldCrypto;
  otpSender: OtpSender;
  agent: AgentServices;
  /** Private storage for registration documents. */
  blobs: BlobStore;
  /** Set when the WhatsApp channel is configured. */
  whatsapp?: WhatsAppCloudAdapter;
  now: () => Date;
}

/** Development only: prints the PIN to the API log. Refused in production by config. */
export function createConsoleOtpSender(log: (msg: string) => void): OtpSender {
  return {
    channel: 'console',
    async send(phone, code, purpose) {
      log(`[dev] ${purpose} PIN for ${phone.slice(0, 5)}…${phone.slice(-2)}: ${code}`);
    },
  };
}

/** Development/e2e: also writes each PIN as a JSON line so automated tests can read it. */
export function createFileOtpSender(file: string, inner: OtpSender): OtpSender {
  return {
    channel: inner.channel,
    async send(phone, code, purpose) {
      await inner.send(phone, code, purpose);
      const { appendFile } = await import('node:fs/promises');
      const line = JSON.stringify({ phone, code, purpose, at: new Date().toISOString() });
      await appendFile(file, `${line}\n`);
    },
  };
}

/** Test helper: remembers the last PIN sent to each phone. */
export function createMemoryOtpSender(): OtpSender & { last(phone: string): string | undefined } {
  const sent = new Map<string, string>();
  return {
    channel: 'console',
    async send(phone, code) {
      sent.set(phone, code);
    },
    last: (phone) => sent.get(phone),
  };
}

/** Sign-in and consent PINs as an approved WhatsApp authentication template. */
export function createWhatsAppOtpSender(
  adapter: WhatsAppCloudAdapter,
  opts: { template: string; language: string },
): OtpSender {
  return {
    channel: 'whatsapp',
    async send(phone, code) {
      await adapter.send(phone, [
        {
          kind: 'template',
          name: opts.template,
          language: opts.language,
          variables: [code],
          buttonText: code,
        },
      ]);
    },
  };
}
