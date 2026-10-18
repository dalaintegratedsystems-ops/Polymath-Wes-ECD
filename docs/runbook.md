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

## Operations (Azure)

### Health and monitoring

- Liveness and readiness: `GET /healthz` on the API (probes in `infra/modules/apps.bicep`).
- Logs and traces: Application Insights and Log Analytics in the resource group. Useful
  searches: `whatsapp message failed`, `assistant turn failed`, `reminders failed`,
  `unhandled error`.
- Wes cost and quality: the platform console (`/admin`) shows questions, model cost, errors,
  escalations and feedback reasons.
- Suggested alerts (set in Azure Monitor): API 5xx above 1% for 5 minutes; API restarts; Postgres
  CPU above 80% for 15 minutes; storage above 80%.

### Backups and restore

- PostgreSQL Flexible Server takes automatic backups (7 days by default; raise to 35 for
  production in the portal). Restore creates a new server: Portal → server → Restore, pick a
  time, then point the `database-url` and `database-owner-url` Key Vault secrets at it and
  restart the API revision.
- Blob storage holds registration documents; turn on soft delete (14 days) for production.
- Test a restore into a scratch resource group every quarter.

### Rotating secrets

1. Put the new value in Key Vault (same secret name). Container Apps read the latest version.
2. Restart the API (and web for web secrets): Portal → Container App → Revisions → Restart.
3. `jwt-signing-secret`: everyone signs in again. `otp-pepper`: open PINs stop working.
   `field-encryption-key` and `blind-index-key` must **not** be rotated without re-encrypting
   guardian phones (a migration task, not a restart).
4. WhatsApp access token: generate a new system user token in Meta, update
   `whatsapp-access-token`, restart.

### Scaling

- The API scales on concurrent requests (`apps.bicep`, up to 5 replicas in production).
  Reminders are claimed atomically, so several replicas are safe.
- Upgrade Postgres from B-series to General Purpose when CPU stays high.

### Security incident or data breach

1. Contain: revoke sessions (rotate `jwt-signing-secret`), switch off affected accounts in
   `/people`, rotate any exposed secret.
2. Preserve evidence: export the relevant `audit_log` rows and Application Insights logs.
3. POPIA: the responsible party must notify the Information Regulator and affected people
   (section 22). TODO(legal): confirm Dala's Information Officer process and templates.
4. Child-safety concern in Wes conversations: escalations are logged as events only (no
   narrative); follow the centre's designated-person process.
5. Write a short post-incident review in `docs/incidents/`.

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
