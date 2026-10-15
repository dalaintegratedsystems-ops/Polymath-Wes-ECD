# ADR-0004: In-house phone OTP and JWT auth

- Status: Accepted (Milestone 0), built in Milestone 1
- Date: 2026-10-16

## Context

Users sign in with a phone number; most have WhatsApp, some only SMS. We want no email or
password, low cost per login, data in South Africa, and the same tokens for the PWA and partners.

## Decision

- `POST /v1/auth/otp`: create a 6-digit code, store an HMAC hash with a 5-minute expiry and an
  attempt counter (max 5), deliver via the WhatsApp authentication template, falling back to SMS.
  In development, codes go to the console (`OTP_DELIVERY=console`).
- `POST /v1/auth/token`: verify the code, then issue a **10-minute access JWT** (`jose`, HS256 now,
  asymmetric keys from Key Vault in production) and a **30-day refresh token**.
- Refresh tokens are random 256-bit strings, stored hashed, and **rotate on every use**. Reuse of a
  rotated token revokes the whole token family (theft detection).
- Rate limits per phone and per IP on OTP requests.

## Alternatives considered

Managed identity providers (Auth0, Entra External ID, Firebase): faster to start, but per-MAU
cost, data residency questions and weaker WhatsApp OTP support.

## Consequences

We own the security of this flow; it gets focused tests and a review in Milestone 7. Meta must
approve the WhatsApp authentication template before production.
