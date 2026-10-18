# Polymath Wes AI (ECD Centre Copilot): build brief

## Project state (keep this section current)

- **Milestone 0 (plan and scaffold): complete.**
- **Milestone 1 (identity and centres): complete.**
- **Milestone 2 (agent core): complete, awaiting review.** Next: Milestone 3 (registration copilot).
  - Wes runs **offline** (deterministic, documents-only) until `ANTHROPIC_API_KEY` is set; live Claude path is built and type-checked but not yet exercised against the real API.
  - Knowledge base holds placeholders only, so registration answers say "couldn't find" until `<<NCF_AND_DBE_DOCUMENT_SET>>` is added.
  - 46 golden evals; CI gate: safety categories 100%, overall within 3 points of `packages/agent/evals/baseline.json`.
- **Milestone 2.5 (dashboards, admin-managed accounts, profiles): complete** (see `docs/plans/dashboards-accounts-profiles.md` for deviations: scrypt not Argon2id, photos in Postgres).
  - Centre dashboard `/dashboard`, platform console `/admin` (Dala admins: `users.is_platform_admin`), people management `/people`, username sign-in `/welcome/username`, forced password change, profile photo and centre logo.
  - The `wes_app` role cannot read `users.password_hash` or `users.phone_e164` (column grants); use the `app.*` definer functions.
  - No em or en dashes in user-facing copy (`packages/ui/test/copy.test.ts`); Wes replies are normalised in the post-check.
- **Milestone 3 (registration copilot): complete.** Self-audit, journey progress, document capture (Azure Blob via managed identity; filesystem locally), policy drafts from guided questions with edit and approve, policy PDFs and the application pack (pdf-lib, ADR-0013). Checklist content is still the labelled placeholder until `<<NCF_AND_DBE_DOCUMENT_SET>>` arrives.
- **Milestone 4 (planner and printables): complete.** Weekly plans (Claude structured output when live, built-in low-cost activity library offline or as fallback), adapt activities, approve, flashcards, tracing and counting PDFs. ELDA names are in `packages/shared/src/schemas/planner.ts`; their descriptions and NCF citations are TODO(content).
- **Milestone 5 (children and attendance): complete.** Daily register with offline-first taps (Dexie outbox, `/api/sync` proxy, newest mark wins with visible conflicts), anonymous daily headcounts, monthly CSV export for principals, today's attendance on Home. The subsidy claim format itself is TODO(content).
- **Milestone 6 (WhatsApp channel): complete.** Meta Cloud API adapter (signatures, menus, documents via media upload, templates), webhook through the web app to the private API, dedupe, the same Wes pipeline, sign-in PINs and reminders by template (ADR-0014). Needs `<<WHATSAPP_*>>` and two approved templates; SMS still needs a provider.
- Repo: https://github.com/dalaintegratedsystems-ops/Polymath-Wes-ECD (branch `main`).
- Decisions assumed in M0, pending confirmation:
  1. Withdrawing consent deletes the child, guardian links and per-day attendance, but keeps anonymous per-centre daily headcounts (`attendance_daily_counts`) for subsidy evidence.
  2. Consent is captured by guardian OTP **or** a photo of the signed paper form (both supported).
  3. Embeddings: Voyage AI `voyage-multilingual-2` (1024-d) behind an interface (ADR-0006).
  4. Model provider endpoint (Anthropic direct vs Claude on Microsoft Foundry) open (ADR-0009).
  5. Deployment: simplified two-container Azure setup (worker in the API process, Postgres-backed queue instead of Redis) pending confirmation in ADR-0012.
  6. Safety patterns in Afrikaans, isiXhosa and isiZulu need native-speaker review (`packages/agent/src/safety.ts`).
- Working conventions:
  - Never invent registration rules, NCF content or subsidy figures. Use `knowledge/` or mark `TODO(content)`.
  - All centre data access goes through `withRequestContext` (`packages/db/src/client.ts`); new tables need RLS policies or `rls.test.ts` fails.
  - Screens live in `packages/ui/src/screens`; `apps/web` pages are thin and pass data plus `nextRenderLink`.
  - Colours only through semantic tokens (`packages/ui/src/tokens.ts`, then `pnpm --filter @wes/ui tokens`).
  - Windows with a long checkout path: set `npm_config_virtual_store_dir` to a short path before `pnpm install`, and `git config core.longpaths true`.
  - Operations that can't run under a centre context (sign-in, onboarding, guardian linking, consent withdrawal) are narrowly scoped `SECURITY DEFINER` functions in `packages/db/migrations/0002_auth.sql`; add new ones there, never bypass RLS in app code.
  - The web app never holds tokens in JS: server actions + httpOnly cookies (ADR-0011). No personal data in URLs.
  - Local dev without Docker: the API uses embedded PGlite (seeded); PINs print in the API log. E2E reads PINs from `OTP_OUTBOX_FILE` (refused in production).
  - Wes safety: change `safety.ts` patterns, never loosen an eval to make it pass. Every model call gets redacted text only; the escalation reply is fixed text, never generated.
  - Evals: `pnpm --filter @wes/agent evals` (offline) / `--live`; add cases to `packages/agent/evals/cases/*.jsonl`.

