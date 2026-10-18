'use client';

import { useState } from 'react';
import { WesScreen, type ChatMessage, type FeedbackReason } from '@wes/ui';
import { sendFeedback } from '@/app/actions';
import { readEvents } from '@/lib/assistant-stream';
import { nextRenderLink } from '@/lib/render-link';

/** Owns the conversation: sends messages, streams Wes's answer in, and records feedback. */
export function WesChat({
  initialMessages,
  initialConversationId,
  suggestions,
  initialDraft,
  offlineMode,
}: {
  initialMessages: ChatMessage[];
  initialConversationId: string | null;
  suggestions: string[];
  initialDraft?: string;
  offlineMode: boolean;
}) {
  const [messages, setMessages] = useState(initialMessages);
  const [conversationId, setConversationId] = useState(initialConversationId);
  const [busy, setBusy] = useState(false);

  const update = (
    id: string,
    patch: Partial<ChatMessage> | ((m: ChatMessage) => Partial<ChatMessage>),
  ) =>
    setMessages((all) =>
      all.map((m) =>
        m.id === id ? { ...m, ...(typeof patch === 'function' ? patch(m) : patch) } : m,
      ),
    );

  const onSend = async (text: string) => {
    const tempId = `pending-${Date.now()}`;
    setMessages((all) => [
      ...all,
      { id: `user-${Date.now()}`, role: 'user', text },
      { id: tempId, role: 'wes', text: '', pending: true },
    ]);
    setBusy(true);
    try {
      const res = await fetch('/api/assistant', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ text, ...(conversationId ? { conversationId } : {}) }),
      });
      if (!res.ok || !res.body) {
        const msg =
          res.status === 401
            ? 'Please sign in again.'
            : res.status === 429
              ? 'Slow down a little and try again in a minute.'
              : 'Wes can’t answer right now. Please try again.';
        update(tempId, { text: msg, pending: false, error: true });
        return;
      }
      let finalId = tempId;
      for await (const e of readEvents(res.body)) {
        if (e.event === 'start') setConversationId(e.data.conversationId);
        else if (e.event === 'delta') update(finalId, (m) => ({ text: m.text + e.data.text }));
        else if (e.event === 'replace') update(finalId, { text: e.data.text });
        else if (e.event === 'done') {
          update(finalId, {
            id: e.data.messageId,
            pending: false,
            safety: e.data.safety,
            citations: e.data.citations,
          });
          finalId = e.data.messageId;
        } else if (e.event === 'error')
          update(finalId, { text: e.data.message, pending: false, error: true });
      }
      update(finalId, { pending: false });
    } catch {
      update(tempId, {
        text: 'You seem to be offline. Your question wasn’t sent. Try again when you have signal.',
        pending: false,
        error: true,
      });
    } finally {
      setBusy(false);
    }
  };

  const onFeedback = async (messageId: string, rating: 'up' | 'down', reason?: FeedbackReason) => {
    update(messageId, { feedback: rating });
    await sendFeedback({ messageId, rating, ...(reason ? { reason } : {}) });
  };

  return (
    <WesScreen
      messages={messages}
      suggestions={suggestions}
      busy={busy}
      onSend={(t) => void onSend(t)}
      onFeedback={(id, r, why) => void onFeedback(id, r, why)}
      initialDraft={initialDraft}
      offlineMode={offlineMode}
      renderLink={nextRenderLink}
    />
  );
}
