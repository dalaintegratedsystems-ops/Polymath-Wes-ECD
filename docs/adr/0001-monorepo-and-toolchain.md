# ADR-0001: Monorepo and toolchain

- Status: Accepted (Milestone 0)
- Date: 2026-10-16

## Context

Web, API, worker, agent and channel code share types, schemas and design tokens. A small team
needs one place to change a schema and see every consumer break at compile time.

## Decision

- **pnpm workspaces + Turborepo**, TypeScript `strict` everywhere (plus `noUncheckedIndexedAccess`).
- Node **24 LTS**; pnpm 9 pinned via `packageManager`.
- Workspace packages export TypeScript source (`exports: ./src/index.ts`). Next.js transpiles
  them; the API and worker are bundled with **tsup** for production, so no per-package build step.
- **Vitest** for unit/integration tests, **ESLint 9 flat config** + typescript-eslint, **Prettier**.
- Resolved versions at scaffold time: Next 15, React 19, Fastify 5, Zod 4, Drizzle ORM 0.44,
  Tailwind CSS 4, Storybook 9, BullMQ 5, Serwist 9, Dexie 4.

## Consequences

- One `pnpm install`, one lockfile, one CI pipeline.
- Shared config lives at the root (`tsconfig.base.json`, `eslint.config.mjs`) instead of a
  separate `packages/config`; simpler for now, revisit if packages diverge.
- **Windows note:** if the checkout path is long, set `npm_config_virtual_store_dir` to a short
  path (e.g. `C:/wes-vs`) so native binaries (esbuild, SWC) can launch. See README.
