# API

- Base path: `/v1`. Machine-readable spec: `GET /v1/openapi.json` (OpenAPI 3.1), also committed
  as [`openapi.json`](openapi.json) (`pnpm --filter @wes/api openapi` regenerates it).
- All clients (PWA, WhatsApp, future funder dashboard, partners) use the same API.

## Conventions

| Topic       | Rule                                                                                                                                                                                                                                                           |
| ----------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Auth        | `Authorization: Bearer <JWT>` (10-minute access token; refresh rotation).                                                                                                                                                                                      |
| Validation  | Every input and output has a Zod schema; invalid input returns `422 validation_failed` with field paths.                                                                                                                                                       |
| Errors      | Always `{ "error": { "code", "message", "requestId", "details?" } }`.                                                                                                                                                                                          |
| Idempotency | Writes require `Idempotency-Key` (8–128 chars). Retries replay the first response (`idempotent-replay: true`); reuse with a different body returns `409 idempotency_conflict`. The streaming assistant endpoint is the exception (each message is a new turn). |
| Request IDs | `x-request-id` on every response; pass your own to correlate logs.                                                                                                                                                                                             |
| Rate limits | Per client per minute; `429 rate_limited`. The assistant allows 20 messages a minute.                                                                                                                                                                          |
| Child data  | Every read and write is written to the audit log.                                                                                                                                                                                                              |

## Available now (Milestones 0–2)

| Endpoint                                 | Who                             | Notes                                                                                                                                            |
| ---------------------------------------- | ------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------ |
| `POST /v1/auth/otp`                      | anyone                          | Sends a 6-digit PIN; never reveals whether the number has an account. Newest PIN only; 5 attempts; 5-minute expiry; per-phone and per-IP limits. |
| `POST /v1/auth/token`                    | anyone                          | PIN → access JWT (10 min) + refresh token (30 days). Links the phone to any guardian records (parent membership).                                |
| `POST /v1/auth/refresh`                  | anyone with a refresh token     | Rotates. Reusing an old token revokes the whole session family.                                                                                  |
| `POST /v1/auth/logout`                   | anyone with a refresh token     | Revokes the session family.                                                                                                                      |
| `GET /v1/me`, `PATCH /v1/me`             | signed in                       | You and your centres; update name and language.                                                                                                  |
| `POST /v1/centres`                       | signed in                       | Onboarding: create a centre, become its principal.                                                                                               |
| `GET /v1/centres/{id}`                   | members                         | 404 for non-members (ids can't be probed).                                                                                                       |
| `PATCH /v1/centres/{id}`                 | principal                       |                                                                                                                                                  |
| `GET /v1/centres/{id}/staff`             | principal, practitioner         |                                                                                                                                                  |
| `GET /v1/centres/{id}/children`          | staff; parents see their own    | Includes intakes awaiting consent (staff). Audited.                                                                                              |
| `POST /v1/centres/{id}/children`         | staff                           | Creates an **intake**, not a child record. Guardian phone encrypted.                                                                             |
| `POST /v1/children/{id}/consents/otp`    | staff                           | Sends the guardian a consent PIN (masked number returned).                                                                                       |
| `POST /v1/children/{id}/consents`        | staff                           | Guardian PIN (or paper evidence, M3) → child record created.                                                                                     |
| `POST /v1/children/{id}/consents/revoke` | staff; the child's parent       | Deletes the child's records; keeps anonymous daily headcounts.                                                                                   |
| `POST /v1/assistant/messages`            | principal, practitioner, parent | Ask Wes. Server-sent events (below).                                                                                                             |
| `GET /v1/assistant/conversations/latest` | principal, practitioner, parent | Your latest conversation, names restored for display. Phone numbers and IDs stay masked.                                                         |
| `POST /v1/assistant/feedback`            | principal, practitioner, parent | `{ messageId, rating, reason?, comment? }` with rating `up` or `down`. Feeds the evals.                                                          |
| `GET /v1/meta`                           | anyone                          | Version, locales, feature flags, `assistantMode` (`live` or `offline`).                                                                          |

Routes under `/v1/children/{id}` and `/v1/assistant` take the centre in the `X-Centre-Id` header.

### Ask Wes: server-sent events

`POST /v1/assistant/messages` with `{ "text": "...", "conversationId": "<optional>" }` responds
with `text/event-stream`:

| Event     | Data                                 | Meaning                                                                                   |
| --------- | ------------------------------------ | ----------------------------------------------------------------------------------------- |
| `start`   | `{ conversationId }`                 | Keep this id to continue the conversation.                                                |
| `delta`   | `{ text }`                           | Append to the reply as it is written.                                                     |
| `replace` | `{ text }`                           | The safety gate or post-check changed the reply: show this text instead of what streamed. |
| `done`    | `{ messageId, citations[], safety }` | Final. `safety: true` is the fixed child-protection response.                             |
| `error`   | `{ message }`                        | Something failed; the message is safe to show.                                            |

The PWA calls this through its own `/api/assistant` route, so the access token never reaches the
browser (ADR-0011).

```bash
curl -s -X POST localhost:4000/v1/auth/otp -H 'content-type: application/json' -d '{"phone":"060 000 0001"}'
```

In development the PIN is printed in the API log (`OTP_DELIVERY=console`). Seeded demo users:
Nomsa (principal, `060 000 0001`), Thandi (practitioner, `060 000 0002`), Fatima (principal of a
second centre, `060 000 0003`), Ayanda (parent, `060 000 0005`), Lerato (funder, `060 000 0006`).

## Roadmap

| Milestone | Endpoints                                                                                                                                     |
| --------- | --------------------------------------------------------------------------------------------------------------------------------------------- |
| 3         | `GET /v1/compliance/checklist`, `POST /v1/compliance/audit`, `/documents`, `/pack`; `POST /v1/policies/generate`, `GET /v1/policies/{id}.pdf` |
| 4         | `POST /v1/plans/weekly`, `/activities/adapt`, `/printables`                                                                                   |
| 5         | `POST /v1/centres/{id}/attendance`, `GET /v1/attendance/export?month=YYYY-MM`                                                                 |
| 6         | `POST /v1/channels/whatsapp/webhook`, `/channels/sms/webhook`                                                                                 |
