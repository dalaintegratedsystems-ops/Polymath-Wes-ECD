/**
 * One interface for every channel. The agent and API never know which provider sent a
 * message — WhatsApp (Meta Cloud API or any BSP), SMS, or the PWA all look the same.
 */
export type ChannelKind = 'whatsapp' | 'sms' | 'web';

export interface NormalisedInbound {
  channel: ChannelKind;
  providerMessageId: string;
  fromPhoneE164: string;
  text: string;
  /** Set when the user tapped a numbered menu option or quick reply. */
  menuChoice?: string;
  receivedAt: Date;
}

export type OutboundPart =
  | { kind: 'text'; text: string }
  | { kind: 'menu'; text: string; options: { id: string; label: string }[] }
  | { kind: 'document'; url: string; filename: string; caption?: string }
  | { kind: 'template'; name: string; language: string; variables: string[] };

export interface SendResult {
  providerMessageIds: string[];
}

export interface ChannelAdapter {
  readonly kind: ChannelKind;
  /** Verify the provider's webhook signature. Reject anything that fails. */
  verifySignature(rawBody: string, headers: Record<string, string | undefined>): boolean;
  parseInbound(payload: unknown): NormalisedInbound[];
  send(toPhoneE164: string, parts: OutboundPart[]): Promise<SendResult>;
}