---

## 1. Your role

You are the founding engineering team for **Polymath Wes AI**, built by Dala Integrated Systems (Pty) Ltd, Cape Town. Act as a senior full-stack engineer, AI/agent engineer, product designer and DevOps engineer in one. Build production-quality software, not a demo: typed, tested, secure, observable and deployable.

Work in milestones. At the end of each milestone, stop, summarise what was built, show how to run it, list open decisions, and wait for approval before continuing.

## 2. Product context

Polymath Wes AI is a **smartphone-first, WhatsApp-native AI copilot for South African Early Childhood Development (ECD) centres**, focused on under-resourced communities. It helps centres get **registered, funded and running well**, then supports teaching, child progress and parent engagement, anchored to the **National Curriculum Framework (NCF) for children birth to four** and its Early Learning and Development Areas (ELDAs), under the Department of Basic Education (DBE).

Evidence from the needs assessment (centre principals and practitioners):

- 8 of 10 centres are mid-registration with the DBE; registration paperwork is the top framework need. Registration unlocks the ECD subsidy (R24 per eligible child per day, per the needs assessment brief; verify against the knowledge base before showing users).
- 9 of 10 cite funding as the biggest shortage; 7 of 10 rank behaviour management as the hardest daily challenge; parent involvement is a recurring pain.
- Top AI asks: printable materials, practitioner upskilling, less admin, NCF-aligned plans, child progress tracking, parent communication.
- 9 of 10 work on a **personal smartphone**; only half have reliable Wi-Fi. Comfort with apps is high.
- Trust concerns: wrong answers, stored data, cultural relevance.

**Product principles (non-negotiable):**

1. Phone-first and low-data: works on a 360 px wide, mid-range Android over 3G, and offline.
2. WhatsApp is a first-class channel, not an add-on.
3. Grounded AI: answers about the NCF or registration cite curated sources; no source, no claim.
4. The practitioner decides: reports, policies and parent messages are drafts until a human approves them.
5. Child safety and POPIA come first: minimise child data, require parent consent, never diagnose.
6. South African by design: local names, examples, low-cost materials, and multilingual from day one (English first, then Afrikaans, isiXhosa, isiZulu).

**Personas:** Principal-practitioner (primary, runs a 10–50 child centre), Practitioner, Parent/Caregiver, Funder/NGO programme manager, Platform Admin.

## 3. Scope

### Build now: MVP (Phase 1) plus foundations

| ID | Capability | Acceptance criteria (summary) |
| --- | --- | --- |
| 1.1 | Phone + OTP sign-up, centre profile | OTP via WhatsApp or SMS adapter; centre profile with address, ages served, child count |
| 1.2 | Roles: principal, practitioner, parent, funder, admin | Enforced in API middleware and DB row-level security; tested per role |
| 1.3 | Offline-first PWA | Installable; core screens and drafts work offline; background sync with conflict handling |
| 1.4 | WhatsApp assistant | Webhook adapter, menu + free text, same agent and API as the PWA |
| 1.5 | Parent consent per child | Captured, timestamped, revocable; revocation deletes child records |
| 2.1 | Registration self-audit | Guided checklist against registration norms; outputs a prioritised gap list |
| 2.2 | Document checklist | Photo upload, document type, expiry dates, reminders |
| 2.3 | Policy generator | Admissions, health, safety, child-protection policies from guided questions; editable draft |
| 2.4 | Application pack | One PDF combining centre details, policies and documents |
| 3.1 | NCF weekly planner | Theme plan for mixed ages, tagged to ELDAs, with citations |
| 3.2 | Printables | Low-ink A4 PDFs (worksheets, flashcards) |
| 3.3 | Low-cost activities | Uses free or recycled materials |
| 5.1 | Child register + attendance | Daily attendance; monthly export suitable for subsidy claims |
| 10.1 | Grounded answers | Retrieval over a curated, versioned corpus; every answer shows sources |
| 10.2 | Safety rules | No diagnosis; child-protection disclosures trigger a fixed escalation flow |
| 10.3 | Feedback + eval harness | Thumbs up/down with reason; eval suite runs in CI and blocks regressions |

