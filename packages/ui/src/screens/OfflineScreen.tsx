import { RestingPhone } from '../illustrations';

/** Served by the service worker when a page isn't cached and there's no signal. */
export function OfflineScreen() {
  return (
    <main className="mx-auto flex min-h-dvh max-w-md flex-col items-center justify-center px-6 text-center">
      <RestingPhone className="w-44" />
      <h1 className="mt-4 text-2xl font-black text-ink">No signal right now</h1>
      <p className="mt-2 text-ink-muted">
        That’s okay. Pages you’ve opened before still work, and anything you save will sync when you’re back online.
      </p>
      <a href="/" className="mt-6 inline-flex min-h-touch items-center rounded-full bg-primary px-6 font-extrabold text-on-primary">
        Go to Home
      </a>
    </main>
  );
}
