import { useState } from 'react';
import { escalationDemo } from '../demo';
import { WesScreen, type ChatMessage } from '../screens/WesScreen';

/** Storybook-only harness: a fake streaming Wes so the chat can be tried without a server. */
export function WesChatDemo({
  initial,
  suggestions,
}: {
  initial: ChatMessage[];
  suggestions: string[];
}) {
  const [messages, setMessages] = useState(initial);
  const [busy, setBusy] = useState(false);

  const onSend = (text: string) => {
    const id = `w${Date.now()}`;
    const reply = /hurt|touch|abuse/i.test(text)
      ? { text: escalationDemo, safety: true }
      : {
          text: 'Here’s an idea: set up a calm corner with cushions and a few books [1]. Show children how to use it when they feel big feelings.',
          citations: [{ n: 1, title: 'Example guide', anchor: 'Calm spaces' }],
        };
    setMessages((m) => [
      ...m,
      { id: `u${Date.now()}`, role: 'user', text },
      { id, role: 'wes', text: '', pending: true },
    ]);
    setBusy(true);
    const words = reply.text.split(/(?<=\s)/);
    let i = 0;
    const tick = setInterval(() => {
      i += 3;
      setMessages((m) =>
        m.map((msg) =>
          msg.id === id
            ? i >= words.length
              ? { ...msg, ...reply, pending: false }
              : { ...msg, text: words.slice(0, i).join('') }
            : msg,
        ),
      );
      if (i >= words.length) {
        clearInterval(tick);
        setBusy(false);
      }
    }, 80);
  };

  return (
    <WesScreen
      messages={messages}
      suggestions={suggestions}
      busy={busy}
      onSend={onSend}
      onFeedback={(mid, rating) =>
        setMessages((m) => m.map((x) => (x.id === mid ? { ...x, feedback: rating } : x)))
      }
    />
  );
}
