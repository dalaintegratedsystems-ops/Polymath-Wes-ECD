# Polymath Wes AI

**Wes** is a smartphone-first, WhatsApp-native AI copilot for South African Early Childhood
Development (ECD) centres. It helps centres get registered, funded and running well, then
supports teaching, child progress and parent engagement, anchored to the National Curriculum
Framework (birth to four).

Built by Dala Integrated Systems (Pty) Ltd, Cape Town.

> **Status: Milestone 0 (plan and scaffold).** The PWA renders demo data; auth, the agent and
> WhatsApp arrive in Milestones 1–6. See [CLAUDE.md](CLAUDE.md) for the full brief.

## Quick start (under 10 minutes)

Prerequisites: Node.js 24, pnpm 9 (`corepack enable`), Docker Desktop.

```bash
pnpm install
```

```bash
cp .env.example .env
```

```bash
docker compose up -d
```

```bash
pnpm db:migrate && pnpm db:seed
```

```bash
pnpm dev
```

Then open the PWA at http://localhost:3000 (use your browser's phone emulation at 360 px), the
API at http://localhost:4000/v1/openapi.json, and Storybook with `pnpm storybook` at
http://localhost:6006.

No Docker? `pnpm test` still runs everything, including row-level security tests, against an
in-process Postgres (PGlite).

## What's here

```
apps/
  web/        Next.js PWA: offline-first, installable, 360 px-first
  api/        Fastify modular monolith, Zod → OpenAPI 3.1 at /v1/openapi.json
  worker/     BullMQ jobs: PDFs, knowledge ingestion, reminders, evals
packages/
  ui/         Design tokens, components, illustrations, screens (+ Storybook)
  shared/     Roles, error envelope, Zod schemas, feature flags, i18n catalogues
  db/         Drizzle schema, migrations, row-level security, seed, test harness
  agent/      Wes pipeline contracts, tool catalogue, evals
  channels/   WhatsApp / SMS / Web adapters and WhatsApp formatting rules
knowledge/    Curated corpus (placeholders until the official documents are added)
infra/        Azure Bicep (Milestone 7)
docs/         Architecture, API, agent, privacy, runbook, ADRs
```

## Everyday commands

| Command                               | What it does                            |
| ------------------------------------- | --------------------------------------- |
| `pnpm dev`                            | Run web, API and worker in watch mode   |
| `pnpm test`                           | All unit and integration tests          |
| `pnpm lint` / `pnpm typecheck`        | Lint and strict type checks             |
| `pnpm build`                          | Production builds                       |
| `pnpm --filter @wes/web check:bundle` | Enforce the 170 KB first-load JS budget |
| `pnpm storybook`                      | Design system and screens               |
| `pnpm db:generate`                    | New migration from schema changes       |

## Design

Warm, hopeful and proudly South African: ochre and sunbaked clay, fynbos green, protea pink,
deep ink on soft sand. Nunito at 16 px minimum, 48 px touch targets, icon plus label on every
action, one primary action per screen. Every text colour pair is tested for WCAG 2.2 AA in
both themes (`packages/ui/test/tokens.test.ts`).

## Docs

- [Architecture](docs/architecture.md) · [API](docs/api.md) · [Agent](docs/agent.md)
- [Privacy and POPIA](docs/privacy.md) · [Runbook](docs/runbook.md) · [ADRs](docs/adr/)

## Windows note

If `pnpm install` fails with `spawnSync ... esbuild.exe ENOENT`, your checkout path is too long
for Windows to start native binaries. Clone to a short path such as `C:\dev\wes`, or set
`npm_config_virtual_store_dir=C:/wes-vs` before installing.

If `pnpm test` (or any `turbo` command) exits with code `3221225781`, install the Microsoft
Visual C++ Redistributable (x64), which Turborepo needs on Windows. Meanwhile,
`pnpm -r run test` runs the same scripts without Turborepo.