### Design for, but do not build yet

Voice-note observations, behaviour coach, Parent Connect broadcasts, Academy, billing, funder dashboard, partner API and webhooks. Clean module boundaries, feature flags and stub routes so these slot in without rework.

## 4. Technical architecture

- **Monorepo:** pnpm workspaces + Turborepo, TypeScript strict everywhere.
- **apps/web:** Next.js (App Router) PWA, React, Tailwind CSS, Serwist, Dexie (IndexedDB) offline storage and sync queue, TanStack Query.
- **apps/api:** Fastify, Zod schemas generating **OpenAPI 3.1** at `/v1/openapi.json`, OAuth 2.0 / JWT with short-lived access tokens and refresh rotation.
- **apps/worker:** BullMQ on Redis for PDF generation, document ingestion, reminders, evals.
- **packages/agent:** the AI agent (section 5), Anthropic TypeScript SDK with tool use.
- **packages/db:** PostgreSQL 16 + pgvector, Drizzle ORM and migrations, row-level security per centre.
- **packages/channels:** `WhatsAppCloudAdapter` (Meta Cloud API, BSP-agnostic), `SmsAdapter`, `WebAdapter` behind one interface.
- **packages/ui:** design system and tokens (section 6), with Storybook.
- **packages/shared:** types, Zod schemas, i18n messages (ICU format), constants.
- **Storage:** S3-compatible blob storage (MinIO locally, Azure Blob in production).
- **PDF:** HTML templates rendered with Playwright/Chromium in the worker.
- **Local dev:** `docker compose up` brings up Postgres+pgvector, Redis, MinIO and Mailpit; `pnpm dev` runs everything with seed data.
- **Production:** Azure **South Africa North**: Container Apps, PostgreSQL Flexible Server, Blob Storage, Key Vault, Application Insights. IaC in **Bicep** under `infra/`.
- **CI/CD:** GitHub Actions: lint, typecheck, unit, integration, e2e (Playwright), agent evals, dependency and secret scanning, build images, deploy to staging on merge to `main`.

Modular monolith with domain modules (`auth`, `centres`, `children`, `attendance`, `compliance`, `policies`, `planner`, `printables`, `assistant`, `consent`), each owning routes, service, repository and tests. All clients use the same versioned API.

### Core API (v1)

```
POST /v1/auth/otp            POST /v1/auth/token          POST /v1/auth/refresh
GET|PATCH /v1/centres/{id}   GET /v1/centres/{id}/staff
GET|POST /v1/centres/{id}/children      POST /v1/children/{id}/consents
POST /v1/centres/{id}/attendance        GET /v1/attendance/export?month=YYYY-MM
GET /v1/compliance/checklist  POST /v1/compliance/audit  POST /v1/compliance/documents  POST /v1/compliance/pack
POST /v1/policies/generate    GET /v1/policies/{id}.pdf
POST /v1/plans/weekly         POST /v1/activities/adapt  POST /v1/printables
POST /v1/assistant/messages (SSE streaming)   POST /v1/assistant/feedback
POST /v1/channels/whatsapp/webhook             POST /v1/channels/sms/webhook
```

Every endpoint: Zod-validated input and output, consistent error envelope, idempotency keys on writes, centre-scoped authorisation, audit logging for child data access, rate limiting.

## 5. The AI agent ("Wes")

**Models (env-configurable, never hard-coded):** router/classifier and safety pre-check `claude-haiku-5-5`; main `claude-sonnet-5-5`; optional long-document escalation `claude-opus-5-5`.

