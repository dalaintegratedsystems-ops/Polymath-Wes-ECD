# Architecture

Polymath Wes is a modular monolith with a separate background worker, one Postgres database
and one AI agent shared by every channel. Decisions are recorded in [`adr/`](adr/).

## System context

```mermaid
flowchart LR
  P[Principal / practitioner<br/>smartphone] -->|PWA, offline-first| WEB
  P -->|WhatsApp| META[Meta WhatsApp<br/>Cloud API / BSP]
  G[Parent / caregiver] -->|WhatsApp, SMS| META
  F[Funder / NGO] -.->|phase 2 dashboard| WEB
  META -->|webhook| API
  WEB[Web PWA<br/>Next.js] -->|HTTPS /v1| API
  API[API<br/>Fastify] --> DB[(Postgres 16<br/>+ pgvector, RLS)]
  API --> Q[(Redis<br/>BullMQ)]
  Q --> W[Worker<br/>PDF, ingest, reminders, evals]
  W --> DB
  W --> BLOB[(Blob storage)]
  API --> BLOB
  API -->|redacted text only| LLM[Claude models]
  API -->|redacted queries| EMB[Embeddings provider]
  W -->|public corpus| EMB
```

## Containers and packages

```mermaid
flowchart TB
  subgraph apps
    web[apps/web<br/>Next.js PWA]
    api[apps/api<br/>Fastify modular monolith]
    worker[apps/worker<br/>BullMQ processors]
  end
  subgraph packages
    ui[packages/ui<br/>tokens, components, screens]
    shared[packages/shared<br/>roles, errors, Zod schemas, i18n]
    agent[packages/agent<br/>pipeline, tools, evals]
    channels[packages/channels<br/>WhatsApp, SMS, Web adapters]
    db[packages/db<br/>Drizzle schema, RLS, seed]
  end
  web --> ui
  web --> shared
  api --> shared
  api --> db
  api --> agent
  api --> channels
  worker --> db
  worker --> agent
  agent --> shared
```

## Request lifecycle (API)

```mermaid
sequenceDiagram
  participant C as Client (PWA / WhatsApp)
  participant A as API
  participant DB as Postgres (RLS)
  C->>A: POST /v1/... (Bearer JWT, Idempotency-Key)
  A->>A: request id, rate limit, Zod validation
  A->>A: auth: verify JWT, check membership + permission
  A->>DB: BEGIN; set_config(app.user_id, app.centre_id, app.role)
  A->>DB: queries (RLS filters rows)
  A->>DB: INSERT audit_log (child data access)
  A->>DB: COMMIT
  A-->>C: JSON, or ErrorEnvelope {code, message, requestId}
```

## Agent pipeline

```mermaid
flowchart LR
  M[Message] --> R[1 Redact<br/>names, contacts → tokens]
  R --> K[2 Classify<br/>intent, language, risk]
  K -->|child protection| E[3 Fixed escalation<br/>Childline 116, designated person]
  K -->|normal / sensitive| G[4 Plan + act<br/>≤ 6 tool calls]
  G --> GR[5 Ground<br/>search_knowledge, citations]
  GR --> PC[6 Post-check<br/>schema, citations, reading level]
  PC --> RS[Restore tokens]
  E --> RS
  RS --> PS[7 Persist<br/>AgentRun, cost, latency]
```

The ordering is fixed in `runPipeline` (`packages/agent/src/pipeline.ts`), so a stage cannot
skip the safety gate.

## Data model

Core entities (full schema: `packages/db/src/schema`):

```mermaid
erDiagram
  CENTRE ||--o{ MEMBERSHIP : has
  USER ||--o{ MEMBERSHIP : holds
  CENTRE ||--o{ GROUP : has
  CENTRE ||--o{ CHILD_INTAKE : "pending until consent"
  CENTRE ||--o{ CHILD : has
  CHILD ||--o{ CHILD_GUARDIAN : ""
  GUARDIAN ||--o{ CHILD_GUARDIAN : ""
  GUARDIAN ||--o{ CONSENT : gives
  CHILD ||--o{ CONSENT : "covered by"
  CHILD ||--o{ ATTENDANCE_RECORD : ""
  CENTRE ||--o{ ATTENDANCE_DAILY_COUNT : "anonymous"
  CENTRE ||--o{ COMPLIANCE_DOCUMENT : ""
  COMPLIANCE_ITEM ||--o{ COMPLIANCE_DOCUMENT : ""
  CENTRE ||--o{ AUDIT_RUN : ""
  CENTRE ||--o{ POLICY : ""
  CENTRE ||--o{ WEEKLY_PLAN : ""
  CENTRE ||--o{ PRINTABLE : ""
  CENTRE ||--o{ CONVERSATION : ""
  CONVERSATION ||--o{ MESSAGE : ""
  CONVERSATION ||--o{ AGENT_RUN : ""
  AGENT_RUN ||--o{ TOOL_CALL : ""
  MESSAGE ||--o{ FEEDBACK : ""
  KNOWLEDGE_SOURCE ||--o{ KNOWLEDGE_CHUNK : "embedded"
```

Notable choices:

- **Child:** pseudonymous UUID, first name, birth month (`YYYY-MM`), group. No surname, no ID number.
- **ChildIntake:** a child is only an intake until a guardian consents (ADR-0003, privacy.md).
- **AttendanceDailyCount:** anonymous headcounts kept when a child's records are deleted, so
  subsidy evidence survives consent withdrawal (pending decision #2).
- **Guardian phone:** encrypted with a blind index (ADR-0007).
- **Messages** are stored redacted, the same text the model saw.

## Frontend

- Next.js App Router; screens live in `@wes/ui` and are composed by thin pages, so Storybook and
  the app render identical components.
- Tailwind CSS 4 utilities map to semantic tokens (`bg-canvas`, `text-ink`, `bg-primary`), so light
  and dark themes need no `dark:` variants.
- Serwist service worker; Dexie outbox for offline writes (ADR-0005).
- Performance budget: first-load JS under 170 KB gzip per route, checked in CI
  (`apps/web/scripts/check-bundle.mjs`). Milestone 0: about 113 KB.
