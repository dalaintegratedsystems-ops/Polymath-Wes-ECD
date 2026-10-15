# ADR-0005: Offline-first sync and conflict handling

- Status: Accepted (Milestone 0), completed in Milestone 5
- Date: 2026-10-16

## Context

Half of practitioners lack reliable Wi-Fi. Attendance and drafts must work with no signal and
sync later without double-writes or silent data loss.

## Decision

- **Service worker (Serwist):** precaches the app shell and core screens, caches visited pages,
  serves `/~offline` when a page isn't available.
- **IndexedDB (Dexie), loaded lazily:** `drafts` for unsent work, `outbox` for API writes.
- Every queued write gets its **idempotency key when it is created**, so retries are identical
  requests and the server deduplicates them.
- The outbox replays **oldest-first** and stops at the first network failure to keep order.
- Conflict rules:
  - **Attendance:** one row per child per day; last write wins on the client's `clientUpdatedAt`.
  - **Drafts:** owned by one user, so no cross-user conflicts.
  - **Anything else returning 409/412** is parked as a conflict for the user to resolve, never
    retried blindly.

## Consequences

- Users see "saved on this phone" vs "synced" states (Milestone 5 UI).
- `apps/web/lib/offline` has unit tests for ordering, retry and conflict parking.
