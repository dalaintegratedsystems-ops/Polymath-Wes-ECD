'use client';

import { useEffect, useState, type FormEvent } from 'react';
import { Field, FormError, PinInput, TextInput } from '../../forms';
import { ArrowRightIcon, ShieldIcon, SparkleIcon, WesIcon } from '../../icons';
import { SunriseScene } from '../../illustrations';
import { Button } from '../../primitives';

/** Returns an error message to show, or null on success. */
export type Submit<T> = (value: T) => Promise<string | null>;

const HELLOS = ['Molo', 'Sawubona', 'Hallo', 'Dumela', 'Hello'];

function useSubmitting() {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const run = async (fn: () => Promise<string | null>) => {
    setBusy(true);
    setError(null);
    try {
      setError(await fn());
    } catch {
      setError('Something went wrong. Check your signal and try again.');
    } finally {
      setBusy(false);
    }
  };
  return { busy, error, setError, run };
}

/** First screen: a warm welcome and one question — your cellphone number. */
export function WelcomeScreen({
  onSubmit,
  initialPhone = '',
}: {
  onSubmit: Submit<string>;
  initialPhone?: string;
}) {
  const [phone, setPhone] = useState(initialPhone);
  const { busy, error, run } = useSubmitting();

  const submit = (e: FormEvent) => {
    e.preventDefault();
    void run(() => onSubmit(phone));
  };

  return (
    <div className="min-h-dvh bg-canvas">
      <header className="relative overflow-hidden rounded-b-xl bg-brand-soft px-4 pt-[calc(env(safe-area-inset-top)+1.5rem)]">
        <div className="mx-auto max-w-md">
          <span className="inline-flex items-center gap-2 rounded-full bg-surface/70 py-1 pr-3 pl-1 text-sm font-extrabold text-brand-strong">
            <span className="grid size-7 place-items-center rounded-full bg-primary text-on-primary">
              <SparkleIcon size={16} />
            </span>
            Wes
          </span>
          <ul
            className="mt-5 flex flex-wrap gap-x-3 gap-y-1 text-sm font-extrabold text-brand-strong"
            aria-label="Greetings"
          >
            {HELLOS.map((h) => (
              <li key={h}>{h}</li>
            ))}
          </ul>
          <h1 className="mt-1 text-[2rem] leading-[1.1] font-black tracking-tight text-ink">
            Your helper for running a great ECD centre
          </h1>
          <p className="mt-2 text-ink-muted">
            Registration, plans, printables and your child register — on your phone.
          </p>
        </div>
        <SunriseScene className="pointer-events-none mx-auto -mb-1 block w-full max-w-md" />
      </header>

      <main className="mx-auto max-w-md px-4 pt-6 pb-10">
        <form onSubmit={submit} noValidate className="space-y-4">
          <Field
            label="Your cellphone number"
            hint="We’ll send you a PIN on WhatsApp. No password to remember."
            error={error}
            htmlFor="phone"
          >
            <TextInput
              id="phone"
              type="tel"
              inputMode="tel"
              autoComplete="tel"
              placeholder="082 123 4567"
              value={phone}
              invalid={Boolean(error)}
              aria-describedby="phone-hint"
              onChange={(e) => setPhone(e.target.value)}
            />
          </Field>
          <Button
            type="submit"
            size="lg"
            block
            disabled={busy || phone.replace(/\D/g, '').length < 9}
          >
            {busy ? 'Sending…' : 'Send me a PIN'}
            {!busy && <ArrowRightIcon size={20} />}
          </Button>
        </form>
        <p className="mt-6 flex items-start gap-2 text-sm text-ink-muted">
          <ShieldIcon size={18} className="mt-0.5 shrink-0 text-success" />
          <span>
            Your details stay private. We only use your number to sign you in and send you messages
            you ask for.
          </span>
        </p>
      </main>
    </div>
  );
}

/** Second screen: the 6-digit PIN. Submits by itself when the sixth digit is typed. */
export function VerifyScreen({
  maskedPhone,
  onSubmit,
  onResend,
  changeNumberHref = '/welcome',
}: {
  maskedPhone: string;
  onSubmit: Submit<string>;
  onResend: () => Promise<string | null>;
  changeNumberHref?: string;
}) {
  const [code, setCode] = useState('');
  const [wait, setWait] = useState(30);
  const [notice, setNotice] = useState<string | null>(null);
  const { busy, error, run } = useSubmitting();

  useEffect(() => {
    if (wait <= 0) return;
    const t = setTimeout(() => setWait((w) => w - 1), 1000);
    return () => clearTimeout(t);
  }, [wait]);

  const verify = (value: string) => void run(() => onSubmit(value));

  return (
    <main className="mx-auto flex min-h-dvh max-w-md flex-col px-4 pt-[calc(env(safe-area-inset-top)+2rem)] pb-10">
      <span className="grid size-14 place-items-center rounded-full bg-brand-soft text-primary">
        <WesIcon size={28} />
      </span>
      <h1 className="mt-5 text-[1.75rem] leading-tight font-black tracking-tight text-ink">
        Enter your PIN
      </h1>
      <p className="mt-2 text-ink-muted">
        We sent a 6-digit PIN to <span className="font-extrabold text-ink">{maskedPhone}</span>.
      </p>

      <form
        className="mt-6 space-y-4"
        onSubmit={(e) => {
          e.preventDefault();
          verify(code);
        }}
      >
        <PinInput
          label="6-digit PIN"
          value={code}
          onChange={setCode}
          onComplete={verify}
          invalid={Boolean(error)}
          disabled={busy}
          autoFocus
        />
        <FormError message={error} />
        <Button type="submit" size="lg" block disabled={busy || code.length !== 6}>
          {busy ? 'Checking…' : 'Sign in'}
        </Button>
      </form>

      <div className="mt-6 flex flex-col items-center gap-2 text-center">
        {notice && (
          <p role="status" className="text-sm font-bold text-success">
            {notice}
          </p>
        )}
        <Button
          variant="ghost"
          disabled={wait > 0 || busy}
          onClick={async () => {
            setNotice(null);
            const err = await onResend();
            if (err) setNotice(err);
            else {
              setNotice('We sent you a new PIN.');
              setWait(30);
              setCode('');
            }
          }}
        >
          {wait > 0 ? `Send a new PIN in ${wait}s` : 'Send a new PIN'}
        </Button>
        <a
          href={changeNumberHref}
          className="min-h-touch px-4 py-3 text-sm font-extrabold text-ink-muted underline"
        >
          Use a different number
        </a>
      </div>
    </main>
  );
}
