import type { ButtonHTMLAttributes, HTMLAttributes, ReactNode } from 'react';

export const cx = (...c: (string | false | null | undefined)[]) => c.filter(Boolean).join(' ');

export type ButtonVariant = 'primary' | 'secondary' | 'ghost' | 'success';
export type ButtonSize = 'md' | 'lg';

/** Class string for anything that should look like a button (e.g. a Next.js <Link>). */
export function buttonClass({
  variant = 'primary',
  size = 'md',
  block = false,
}: { variant?: ButtonVariant; size?: ButtonSize; block?: boolean } = {}): string {
  return cx(
    'inline-flex items-center justify-center gap-2 rounded-full font-extrabold select-none',
    'transition-[background-color,transform,box-shadow] duration-150 active:scale-[0.98]',
    'disabled:opacity-50 disabled:pointer-events-none',
    size === 'md' ? 'min-h-touch px-5 text-base' : 'min-h-touch-lg px-6 text-lg',
    block && 'w-full',
    variant === 'primary' && 'bg-primary text-on-primary shadow-card hover:bg-primary-hover',
    variant === 'success' && 'bg-success text-on-success shadow-card',
    variant === 'secondary' && 'bg-surface text-ink border-2 border-line hover:border-ink-muted',
    variant === 'ghost' && 'text-primary hover:bg-sunk',
  );
}

export function Button({
  variant,
  size,
  block,
  icon,
  className,
  children,
  ...rest
}: ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: ButtonVariant;
  size?: ButtonSize;
  block?: boolean;
  icon?: ReactNode;
}) {
  return (
    <button
      type="button"
      className={cx(buttonClass({ variant, size, block }), className)}
      {...rest}
    >
      {icon}
      <span className="inline-flex items-center gap-2">{children}</span>
    </button>
  );
}

export function Card({
  className,
  tone = 'surface',
  ...rest
}: HTMLAttributes<HTMLDivElement> & { tone?: 'surface' | 'sunk' | 'brand' }) {
  return (
    <div
      className={cx(
        'rounded-lg p-4',
        tone === 'surface' && 'bg-surface shadow-card',
        tone === 'sunk' && 'bg-sunk',
        tone === 'brand' && 'bg-brand-soft',
        className,
      )}
      {...rest}
    />
  );
}

export type ChipTone = 'neutral' | 'success' | 'accent' | 'brand';

export function Chip({
  tone = 'neutral',
  children,
  icon,
}: {
  tone?: ChipTone;
  children: ReactNode;
  icon?: ReactNode;
}) {
  return (
    <span
      className={cx(
        'inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-xs font-extrabold leading-none',
        tone === 'neutral' && 'bg-sunk text-ink-muted',
        tone === 'success' && 'bg-success-soft text-success',
        tone === 'accent' && 'bg-accent-soft text-accent',
        tone === 'brand' && 'bg-brand-soft text-brand-strong',
      )}
    >
      {icon}
      {children}
    </span>
  );
}

const AVATAR_TONES = [
  'bg-brand-soft text-brand-strong',
  'bg-success-soft text-success',
  'bg-accent-soft text-accent',
  'bg-sunk text-ink',
];

/**
 * Initial-letter avatar, or an adult's own profile photo / a centre logo when `src` is set.
 * Never photos of children (POPIA).
 */
export function Avatar({
  name,
  size = 44,
  src,
}: {
  name: string;
  size?: number;
  src?: string | null;
}) {
  const tone =
    AVATAR_TONES[[...name].reduce((a, c) => a + c.charCodeAt(0), 0) % AVATAR_TONES.length];
  if (src) {
    return (
      <img
        src={src}
        alt=""
        width={size}
        height={size}
        loading="lazy"
        decoding="async"
        className="shrink-0 rounded-full bg-sunk object-cover"
        style={{ width: size, height: size }}
      />
    );
  }
  return (
    <span
      aria-hidden="true"
      style={{ width: size, height: size }}
      className={cx(
        'inline-flex shrink-0 items-center justify-center rounded-full text-lg font-black',
        tone,
      )}
    >
      {[...name][0]?.toUpperCase()}
    </span>
  );
}

export function SectionHeading({ title, action }: { title: string; action?: ReactNode }) {
  return (
    <div className="flex items-end justify-between gap-3 px-1">
      <h2 className="text-lg font-black tracking-tight text-ink">{title}</h2>
      {action}
    </div>
  );
}
