/**
 * WhatsApp formatting rules (CLAUDE.md §5): messages under 1,000 characters, numbered
 * menus that work on any phone, and the 24-hour customer-service window.
 */

export const WHATSAPP_MAX_CHARS = 1000;
export const SERVICE_WINDOW_MS = 24 * 60 * 60 * 1000;

/** Split on paragraph, then sentence, then word boundaries so no part exceeds `max`. */
export function splitForWhatsApp(text: string, max = WHATSAPP_MAX_CHARS): string[] {
  const parts: string[] = [];
  let current = '';

  const push = () => {
    if (current.trim()) parts.push(current.trim());
    current = '';
  };

  const units = text.split(/(\n\n+)/).flatMap((p) =>
    p.length <= max ? [p] : p.split(/(?<=[.!?])\s+/).flatMap((s) => (s.length <= max ? [s] : s.split(/\s+/))),
  );

  for (const unit of units) {
    const sep = current && !/^\n/.test(unit) && !current.endsWith('\n') ? ' ' : '';
    if ((current + sep + unit).length > max) {
      push();
      current = unit.length > max ? unit.slice(0, max) : unit;
    } else {
      current += sep + unit;
    }
  }
  push();
  return parts;
}

/** Numbered menu: replying "2" works even on phones without interactive buttons. */
export function formatNumberedMenu(intro: string, options: { label: string }[]): string {
  const lines = options.map((o, i) => `${i + 1}. ${o.label}`);
  return [intro, '', ...lines, '', 'Reply with a number.'].join('\n');
}

/** Map a reply like "2", " 2 ", or "2." to the chosen option. */
export function parseMenuReply<T>(reply: string, options: T[]): T | undefined {
  const m = reply.trim().match(/^(\d{1,2})\.?$/);
  if (!m) return undefined;
  return options[Number(m[1]) - 1];
}

/** Outside the window we may only send approved templates. */
export function canSendFreeform(lastInboundAt: Date | null, now = new Date()): boolean {
  return lastInboundAt !== null && now.getTime() - lastInboundAt.getTime() < SERVICE_WINDOW_MS;
}
