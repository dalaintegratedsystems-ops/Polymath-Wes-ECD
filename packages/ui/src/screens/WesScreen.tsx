'use client';

import { useEffect, useRef, useState, type FormEvent } from 'react';
import {
  BookIcon,
  PhoneIcon,
  SendIcon,
  ShieldIcon,
  SparkleIcon,
  SpeakerIcon,
  ThumbDownIcon,
  ThumbUpIcon,
} from '../icons';
import { defaultRenderLink, type RenderLink } from '../nav';
import { cx } from '../primitives';
import { AppShell } from '../shell';

export interface ChatCitation {
  n: number;
  title: string;
  anchor: string;
}

export interface ChatMessage {
  id: string;
  role: 'user' | 'wes';
  text: string;
  citations?: ChatCitation[];
  /** The fixed child-protection response. */
  safety?: boolean;
  /** Still streaming. */
  pending?: boolean;
  feedback?: 'up' | 'down';
  error?: boolean;
}

export type FeedbackReason =
  'wrong' | 'not_helpful' | 'not_relevant_locally' | 'too_long' | 'unsafe' | 'other';

const REASONS: { value: FeedbackReason; label: string }[] = [
  { value: 'wrong', label: 'It’s wrong' },
  { value: 'not_helpful', label: 'Not helpful' },
  { value: 'not_relevant_locally', label: 'Doesn’t fit my area' },
  { value: 'too_long', label: 'Too long' },
  { value: 'unsafe', label: 'Unsafe' },
  { value: 'other', label: 'Other' },
];

/** Read aloud with the phone's own speech engine: nothing leaves the device. */
function useReadAloud() {
  const [speakingId, setSpeakingId] = useState<string | null>(null);
  const supported = typeof window !== 'undefined' && 'speechSynthesis' in window;
  const toggle = (id: string, text: string) => {
    if (!supported) return;
    window.speechSynthesis.cancel();
    if (speakingId === id) {
      setSpeakingId(null);
      return;
    }
    const u = new SpeechSynthesisUtterance(text.replace(/\[\d+\]/g, ''));
    u.lang = 'en-ZA';
    u.rate = 0.95;
    u.onend = () => setSpeakingId(null);
    window.speechSynthesis.speak(u);
    setSpeakingId(id);
  };
  useEffect(() => () => window.speechSynthesis?.cancel(), []);
  return { supported, speakingId, toggle };
}

function SafetyCard({ text }: { text: string }) {
  return (
    <div className="max-w-[92%] rounded-lg border-2 border-accent bg-surface p-4 shadow-card">
      <p className="flex items-center gap-2 font-black text-accent">
        <ShieldIcon size={20} />
        Keeping a child safe
      </p>
      <p className="mt-2 whitespace-pre-line text-ink">{text}</p>
      <div className="mt-4 grid grid-cols-2 gap-2">
        <a
          href="tel:116"
          className="inline-flex min-h-touch items-center justify-center gap-2 rounded-full bg-accent font-extrabold text-on-accent"
        >
          <PhoneIcon size={18} /> Childline 116
        </a>
        <a
          href="tel:10111"
          className="inline-flex min-h-touch items-center justify-center gap-2 rounded-full border-2 border-line font-extrabold text-ink"
        >
          <PhoneIcon size={18} /> Police 10111
        </a>
      </div>
    </div>
  );
}

/**
 * Ask Wes: streamed answers, sources as chips, a distinct safety card, read-aloud and feedback.
 * The parent component owns the conversation (and the network); this renders it.
 */