**Pipeline for every message:** 1) Redact names and contacts to tokens before any model call; 2) Classify intent, language, risk (normal, sensitive, child-protection) as JSON; 3) Safety gate: child-protection disclosures bypass generation and run the fixed escalation flow (acknowledge, immediate safety steps, the centre's designated person, social services and Childline 116, log the event; never diagnose); 4) Plan and act with tools, max 6 tool calls per turn, per-centre monthly token budget; 5) Ground NCF/ELDA/registration answers in `search_knowledge` with citations, or say nothing relevant was found and suggest who to ask; 6) Post-check schema, citations, banned content, reading level; 7) Persist `AgentRun`, tool calls, latency, token cost, feedback.

**Tools:** `search_knowledge`, `get_compliance_checklist`, `run_self_audit`, `generate_policy_draft`, `build_application_pack`, `create_weekly_plan`, `adapt_activity`, `generate_printable`, `record_attendance`, `get_child_summary`, `escalate_child_protection`, `create_reminder`. Typed with Zod; each calls a domain service, never the DB.

**Knowledge base:** ingestion job chunks, embeds and versions documents in `knowledge/`. Placeholder content until `<<NCF_AND_DBE_DOCUMENT_SET>>` arrives.

**WhatsApp:** messages under 1,000 characters, numbered quick-reply menus, PDFs as documents, resume state across sessions, respect the 24-hour window, approved templates outside it.

**Evals:** `packages/agent/evals/`, at least 60 golden cases (registration, planning, printables, multilingual, prompt injection, off-topic, diagnosis requests, child-protection disclosures). Score groundedness, safety, format, helpfulness. CI fails if safety < 100% or overall drops > 3 points.

## 6. Design

Warm, hopeful, proudly South African, not generic SaaS or childish. Ochre and sunbaked clay primaries, fynbos green success, protea pink accent, deep ink text, soft sand backgrounds; WCAG 2.2 AA. Nunito (or Atkinson Hyperlegible), 16 px minimum body. Mobile-first, one primary action per screen, bottom navigation (Home, Plan, Children, Registration, Wes), 48 px touch targets. Icon plus label on every action, plain language, visual progress. Encouraging home screen, celebration states, small inclusive SVG illustrations. Initial JS under 170 KB gzip, Lighthouse performance 90+ and accessibility 95+ on throttled mid-range Android, lazy images, data-saver mode. Printables: low-ink, black-and-white-safe A4. Key screens in Storybook first.

## 7. Security, privacy and compliance

POPIA by design (minimisation, purpose limitation, consent before any child record, export and deletion, retention). TLS and encryption at rest; field-level encryption for guardian contacts; secrets in Key Vault or `.env` (never committed). RLS per centre; least privilege; audit log for every child-data read and write. OWASP ASVS L2; input validation; CSP; dependency and secret scanning in CI. AI provider calls carry no direct identifiers; documented in `docs/privacy.md` with a data flow diagram and draft record of processing activities.

## 8. Definition of done

Strict types, clean lint, tests at the right level (unit for services, integration for API routes against real Postgres, Playwright e2e for key journeys); ≥ 80% coverage for domain services and the agent pipeline; OpenAPI updated; works offline where applicable and at 360 px; evals pass; docs updated (`README.md`, `docs/architecture.md`, `docs/api.md`, `docs/agent.md`, `docs/runbook.md`, ADRs).

## 9. Milestones (stop and report after each)

| # | Milestone | Output |
| --- | --- | --- |
| 0 | Plan and scaffold | Stack, data model, folder structure, ADRs; monorepo, Docker Compose, CI skeleton, design tokens, seed data |
| 1 | Identity and centres | OTP auth, roles, centre profile, consent, RLS, audit log, onboarding screens |
| 2 | Agent core | Redaction, router, safety gate, tool framework, knowledge ingestion and retrieval, streaming chat in the PWA, first 30 evals |
| 3 | Registration copilot | Self-audit, document capture, policy generator, application pack PDF, registration journey UI |
| 4 | Planner and printables | Weekly plans with ELDA tags and citations, activity adaptation, printable PDFs |
| 5 | Children and attendance | Child register, attendance, monthly export, offline sync |
| 6 | WhatsApp channel | Webhook adapter, menus, PDFs, session state, templates, e2e tests with a mock Meta server |
| 7 | Hardening and deploy | Full eval suite, performance and accessibility budgets, security review, Bicep infra, staging deployment, runbook |

## 10. How to work

Start every milestone in plan mode and wait for approval. Small conventional commits. Run tests and type checks before claiming something works. Ask one focused question when unclear; state assumptions in the milestone summary. Never invent registration rules, NCF content or subsidy figures.

## 11. Placeholders still to fill

`<<ANTHROPIC_API_KEY>>`, `<<WHATSAPP_PHONE_NUMBER_ID>>`, `<<WHATSAPP_ACCESS_TOKEN>>`, `<<WHATSAPP_VERIFY_TOKEN>>`, `<<SMS_PROVIDER_CREDENTIALS>>`, `<<AZURE_SUBSCRIPTION_ID>>`, `<<AZURE_RESOURCE_GROUP>>`, `<<NCF_AND_DBE_DOCUMENT_SET>>`, `<<BRAND_ASSETS>>`.
