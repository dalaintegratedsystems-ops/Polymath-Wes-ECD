import type { ChannelAdapter, NormalisedInbound, OutboundPart, SendResult } from './types';

class NotBuiltYet extends Error {
  constructor(what: string, milestone: string) {
    super(`${what} is built in ${milestone}`);
  }
}

/** Meta WhatsApp Cloud API. BSP-agnostic: a BSP adapter implements the same interface. Built in M6. */
export class WhatsAppCloudAdapter implements ChannelAdapter {
  readonly kind = 'whatsapp' as const;
  constructor(
    private readonly opts: { phoneNumberId: string; accessToken: string; appSecret: string },
  ) {}
  verifySignature(_rawBody: string, _headers: Record<string, string | undefined>): boolean {
    throw new NotBuiltYet('WhatsApp signature verification', 'Milestone 6');
  }
  parseInbound(_payload: unknown): NormalisedInbound[] {
    throw new NotBuiltYet('WhatsApp inbound parsing', 'Milestone 6');
  }
  async send(_to: string, _parts: OutboundPart[]): Promise<SendResult> {
    throw new NotBuiltYet('WhatsApp sending', 'Milestone 6');
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
    return [{ channel: 'web', providerMessageId: p.id, fromPhoneE164: p.phone, text: p.text, receivedAt: new Date() }];
  }
  async send(): Promise<SendResult> {
    return { providerMessageIds: [] }; // Delivered via the SSE stream.
  }
}
