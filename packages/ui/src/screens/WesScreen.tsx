'use client';

import { useState, type FormEvent } from 'react';
import { BookIcon, SendIcon, SparkleIcon } from '../icons';
import { defaultRenderLink, type RenderLink } from '../nav';
import { cx } from '../primitives';
import { AppShell } from '../shell';

export interface ChatMessage {
  id: string;
  role: 'user' | 'wes';
  text: string;
  citations?: string[];
}

/**
 * Ask Wes. The composer sits above the bottom nav; replies show their sources as chips.
 * Milestone 0 renders the conversation UI; the streaming agent arrives in Milestone 2.
 */
export function WesScreen({
  messages: initial,
  suggestions,
  onSend,
  initialDraft = '',
  renderLink = defaultRenderLink,
}: {
  messages: ChatMessage[];
  suggestions: string[];
  onSend?: (text: string) => void;
  initialDraft?: string;
  renderLink?: RenderLink;
}) {
  const [messages, setMessages] = useState(initial);
  const [draft, setDraft] = useState(initialDraft);

  const send = (text: string) => {
    const t = text.trim();
    if (!t) return;
    setMessages((m) => [
      ...m,
      { id: `u${m.length}`, role: 'user', text: t },
      {
        id: `w${m.length}`,
        role: 'wes',
        text: 'Thanks! I’m still being built. Soon I’ll answer with sources you can check.',
      },
    ]);
    setDraft('');
    onSend?.(t);
  };

  const submit = (e: FormEvent) => {
    e.preventDefault();
    send(draft);
  };

  return (
    <AppShell active="wes" renderLink={renderLink}>
      <header className="sticky top-0 z-20 flex items-center gap-3 border-b border-line bg-canvas/95 px-4 pt-[calc(env(safe-area-inset-top)+0.75rem)] pb-3 backdrop-blur">
        <span className="grid size-10 place-items-center rounded-full bg-primary text-on-primary">
          <SparkleIcon size={20} />
        </span>
        <div>
          <h1 className="text-lg leading-tight font-black text-ink">Ask Wes</h1>
          <p className="text-xs font-bold text-ink-muted">Your ECD centre helper</p>
        </div>
      </header>

      <main className="space-y-3 px-4 pt-4 pb-28" aria-live="polite">
        <p className="rounded-md bg-sunk px-3 py-2 text-center text-xs text-ink-muted">
          Wes can make mistakes — check important answers. Wes never diagnoses children.
        </p>
        {messages.map((m) => (
          <div key={m.id} className={cx('flex', m.role === 'user' ? 'justify-end' : 'justify-start')}>
            <div
              className={cx(
                'max-w-[85%] rounded-lg px-4 py-3',
                m.role === 'user'
                  ? 'rounded-br-sm bg-primary text-on-primary'
                  : 'rounded-bl-sm bg-surface text-ink shadow-card',
              )}
            >
              <p className="whitespace-pre-line">{m.text}</p>
              {m.citations && m.citations.length > 0 && (
                <ul className="mt-2 flex flex-wrap gap-1.5" aria-label="Sources">
                  {m.citations.map((c) => (
                    <li
                      key={c}
                      className="inline-flex items-center gap-1 rounded-full bg-brand-soft px-2.5 py-1 text-xs font-extrabold text-brand-strong"
                    >
                      <BookIcon size={13} />
                      {c}
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </div>
        ))}
        {messages.length <= 2 && (
          <ul className="flex flex-wrap gap-2 pt-2">
            {suggestions.map((s) => (
              <li key={s}>
                <button
                  type="button"
                  onClick={() => send(s)}
                  className="min-h-10 rounded-full border-2 border-line bg-surface px-3.5 text-sm font-extrabold text-ink"
                >
                  {s}
                </button>
              </li>
            ))}
          </ul>
        )}
      </main>

      <form
        onSubmit={submit}
        className="fixed inset-x-0 bottom-[calc(3.5rem+env(safe-area-inset-bottom))] z-30 border-t border-line bg-canvas/95 backdrop-blur"
      >
        <div className="mx-auto flex max-w-md items-center gap-2 px-4 py-2.5">
          <label htmlFor="wes-input" className="sr-only">
            Your question
          </label>
          <input
            id="wes-input"
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            placeholder="Type your question…"
            autoComplete="off"
            className="min-h-touch flex-1 rounded-full border-2 border-line bg-surface px-4 text-base text-ink placeholder:text-ink-muted focus:border-primary focus:outline-none"
          />
          <button
            type="submit"
            aria-label="Send"
            disabled={!draft.trim()}
            className="grid size-12 shrink-0 place-items-center rounded-full bg-primary text-on-primary shadow-card disabled:opacity-40"
          >
            <SendIcon size={20} />
          </button>
        </div>
      </form>
    </AppShell>
  );
}