export function WesScreen({
  messages,
  suggestions,
  onSend,
  onFeedback,
  busy = false,
  initialDraft = '',
  offlineMode = false,
  renderLink = defaultRenderLink,
}: {
  messages: ChatMessage[];
  suggestions: string[];
  onSend: (text: string) => void;
  onFeedback?: (messageId: string, rating: 'up' | 'down', reason?: FeedbackReason) => void;
  busy?: boolean;
  initialDraft?: string;
  offlineMode?: boolean;
  renderLink?: RenderLink;
}) {
  const [draft, setDraft] = useState(initialDraft);
  const [askingWhy, setAskingWhy] = useState<string | null>(null);
  const endRef = useRef<HTMLDivElement>(null);
  const speech = useReadAloud();

  useEffect(() => {
    endRef.current?.scrollIntoView({ block: 'end' });
  }, [messages]);

  const send = (text: string) => {
    const t = text.trim();
    if (!t || busy) return;
    onSend(t);
    setDraft('');
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
          <p className="text-xs font-bold text-ink-muted">
            {offlineMode ? 'Offline mode · answers from documents only' : 'Your ECD centre helper'}
          </p>
        </div>
      </header>

      <main className="space-y-3 px-4 pt-4 pb-28">
        <p className="rounded-md bg-sunk px-3 py-2 text-center text-xs text-ink-muted">
          Wes can make mistakes — check important answers. Wes never diagnoses children.
        </p>

        {messages.length === 0 && (
          <div className="py-6 text-center">
            <p className="text-xl font-black text-ink">How can I help today?</p>
            <p className="mt-1 text-sm text-ink-muted">
              Ask about registration, planning, printables or your children.
            </p>
          </div>
        )}

        <div aria-live="polite" className="space-y-3">
          {messages.map((m) => (
            <div
              key={m.id}
              className={cx('flex flex-col', m.role === 'user' ? 'items-end' : 'items-start')}
            >
              {m.safety ? (
                <SafetyCard text={m.text} />
              ) : (
                <div
                  className={cx(
                    'max-w-[85%] rounded-lg px-4 py-3',
                    m.role === 'user'
                      ? 'rounded-br-sm bg-primary text-on-primary'
                      : 'rounded-bl-sm bg-surface text-ink shadow-card',
                    m.error && 'border-2 border-danger/40',
                  )}
                >
                  {m.pending && !m.text ? (
                    <span className="flex gap-1 py-1.5" aria-label="Wes is writing">
                      {[0, 1, 2].map((i) => (
                        <span
                          key={i}
                          className="size-2 animate-bounce rounded-full bg-ink-muted"
                          style={{ animationDelay: `${i * 150}ms` }}
                        />
                      ))}
                    </span>
                  ) : (
                    <p className="whitespace-pre-line">{m.text}</p>
                  )}
                  {m.citations && m.citations.length > 0 && (
                    <ul className="mt-2 flex flex-wrap gap-1.5" aria-label="Sources">
                      {m.citations.map((c) => (
                        <li
                          key={c.n}
                          className="inline-flex items-center gap-1 rounded-full bg-brand-soft px-2.5 py-1 text-xs font-extrabold text-brand-strong"
                        >
                          <BookIcon size={13} />[{c.n}] {c.title} · {c.anchor}
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              )}

              {m.role === 'wes' && !m.pending && !m.error && (
                <div className="mt-1 flex items-center gap-1 text-ink-muted">
                  {speech.supported && (
                    <button
                      type="button"
                      onClick={() => speech.toggle(m.id, m.text)}
                      aria-label={speech.speakingId === m.id ? 'Stop reading' : 'Read aloud'}
                      aria-pressed={speech.speakingId === m.id}
                      className={cx(
                        'grid size-10 place-items-center rounded-full',
                        speech.speakingId === m.id && 'bg-brand-soft text-brand-strong',
                      )}
                    >
                      <SpeakerIcon size={18} />
                    </button>
                  )}
                  {onFeedback && !m.safety && (
                    <>
                      <button
                        type="button"
                        aria-label="Helpful"
                        aria-pressed={m.feedback === 'up'}
                        onClick={() => onFeedback(m.id, 'up')}
                        className={cx(
                          'grid size-10 place-items-center rounded-full',
                          m.feedback === 'up' && 'bg-success-soft text-success',
                        )}
                      >
                        <ThumbUpIcon size={18} />
                      </button>
                      <button
                        type="button"
                        aria-label="Not helpful"
                        aria-pressed={m.feedback === 'down'}
                        onClick={() => setAskingWhy(askingWhy === m.id ? null : m.id)}
                        className={cx(
                          'grid size-10 place-items-center rounded-full',
                          m.feedback === 'down' && 'bg-accent-soft text-accent',
                        )}
                      >
                        <ThumbDownIcon size={18} />
                      </button>
                    </>
                  )}
                </div>
              )}

              {askingWhy === m.id && (
                <div
                  className="mt-1 max-w-[92%] rounded-md bg-sunk p-3"
                  role="group"
                  aria-label="What was wrong?"
                >
                  <p className="text-sm font-extrabold text-ink">What was wrong?</p>
                  <div className="mt-2 flex flex-wrap gap-1.5">
                    {REASONS.map((r) => (
                      <button
                        key={r.value}
                        type="button"
                        onClick={() => {
                          onFeedback?.(m.id, 'down', r.value);
                          setAskingWhy(null);
                        }}
                        className="min-h-10 rounded-full border-2 border-line bg-surface px-3 text-sm font-extrabold text-ink"
                      >
                        {r.label}
                      </button>
                    ))}
                  </div>
                </div>
              )}
            </div>
          ))}
        </div>

        {messages.length <= 2 && !busy && (
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
        <div ref={endRef} />
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
            enterKeyHint="send"
            maxLength={2000}
            className="min-h-touch flex-1 rounded-full border-2 border-line bg-surface px-4 text-base text-ink placeholder:text-ink-muted focus:border-primary focus:outline-none"
          />
          <button
            type="submit"
            aria-label="Send"
            disabled={!draft.trim() || busy}
            className="grid size-12 shrink-0 place-items-center rounded-full bg-primary text-on-primary shadow-card disabled:opacity-40"
          >
            <SendIcon size={20} />
          </button>
        </div>
      </form>
    </AppShell>
  );
}
