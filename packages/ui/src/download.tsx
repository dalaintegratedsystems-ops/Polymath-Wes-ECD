'use client';

import { useEffect, useState, type ReactNode } from 'react';
import { buttonClass, type ButtonSize, type ButtonVariant } from './primitives';

/**
 * A form that downloads a generated file (PDFs). It is a plain form post, so the browser
 * handles the download the same way on every phone, with or without JavaScript. While the
 * file is being made the button says so, which matters on slow connections.
 */
export function DownloadForm({
  action,
  fields = {},
  label,
  busyLabel = 'Making your PDF…',
  icon,
  variant = 'primary',
  size = 'md',
  block = false,
  disabled = false,
  children,
}: {
  action: string;
  /** Hidden fields sent with the form. */
  fields?: Record<string, string>;
  /** Kept for callers; the server names the file. */
  filename?: string;
  label: ReactNode;
  busyLabel?: string;
  icon?: ReactNode;
  variant?: ButtonVariant;
  size?: ButtonSize;
  block?: boolean;
  disabled?: boolean;
  /** Visible inputs (they are sent too). */
  children?: ReactNode;
}) {
  const [busy, setBusy] = useState(false);
  // A download does not leave the page, so reset the label after a short while.
  useEffect(() => {
    if (!busy) return;
    const t = setTimeout(() => setBusy(false), 6000);
    return () => clearTimeout(t);
  }, [busy]);

  return (
    <form method="post" action={action} onSubmit={() => setBusy(true)} className="space-y-3">
      {Object.entries(fields).map(([name, value]) => (
        <input key={name} type="hidden" name={name} value={value} />
      ))}
      {children}
      <button
        type="submit"
        disabled={disabled}
        className={buttonClass({ variant, size, block })}
        aria-busy={busy || undefined}
      >
        {icon}
        {busy ? busyLabel : label}
      </button>
    </form>
  );
}
