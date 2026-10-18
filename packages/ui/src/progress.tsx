import type { ReactNode } from 'react';
import { CheckIcon } from './icons';
import { cx } from './primitives';

/** Circular progress, readable at a glance by low-literacy users: big number, big ring. */
export function ProgressRing({
  percent,
  size = 96,
  stroke = 10,
  label,
  tone = 'primary',
}: {
  percent: number;
  size?: number;
  stroke?: number;
  label: string;
  tone?: 'primary' | 'success';
}) {
  const p = Math.max(0, Math.min(100, Math.round(percent)));
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  return (
    <div
      role="progressbar"
      aria-valuenow={p}
      aria-valuemin={0}
      aria-valuemax={100}
      aria-label={label}
      className="relative inline-grid shrink-0 place-items-center"
      style={{ width: size, height: size }}
    >
      <svg
        width={size}
        height={size}
        viewBox={`0 0 ${size} ${size}`}
        className="-rotate-90"
        aria-hidden="true"
      >
        <circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          fill="none"
          strokeWidth={stroke}
          className="stroke-line"
        />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          fill="none"
          strokeWidth={stroke}
          strokeLinecap="round"
          strokeDasharray={c}
          strokeDashoffset={c * (1 - p / 100)}
          className={cx(
            'transition-[stroke-dashoffset] duration-700 ease-out',
            tone === 'primary' ? 'stroke-primary' : 'stroke-success',
          )}
        />
      </svg>
      <span className="absolute text-2xl font-black tabular-nums text-ink">
        {p}
        <span className="text-sm">%</span>
      </span>
    </div>
  );
}

/** Slim bar for inline progress (e.g. attendance taken). */
export function ProgressBar({ value, max, label }: { value: number; max: number; label: string }) {
  const pct = max === 0 ? 0 : Math.round((value / max) * 100);
  return (
    <div
      role="progressbar"
      aria-label={label}
      aria-valuenow={value}
      aria-valuemin={0}
      aria-valuemax={max}
      className="h-2.5 w-full overflow-hidden rounded-full bg-line"
    >
      <div
        className="h-full rounded-full bg-success transition-[width] duration-700"
        style={{ width: `${pct}%` }}
      />
    </div>
  );
}

export type StepStatus = 'done' | 'current' | 'todo';

export interface JourneyStep {
  id: string;
  title: string;
  detail?: string;
  status: StepStatus;
}

/** The registration journey: a vertical path with clear done / now / next states. */
export function JourneySteps({
  steps,
  renderAction,
  renderSecondary,
}: {
  steps: JourneyStep[];
  /** The main button, shown on the current step. */
  renderAction?: (s: JourneyStep) => ReactNode;
  /** A quieter link on other steps, so steps can be done in any order. */
  renderSecondary?: (s: JourneyStep) => ReactNode;
}) {
  return (
    <ol className="relative flex flex-col">
      {steps.map((s, i) => {
        const last = i === steps.length - 1;
        return (
          <li key={s.id} className="relative flex gap-4 pb-6 last:pb-0">
            {!last && (
              <span
                aria-hidden="true"
                className={cx(
                  'absolute top-10 left-[19px] h-[calc(100%-2.5rem)] w-0.5 rounded-full',
                  s.status === 'done' ? 'bg-success' : 'bg-line',
                )}
              />
            )}
            <span
              className={cx(
                'relative z-10 grid size-10 shrink-0 place-items-center rounded-full text-base font-black',
                s.status === 'done' && 'bg-success text-on-success',
                s.status === 'current' && 'bg-primary text-on-primary ring-4 ring-brand-soft',
                s.status === 'todo' && 'border-2 border-line bg-surface text-ink-muted',
              )}
            >
              {s.status === 'done' ? <CheckIcon size={20} /> : i + 1}
            </span>
            <div className="min-w-0 flex-1 pt-1.5">
              <p
                className={cx(
                  'font-extrabold leading-snug',
                  s.status === 'todo' ? 'text-ink-muted' : 'text-ink',
                )}
              >
                {s.title}
                <span className="sr-only">
                  {s.status === 'done'
                    ? ' (done)'
                    : s.status === 'current'
                      ? ' (in progress)'
                      : ' (to do)'}
                </span>
              </p>
              {s.detail && <p className="mt-0.5 text-sm text-ink-muted">{s.detail}</p>}
              {s.status === 'current' && renderAction && (
                <div className="mt-3">{renderAction(s)}</div>
              )}
              {s.status !== 'current' && renderSecondary && (
                <div className="mt-1">{renderSecondary(s)}</div>
              )}
            </div>
          </li>
        );
      })}
    </ol>
  );
}
