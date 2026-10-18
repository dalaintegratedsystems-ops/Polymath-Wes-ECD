import type { ChannelAdapter, NormalisedInbound, SendResult } from './types';

class NotBuiltYet extends Error {
  constructor(what: string, milestone: string) {
    super(`${what} is built in ${milestone}`);
  }
}

/** SMS fallback for OTPs and users without WhatsApp. Provider chosen in M1. */
export class SmsAdapter implements ChannelAdapter {
  readonly kind = 'sms' as const;
  verifySignature(): boolean {
    throw new NotBuiltYet('SMS signature verification', 'Milestone 1');
  }
  parseInbound(): NormalisedInbound[] {
    throw new NotBuiltYet('SMS inbound parsing', 'Milestone 1');
  }
  async send(): Promise<SendResult> {
    throw new NotBuiltYet('SMS sending', 'Milestone 1');
  }
}

/** The PWA: messages arrive over the authenticated API, replies stream over SSE. */
export class WebAdapter implements ChannelAdapter {
  readonly kind = 'web' as const;
  verifySignature(): boolean {
    return true; // Authenticated by bearer token at the API layer instead.
  }
  parseInbound(payload: unknown): NormalisedInbound[] {
    const p = payload as { id: string; phone: string; text: string };
    return [
      {
        channel: 'web',
        providerMessageId: p.id,
        fromPhoneE164: p.phone,
        text: p.text,
        receivedAt: new Date(),
      },
    ];
  }
  async send(): Promise<SendResult> {
    return { providerMessageIds: [] }; // Delivered via the SSE stream.
  }
}
