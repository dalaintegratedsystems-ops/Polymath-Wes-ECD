# Plan: dashboards, admin-managed accounts and profiles ("Milestone 2.5")

Status: **built** (2026-10-18). Deviations from the plan, chosen to stay simple and secure:

- Passwords use scrypt from Node's standard library (OWASP parameters) instead of Argon2id,
  so there is no native module to ship or patch. The hash format records its parameters.
- Photos are resized on the phone and stored in Postgres (`profile_images`, under RLS) instead
  of blob storage; the server sniffs the type and strips EXIF, GPS and XMP itself, so `sharp`
  is not needed. Blob storage arrives with documents in Milestone 3.
- A short built-in list of common passwords replaces the 10,000-entry list.
- Activity is one row per user per day (`user_activity_days`), written by the auth hook,
  rather than a view over the audit log.

## Sequencing

Runs between Milestones 2 and 3. Metrics that depend on later milestones (documents M3,
plans and printables M4, attendance M5, Academy phase 2) are defined now in a metric registry
and **hidden until their data exists**, so the dashboards never show empty or fake numbers.

## 1. Data model (migration 0007)

| Change                                                                                                                                                                                         | Why                                                         |
| ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------- |
| `users`: `username` (unique, lowercase, nullable), `password_hash` (Argon2id), `must_change_password`, `failed_logins`, `locked_until`, `status` (`active` / `deactivated`), `avatar_blob_key` | Second sign-in method; deactivation; profile photo          |
| `centres`: `logo_blob_key`                                                                                                                                                                     | Centre branding                                             |
| `app.centre_metrics(centre_id, from, to)` (SECURITY DEFINER, checks caller is staff of that centre)                                                                                            | Centre dashboard aggregates in one call                     |
| `app.platform_metrics(filters jsonb)` + `app.platform_series(...)` (SECURITY DEFINER, checks `users.is_platform_admin`)                                                                        | Admin BI over aggregate data only; never returns child rows |
| `daily_activity` view over `audit_log`, `agent_runs`, `messages`, `feedback`                                                                                                                   | DAU/WAU/MAU, Wes usage, retention                           |

RLS stays the source of truth: the new functions return only aggregates and verify the caller.
New tables get policies, and `rls.test.ts` covers them.

## 2. API (all Zod-validated, in OpenAPI)

| Route                                                                                                                                    | Who                                                                                 |
| ---------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------- |
| `GET /v1/centres/{id}/dashboard?from&to`                                                                                                 | principal, practitioner (parents get `/v1/me/children-summary`)                     |
| `GET /v1/admin/metrics?from&to&province&city&size&role&status`                                                                           | platform admin                                                                      |
| `GET /v1/admin/metrics/export.csv?…`                                                                                                     | platform admin (aggregate tables only)                                              |
| `GET /v1/admin/centres?…` (no child data)                                                                                                | platform admin                                                                      |
| `POST /v1/auth/password` (username + password → same token pair as PIN sign-in)                                                          | anyone; rate-limited, lockout after 5 failures for 15 min                           |
| `POST /v1/auth/password/change`                                                                                                          | signed in; required when `must_change_password`                                     |
| `POST /v1/admin/users`, `PATCH /v1/admin/users/{id}`, `POST /v1/admin/users/{id}/reset-password`, `POST /v1/admin/users/{id}/deactivate` | platform admin (any centre); principal (own centre, roles practitioner/parent only) |
| `POST /v1/me/avatar`, `POST /v1/centres/{id}/logo` (multipart, max 2 MB) and `GET` signed URLs                                           | owner / principal                                                                   |

Passwords: Argon2id (`@node-rs/argon2`), min 10 characters, checked against a bundled list of
the 10,000 most common passwords, temporary passwords generated server-side (4 words +
2 digits) and shown once. Every create / reset / deactivate / failed-lockout is audited.
Deactivation revokes all refresh tokens.

Uploads: type sniffed from bytes (JPEG/PNG/WebP), resized to 512 px and re-encoded with
`sharp` (strips EXIF and GPS), stored in private blob storage (MinIO locally), served by
short-lived signed URL. Never children's photos.

## 3. Screens (packages/ui, Storybook first)

- **Centre dashboard** (`/dashboard`, linked from Home): headline cards with plain-language
  trend sentences ("Wes answered 12 questions this week, up from 7"), simple SVG sparkline
  charts (no chart library, to protect the 170 KB budget).
- **Admin console** (`/admin`, platform admins only): KPI tiles, funnel, retention table,
  usage and cost by centre, feedback by reason, escalation counts, filter bar (chips +
  selects), filters in the URL, "Reset filters", CSV export.
- **User management** (`/admin/users`, and `/centre/people` for principals): list, add
  person (name, role, phone and/or username), reset password, deactivate.
- **Password sign-in** on `/welcome` ("Sign in with a username instead"), and the forced
  "Choose a new password" screen.
- **Profile** (`/account`): photo, name, language. **Centre settings**: logo, details.

## 4. Copy clean-up

Replace every em dash and en dash in UI text, agent replies and stories (43 occurrences today)
with natural punctuation; a unit test fails if any reappear in `packages/ui/src`,
`apps/web` or agent reply constants. Hyphens inside words stay.

## 5. Verification

- RLS tests for the new functions (centre staff see only their centre; admin sees aggregates
  only; parent and funder get nothing they shouldn't).
- API integration tests per route and role, including lockout and forced password change.
- Playwright (360 px): crawl every link and button on every screen for each role, direct-URL
  access checks, both sign-in methods, sign-out, session expiry, dashboard filters, uploads,
  onboarding, add child + consent, Ask Wes; fail on console errors or failed requests.
- API contract tests generated from `/v1/openapi.json`: every operation gets success,
  validation, unauthenticated and forbidden cases where they apply.
- Screenshots of both dashboards (light and dark) in the summary.

## Risks

| Risk                                          | Mitigation                                                                                                   |
| --------------------------------------------- | ------------------------------------------------------------------------------------------------------------ |
| Passwords are weaker than phone PINs          | Offered as a fallback; lockout, Argon2id, forced change, audit; admins can require PIN-only per centre later |
| Metrics leak child data through small numbers | Admin views aggregate per centre or above; counts under 5 shown as "fewer than 5"                            |
| `sharp` native binary on Windows dev          | Falls back to storing the original after type check in development; CI and Docker use Linux                  |
| Bundle size from charts                       | Hand-rolled SVG sparklines; admin console code-split                                                         |
