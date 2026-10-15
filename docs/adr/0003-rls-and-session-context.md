# ADR-0003: Row-level security and request context

- Status: Accepted (Milestone 0)
- Date: 2026-10-16

## Context

Child data must never leak between centres or to the wrong role, even if application code has
a bug. Middleware checks alone are one mistake away from a breach.

## Decision

Defence in depth: the API checks permissions (`can(role, permission)` in `@wes/shared`) **and**
Postgres enforces row-level security.

- Three database roles: `wes_owner` (owns schema, runs migrations, bypasses RLS as owner),
  `wes_app` (API; `NOBYPASSRLS`, owns nothing), `wes_worker` (jobs; scoped grants).
- Every request runs inside `withRequestContext(db, ctx, fn)`, which opens a transaction and sets
  `app.user_id`, `app.centre_id` and `app.role` with `set_config(..., true)` (transaction-local,
  safe with connection pools).
- Policies (migration `0001_rls.sql`) read those settings through helper functions
  (`app.in_centre()`, `app.is_staff()`):
  - Staff (principal, practitioner) see their own centre only.
  - Parents see only children linked to them, and their attendance.
  - Funders see anonymous daily counts only, never child rows.
  - Platform admins see centres but **no child data** (POPIA minimisation).
  - No context means no rows.
- `audit_log` is insert-only for app roles. Knowledge tables are read-only for the API.
- `otp_challenges` has no RLS (used before a user exists); it holds no centre data and stores
  hashed codes only.

## Consequences

- A test (`packages/db/test/rls.test.ts`) asserts every table has RLS enabled and exercises each
  role. It runs on PGlite locally and real Postgres 16 in CI.
- New tables must add policies in a migration or the RLS test fails.
- The worker sets `app.role = 'system'` and a centre per job; `system` is honoured only for the
  `wes_worker` database role.
