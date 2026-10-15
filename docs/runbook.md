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

## Troubleshooting

- **`spawnSync ... esbuild.exe ENOENT` on Windows during install:** the path to `node_modules` is
  too long for Windows to launch executables. Use a shorter checkout path, or set
  `npm_config_virtual_store_dir=C:/wes-vs` before `pnpm install`.
- **RLS test fails after adding a table:** add policies for the new table in a migration.
- **`tokens.css is in sync` test fails:** run `pnpm --filter @wes/ui tokens`.
