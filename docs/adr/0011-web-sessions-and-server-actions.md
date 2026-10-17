# ADR-0011: Web sessions in httpOnly cookies, API calls from the server

- Status: Accepted (Milestone 1)
- Date: 2026-10-17

## Context

The PWA needs the API's access and refresh tokens. Keeping them in `localStorage` exposes them to
any script injected into the page; keeping only an in-memory token logs people out on every
reload, which hurts on flaky 3G.

## Decision

- The web app acts as a thin backend-for-frontend. **Server actions** (`apps/web/app/actions.ts`)
  and server components call the API; the browser never sees a token.
- Tokens live in **httpOnly, SameSite=Lax** cookies (`Secure` in production): access (expires
  30 s before the 10-minute JWT), refresh (30 days), selected centre, and a 15-minute pending
  phone number between "send PIN" and "enter PIN". **No personal data goes in URLs.**
- **Middleware** rotates the refresh token when the access cookie has expired, before any page
  renders, and redirects to `/welcome` when there is no session.
- The API stays the single source of truth for authorisation (JWT + membership + RLS); the web
  app only decides which screen to show.

## Consequences

- Offline writes (Milestone 5) will go through the same server actions when back online, with
  idempotency keys generated on the device.
- WhatsApp and partner clients use bearer tokens directly; nothing here is web-specific in the API.
