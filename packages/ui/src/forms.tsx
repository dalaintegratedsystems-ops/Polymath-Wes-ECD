'use client';

import {
  useId,
  useRef,
  useState,
  type InputHTMLAttributes,
  type ReactNode,
  type SelectHTMLAttributes,
} from 'react';
import { CheckIcon } from './icons';
import { cx } from './primitives';

/**
 * Form controls tuned for mid-range Android: native inputs (fast, accessible, correct
 * keyboards), 48–56px targets, 16px+ text so the browser never zooms, errors in words.
 */

export function Field({
  label,
  hint,
  error,
  children,
  htmlFor,
}: {
  label: string;
  hint?: string;
  error?: string | null;
  children: ReactNode;
  htmlFor: string;
}) {
  return (
    <div className="space-y-1.5">
      <label htmlFor={htmlFor} className="block font-extrabold text-ink">
        {label}
      </label>
      {hint && (
        <p id={`${htmlFor}-hint`} className="text-sm text-ink-muted">
          {hint}
        </p>
      )}
      {children}
      {error && (
        <p id={`${htmlFor}-error`} role="alert" className="text-sm font-bold text-danger">
          {error}
        </p>
      )}
    </div>
  );
}

const inputBase =
  'block w-full min-h-touch-lg rounded-md border-2 bg-surface px-4 text-lg text-ink placeholder:text-ink-muted transition-colors focus:border-primary focus:outline-none';

export function TextInput({
  invalid,
  className,
  ...rest
}: InputHTMLAttributes<HTMLInputElement> & { invalid?: boolean }) {
  return (
    <input
      aria-invalid={invalid || undefined}
      className={cx(inputBase, invalid ? 'border-danger' : 'border-line', className)}
      {...rest}
    />
  );
}

export function Select({
  invalid,
  className,
  children,
  ...rest
}: SelectHTMLAttributes<HTMLSelectElement> & { invalid?: boolean }) {
  return (
    <select
      aria-invalid={invalid || undefined}
      className={cx(
        inputBase,
        'appearance-none pr-10',
        invalid ? 'border-danger' : 'border-line',
        className,
      )}
      style={{
        backgroundImage:
          "url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='20' height='20' viewBox='0 0 24 24' fill='none' stroke='%237D6A58' stroke-width='2.5' stroke-linecap='round'%3E%3Cpath d='m6 9 6 6 6-6'/%3E%3C/svg%3E\")",
        backgroundRepeat: 'no-repeat',
        backgroundPosition: 'right 0.9rem center',
      }}
      {...rest}
    >
      {children}
    </select>
  );
}

/**
 * Six big boxes for a one-time PIN. One real input underneath keeps paste, SMS autofill
 * (`autocomplete="one-time-code"`) and screen readers working.
 */
export function PinInput({
  value,
  onChange,
  onComplete,
  label,
  invalid,
  disabled,
  autoFocus,
}: {
  value: string;
  onChange: (v: string) => void;
  onComplete?: (v: string) => void;
  label: string;
  invalid?: boolean;
  disabled?: boolean;
  autoFocus?: boolean;
}) {
  const id = useId();
  const ref = useRef<HTMLInputElement>(null);
  const [focused, setFocused] = useState(false);
  return (
    <div className="relative" onClick={() => ref.current?.focus()}>
      <label htmlFor={id} className="sr-only">
        {label}
      </label>
      <input
        ref={ref}
        id={id}
        value={value}
        disabled={disabled}
        autoFocus={autoFocus}
        inputMode="numeric"
        autoComplete="one-time-code"
        pattern="\d{6}"
        maxLength={6}
        aria-invalid={invalid || undefined}
        onFocus={() => setFocused(true)}
        onBlur={() => setFocused(false)}
        onChange={(e) => {
          const v = e.target.value.replace(/\D/g, '').slice(0, 6);
          onChange(v);
          if (v.length === 6) onComplete?.(v);
        }}
        className="absolute inset-0 h-full w-full cursor-pointer opacity-0"
      />
      <div aria-hidden="true" className="grid grid-cols-6 gap-2">
        {Array.from({ length: 6 }, (_, i) => {
          const active = focused && i === Math.min(value.length, 5);
          return (
            <div
              key={i}
              className={cx(
                'grid aspect-[4/5] place-items-center rounded-md border-2 bg-surface text-[1.75rem] font-black tabular-nums text-ink transition-colors',
                invalid
                  ? 'border-danger'
                  : active
                    ? 'border-primary ring-4 ring-brand-soft'
                    : 'border-line',
              )}
            >
              {value[i] ?? ''}
            </div>
          );
        })}
      </div>
    </div>
  );
}

