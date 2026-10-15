# ADR-0002: Modular monolith API

- Status: Accepted (Milestone 0)
- Date: 2026-10-16

## Context

We need one versioned API for the PWA, WhatsApp, a future funder dashboard and partners, built
by a small team, deployed cheaply in Azure South Africa North.

## Decision

A single Fastify service with domain modules (`auth`, `centres`, `children`, `consent`,
`attendance`, `compliance`, `policies`, `planner`, `printables`, `assistant`, `channels`). Each
module owns `routes.ts`, `service.ts`, `repository.ts`, `schemas.ts` and its tests. Modules call
each other only through services, never another module's repository.

Routes are declared with `defineRoute` (Zod schemas for params, query, body and responses). The
same declaration validates requests at runtime, types the handler, and generates the OpenAPI 3.1
document at `/v1/openapi.json`. The agent's tools call the same services.

Background work (PDFs, ingestion, reminders, evals) runs in a separate **worker** process on
BullMQ, sharing the domain code.

## Consequences

- One deployable, one database, simple transactions; boundaries are enforced by convention and
  review, not the network.
- A module can be extracted into its own service later if load demands it.
- Phase-2 features get reserved routes returning 501 (ADR-0010).
