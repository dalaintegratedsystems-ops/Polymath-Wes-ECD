import type { ReactNode } from 'react';
import { OfflineIcon } from './icons';
import { BottomNav, defaultRenderLink, type NavKey, type RenderLink } from './nav';

/** Phone-first frame: content column up to 448px, bottom nav, room for the safe area. */
export function AppShell({
  active,
  renderLink = defaultRenderLink,
  offline = false,
  children,
}: {
  active: NavKey;
  renderLink?: RenderLink;
  offline?: boolean;
  children: ReactNode;
}) {
  return (
    <div className="min-h-dvh bg-canvas">
      <a
        href="#main"
        className="sr-only focus:not-sr-only focus:fixed focus:top-2 focus:left-2 focus:z-50 focus:rounded-full focus:bg-surface focus:px-4 focus:py-2"
      >
        Skip to content
      </a>
      {offline && <OfflineBanner />}
      <div id="main" className="mx-auto max-w-md pb-[calc(5rem+env(safe-area-inset-bottom))]">
        {children}
      </div>
      <BottomNav active={active} renderLink={renderLink} />
    </div>
  );
}

export function OfflineBanner() {
  return (
    <div role="status" className="sticky top-0 z-30 bg-ink text-canvas">
      <p className="mx-auto flex max-w-md items-center gap-2 px-4 py-2 text-sm font-bold">
        <OfflineIcon size={18} />
        You’re offline. Your work is saved and will sync later.
      </p>
    </div>
  );
}

/** Simple page header for inner screens. */
export function PageHeader({ title, subtitle, action }: { title: string; subtitle?: string; action?: ReactNode }) {
  return (
    <header className="flex items-start justify-between gap-3 px-4 pt-[calc(env(safe-area-inset-top)+1.25rem)] pb-4">
      <div>
        <h1 className="text-[1.75rem] leading-tight font-black tracking-tight text-ink">{title}</h1>
        {subtitle && <p className="mt-1 text-ink-muted">{subtitle}</p>}
      </div>
      {action}
    </header>
  );
}
