'use client';

import { useEffect } from 'react';
import { usePathname } from 'next/navigation';

/** Runtime caches that may hold one person's pages (see app/sw.ts and Serwist's defaults). */
const PERSONAL_CACHES = /pages|rsc|apis|others/;

/**
 * Registers the offline service worker where the browser supports it (some in-app browsers
 * and private modes do not). On the signed-out screens it also clears cached pages, so the
 * next person to use a shared phone never sees the previous person's centre offline.
 */
export function ServiceWorker() {
  const pathname = usePathname();

  useEffect(() => {
    if (process.env.NODE_ENV !== 'production' || !('serviceWorker' in navigator)) return;
    navigator.serviceWorker.register('/sw.js', { scope: '/' }).catch(() => undefined);
  }, []);

  useEffect(() => {
    if (!pathname.startsWith('/welcome') || !('caches' in window)) return;
    void caches
      .keys()
      .then((names) =>
        Promise.all(names.filter((n) => PERSONAL_CACHES.test(n)).map((n) => caches.delete(n))),
      )
      .catch(() => undefined);
  }, [pathname]);

  return null;
}