/** Big tappable chips for a short list of choices (single or multiple). */
export function ChoiceChips<T extends string>({
  label,
  options,
  value,
  onChange,
  multiple = false,
}: {
  label: string;
  options: { value: T; label: string }[];
  value: T[];
  onChange: (v: T[]) => void;
  multiple?: boolean;
}) {
  return (
    <fieldset>
      <legend className="mb-1.5 font-extrabold text-ink">{label}</legend>
      <div role={multiple ? 'group' : 'radiogroup'} className="flex flex-wrap gap-2">
        {options.map((o) => {
          const on = value.includes(o.value);
          return (
            <button
              key={o.value}
              type="button"
              role={multiple ? 'checkbox' : 'radio'}
              aria-checked={on}
              onClick={() =>
                onChange(
                  multiple
                    ? on
                      ? value.filter((v) => v !== o.value)
                      : [...value, o.value]
                    : [o.value],
                )
              }
              className={cx(
                'inline-flex min-h-touch items-center gap-1.5 rounded-full border-2 px-4 font-extrabold transition-colors',
                on
                  ? 'border-primary bg-primary text-on-primary'
                  : 'border-line bg-surface text-ink',
              )}
            >
              {on && <CheckIcon size={18} />}
              {o.label}
            </button>
          );
        })}
      </div>
    </fieldset>
  );
}

export function NumberStepper({
  label,
  value,
  onChange,
  min = 0,
  max = 500,
}: {
  label: string;
  value: number;
  onChange: (v: number) => void;
  min?: number;
  max?: number;
}) {
  const id = useId();
  const btn =
    'grid size-14 shrink-0 place-items-center rounded-full border-2 border-line bg-surface text-2xl font-black text-ink active:scale-95 disabled:opacity-40';
  return (
    <div className="space-y-1.5">
      <label htmlFor={id} className="block font-extrabold text-ink">
        {label}
      </label>
      <div className="flex items-center gap-3">
        <button
          type="button"
          aria-label="Fewer"
          className={btn}
          disabled={value <= min}
          onClick={() => onChange(Math.max(min, value - 1))}
        >
          −
        </button>
        <input
          id={id}
          inputMode="numeric"
          value={value}
          onChange={(e) => {
            const n = Number(e.target.value.replace(/\D/g, '') || 0);
            onChange(Math.min(max, Math.max(min, n)));
          }}
          className={cx(inputBase, 'border-line text-center text-2xl font-black tabular-nums')}
        />
        <button
          type="button"
          aria-label="More"
          className={btn}
          disabled={value >= max}
          onClick={() => onChange(Math.min(max, value + 1))}
        >
          +
        </button>
      </div>
    </div>
  );
}

/** A checkbox row with a title and a plain-language explanation. */
export function CheckRow({
  checked,
  onChange,
  title,
  description,
  disabled,
}: {
  checked: boolean;
  onChange: (v: boolean) => void;
  title: string;
  description: string;
  disabled?: boolean;
}) {
  const id = useId();
  return (
    <label
      htmlFor={id}
      className={cx(
        'flex cursor-pointer items-start gap-3 rounded-md border-2 p-3 transition-colors',
        checked ? 'border-success bg-success-soft' : 'border-line bg-surface',
        disabled && 'cursor-default',
      )}
    >
      <input
        id={id}
        type="checkbox"
        className="peer sr-only"
        checked={checked}
        disabled={disabled}
        onChange={(e) => onChange(e.target.checked)}
      />
      <span
        aria-hidden="true"
        className={cx(
          'mt-0.5 grid size-7 shrink-0 place-items-center rounded-md border-2 peer-focus-visible:ring-4 peer-focus-visible:ring-focus',
          checked ? 'border-success bg-success text-on-success' : 'border-line bg-surface',
        )}
      >
        {checked && <CheckIcon size={18} strokeWidth={3} />}
      </span>
      <span>
        <span className="block font-extrabold text-ink">
          {title}
          {disabled && <span className="ml-1.5 text-sm font-bold text-ink-muted">(needed)</span>}
        </span>
        <span className="block text-sm text-ink-muted">{description}</span>
      </span>
    </label>
  );
}

/** "Step 2 of 3" with a segmented bar. */
export function StepProgress({
  step,
  total,
  label,
}: {
  step: number;
  total: number;
  label?: string;
}) {
  return (
    <div>
      <p className="text-sm font-extrabold text-ink-muted">
        Step {step} of {total}
        {label ? ` · ${label}` : ''}
      </p>
      <div
        className="mt-2 grid gap-1.5"
        style={{ gridTemplateColumns: `repeat(${total}, 1fr)` }}
        aria-hidden="true"
      >
        {Array.from({ length: total }, (_, i) => (
          <span key={i} className={cx('h-2 rounded-full', i < step ? 'bg-primary' : 'bg-line')} />
        ))}
      </div>
    </div>
  );
}

/** Inline error banner for whole-form failures. */
export function FormError({ message }: { message: string | null }) {
  if (!message) return null;
  return (
    <p
      role="alert"
      className="rounded-md border-2 border-danger/40 bg-surface px-4 py-3 font-bold text-danger"
    >
      {message}
    </p>
  );
}
