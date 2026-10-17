import type { Database, FieldCrypto } from '@wes/db';

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
