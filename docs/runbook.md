# Runbook

Milestone 0 covers local operations. Production procedures (deploys, rollbacks, backups,
incident response, breach notification) arrive in Milestone 7.

## Local services

| Service       | URL                   | Notes                                                                   |
| ------------- | --------------------- | ----------------------------------------------------------------------- |
| Web (PWA)     | http://localhost:3000 | `pnpm --filter @wes/web dev`. Service worker only in production builds. |
| API           | http://localhost:4000 | `pnpm --filter @wes/api dev`                                            |
| Storybook     | http://localhost:6006 | `pnpm storybook`                                                        |
| Postgres      | localhost:5432        | `docker compose up -d postgres`                                         |
| Redis         | localhost:6379        |                                                                         |
| MinIO console | http://localhost:9001 | user `wes` / `wes_minio_dev`                                            |
| Mailpit       | http://localhost:8025 |                                                                         |

## Development without Docker

`pnpm dev` starts the API and the web app. With no `DATABASE_URL`, the API creates an embedded
Postgres in `apps/api/.data/pglite`, runs migrations and seeds demo data. Sign-in PINs and
consent PINs are printed in the API log. Delete `apps/api/.data` to start fresh.

## End-to-end tests

```bash
pnpm build
```

```bash
pnpm --filter @wes/web e2e
```

Playwright starts the built API (fresh embedded database on ports 4100) and the production web
build (3100), and reads PINs from a temporary outbox file.

## Common tasks

```bash
docker compose up -d
pnpm db:migrate
pnpm db:seed
```

Reset the local database (deletes all local data):

```bash
docker compose down -v
```

Regenerate the migration after editing `packages/db/src/schema`:

```bash
pnpm db:generate
```

Regenerate design tokens after editing `packages/ui/src/tokens.ts`:

```bash
pnpm --filter @wes/ui tokens
```

## WhatsApp webhook

- Callback URL in Meta: `https://<web address>/api/whatsapp/webhook`; verify token: the
  `whatsappVerifyToken` deployment parameter. Subscribe the app to `messages`.
- No replies? Check the API log for `whatsapp message failed` (usually an expired access
  token or a template name that is not approved) and Meta’s webhook delivery log.
- 401 from the webhook means the signature did not match: check `whatsappAppSecret`.
- Locally, `pnpm --filter @wes/web e2e` runs a mock Meta server on port 4200.

## Troubleshooting

- **`spawnSync ... esbuild.exe ENOENT` on Windows during install:** the path to `node_modules` is
  too long for Windows to launch executables. Use a shorter checkout path, or set
  `npm_config_virtual_store_dir=C:/wes-vs` before `pnpm install`.
- **RLS test fails after adding a table:** add policies for the new table in a migration.
- **`tokens.css is in sync` test fails:** run `pnpm --filter @wes/ui tokens`.
