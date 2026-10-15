# ADR-0010: Feature flags and phase-2 stubs

- Status: Accepted (Milestone 0)
- Date: 2026-10-16

## Context

Voice-note observations, behaviour coach, Parent Connect broadcasts, Academy, billing, the
funder dashboard and the partner API are designed for but not built. They must slot in later
without reworking routes, data or clients.

## Decision

- `FEATURE_FLAGS` in `@wes/shared` lists each capability, its phase and reserved route. All
  default **off**. Per-centre overrides live in the `feature_flags` table.
- The API registers each reserved route; it returns `501 not_implemented` in the standard error
  envelope and appears in the OpenAPI document under the `phase-2` tag.
- `GET /v1/meta` exposes flag states so clients can hide or show entry points.

## Consequences

Partners can see the shape of what's coming. Building a feature means filling its module and
flipping the flag, not moving routes.
