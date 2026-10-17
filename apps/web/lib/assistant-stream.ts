import type { AssistantEvent } from '@wes/shared';

/** Parse a server-sent event stream into typed events (browser and Node both have streams). */
export async function* readEvents(
  body: ReadableStream<Uint8Array>,
): AsyncGenerator<AssistantEvent> {
  const reader = body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';
  for (;;) {
    const { value, done } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    let idx: number;
    while ((idx = buffer.indexOf('\n\n')) >= 0) {
      const block = buffer.slice(0, idx);
      buffer = buffer.slice(idx + 2);
      const event = /^event: (.*)$/m.exec(block)?.[1];
      const data = /^data: (.*)$/m.exec(block)?.[1];
      if (!event || !data) continue;
      try {
        yield { event, data: JSON.parse(data) } as AssistantEvent;
      } catch {
        // Ignore a malformed block rather than breaking the conversation.
      }
    }
  }
}
