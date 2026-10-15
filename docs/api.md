# API

- Base path: `/v1`. Machine-readable spec: `GET /v1/openapi.json` (OpenAPI 3.1), also committed
  as [`openapi.json`](openapi.json) (`pnpm --filter @wes/api openapi` regenerates it).
- All clients (PWA, WhatsApp, future funder dashboard, partners) use the same API.

## Conventions

| Topic       | Rule                                                                                                                                                                           |
| ----------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Auth        | `Authorization: Bearer <JWT>` (10-minute access token; refresh rotation). Milestone 1.                                                                                         |
| Validation  | Every input and output has a Zod schema; invalid input returns `422 validation_failed` with field paths.                                                                       |
| Errors      | Always `{ "error": { "code", "message", "requestId", "details?" } }`.                                                                                                          |
| Idempotency | Writes require `Idempotency-Key` (8–128 chars). Retries replay the first response (`idempotent-replay: true`); reuse with a different body returns `409 idempotency_conflict`. |
| Request IDs | `x-request-id` on every response; pass your own to correlate logs.                                                                                                             |
| Rate limits | Per client per minute; `429 rate_limited`.                                                                                                                                     |
| Child data  | Every read and write is written to the audit log.                                                                                                                              |

## Available now (Milestone 0)

```bash
curl -s localhost:4000/healthz
curl -s localhost:4000/v1/meta
curl -s localhost:4000/v1/openapi.json | head -c 400
curl -s -i localhost:4000/v1/behaviour/coach   # 501: reserved for phase 2
```

## Roadmap

| Milestone | Endpoints                                                                                                                                                                                  |
| --------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| 1         | `POST /v1/auth/otp`, `/auth/token`, `/auth/refresh`; `GET\|PATCH /v1/centres/{id}`; `GET /v1/centres/{id}/staff`; `GET\|POST /v1/centres/{id}/children`; `POST /v1/children/{id}/consents` |
| 2         | `POST /v1/assistant/messages` (SSE), `POST /v1/assistant/feedback`                                                                                                                         |
| 3         | `GET /v1/compliance/checklist`, `POST /v1/compliance/audit`, `/documents`, `/pack`; `POST /v1/policies/generate`, `GET /v1/policies/{id}.pdf`                                              |
| 4         | `POST /v1/plans/weekly`, `/activities/adapt`, `/printables`                                                                                                                                |
| 5         | `POST /v1/centres/{id}/attendance`, `GET /v1/attendance/export?month=YYYY-MM`                                                                                                              |
| 6         | `POST /v1/channels/whatsapp/webhook`, `/channels/sms/webhook`                                                                                                                              |
