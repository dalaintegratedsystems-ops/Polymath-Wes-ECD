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

## Available now (Milestones 0 to 3)

| Endpoint                                                                 | Who                                                        | Notes                                                                                                                                                                                                          |
| ------------------------------------------------------------------------ | ---------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `POST /v1/auth/otp`                                                      | anyone                                                     | Sends a 6-digit PIN; never reveals whether the number has an account. Newest PIN only; 5 attempts; 5-minute expiry; per-phone and per-IP limits.                                                               |
| `POST /v1/auth/token`                                                    | anyone                                                     | PIN → access JWT (10 min) + refresh token (30 days). Links the phone to any guardian records (parent membership).                                                                                              |
| `POST /v1/auth/refresh`                                                  | anyone with a refresh token                                | Rotates. Reusing an old token revokes the whole session family.                                                                                                                                                |
| `POST /v1/auth/logout`                                                   | anyone with a refresh token                                | Revokes the session family.                                                                                                                                                                                    |
| `GET /v1/me`, `PATCH /v1/me`                                             | signed in                                                  | You and your centres; update name and language.                                                                                                                                                                |
| `POST /v1/centres`                                                       | signed in                                                  | Onboarding: create a centre, become its principal.                                                                                                                                                             |
| `GET /v1/centres/{id}`                                                   | members                                                    | 404 for non-members (ids can't be probed).                                                                                                                                                                     |
| `PATCH /v1/centres/{id}`                                                 | principal                                                  |                                                                                                                                                                                                                |
| `GET /v1/centres/{id}/staff`                                             | principal, practitioner                                    |                                                                                                                                                                                                                |
| `GET /v1/centres/{id}/children`                                          | staff; parents see their own                               | Includes intakes awaiting consent (staff). Audited.                                                                                                                                                            |
| `POST /v1/centres/{id}/children`                                         | staff                                                      | Creates an **intake**, not a child record. Guardian phone encrypted.                                                                                                                                           |
| `POST /v1/children/{id}/consents/otp`                                    | staff                                                      | Sends the guardian a consent PIN (masked number returned).                                                                                                                                                     |
| `POST /v1/children/{id}/consents`                                        | staff                                                      | Guardian PIN (or paper evidence, M3) → child record created.                                                                                                                                                   |
| `POST /v1/children/{id}/consents/revoke`                                 | staff; the child's parent                                  | Deletes the child's records; keeps anonymous daily headcounts.                                                                                                                                                 |
| `POST /v1/assistant/messages`                                            | principal, practitioner, parent                            | Ask Wes. Server-sent events (below).                                                                                                                                                                           |
| `GET /v1/assistant/conversations/latest`                                 | principal, practitioner, parent                            | Your latest conversation, names restored for display. Phone numbers and IDs stay masked.                                                                                                                       |
| `POST /v1/assistant/feedback`                                            | principal, practitioner, parent                            | `{ messageId, rating, reason?, comment? }` with rating `up` or `down`. Feeds the evals.                                                                                                                        |
| `POST /v1/auth/password`                                                 | anyone                                                     | Username and password (accounts made by an admin or principal). Same token pair as PIN sign-in. Unknown usernames and wrong passwords get the same answer; 5 failures lock the account for 15 minutes (`429`). |
| `POST /v1/auth/password/change`                                          | signed in                                                  | Required after a temporary password: until then every other route answers `403` with detail `password_change_required`. Min 10 characters, common passwords refused.                                           |
| `GET /v1/admin/users`                                                    | platform admin; principal (own centre)                     | People you can manage. Phones masked.                                                                                                                                                                          |
| `POST /v1/admin/users`                                                   | platform admin; principal (practitioners and parents only) | Add a person with a phone, a username, or both. A username returns a one-time `temporaryPassword`. Audited.                                                                                                    |
| `POST /v1/admin/users/{id}/reset-password`                               | as above                                                   | New temporary password; signs them out everywhere. Audited.                                                                                                                                                    |
| `PATCH /v1/admin/users/{id}/status`                                      | as above                                                   | `active` or `deactivated`. Deactivation takes effect on the next request. Audited.                                                                                                                             |
| `GET /v1/centres/{id}/dashboard?from&to`                                 | principal, practitioner                                    | Aggregates only: children, consent, Wes use and feedback, attendance, weekly series.                                                                                                                           |
| `GET /v1/admin/metrics?from&to&province&city&size&status&role`           | platform admin                                             | Growth, registration funnel, DAU/WAU/MAU, retention, Wes usage, cost, feedback, escalations. Never child rows.                                                                                                 |
| `GET /v1/admin/centres?…`, `GET /v1/admin/metrics/export.csv?…`          | platform admin                                             | Centre table with usage and cost; child counts under 5 shown as "fewer than 5". CSV neutralises spreadsheet formulas.                                                                                          |
| `PUT /v1/me/avatar`, `DELETE /v1/me/avatar`, `GET /v1/users/{id}/avatar` | signed in; colleagues can view                             | Raw JPEG, PNG or WebP body, max 512 KB. Type sniffed from bytes; EXIF, GPS and XMP removed. Never photos of children.                                                                                          |
| `PUT /v1/centres/{id}/logo`, `GET /v1/centres/{id}/logo`                 | principal sets; members view                               | As above.                                                                                                                                                                                                      |
| `GET /v1/meta`                                                           | anyone                                                     | Version, locales, feature flags, `assistantMode` (`live` or `offline`).                                                                                                                                        |

### Registration copilot (Milestone 3)

All take the centre in the `X-Centre-Id` header. Reads: staff of the centre. Writes: the principal.

| Endpoint                                                                                                         | Notes                                                                                                                     |
| ---------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------- |
| `GET /v1/compliance/checklist`                                                                                   | Items from the curated knowledge base; `isPlaceholder: true` until the DBE document set is loaded.                        |
| `POST /v1/compliance/audit`, `GET /v1/compliance/audit/latest`                                                   | `{ answers: { [code]: yes, no or unsure } }`, every item answered. Returns a score and gaps, most urgent first.           |
| `GET /v1/compliance/progress`                                                                                    | The six journey steps with done, current or todo, a percentage and the number of documents expired or due within 30 days. |
| `POST /v1/compliance/documents?type&expiresOn&issuedOn&itemCode`                                                 | Raw JPEG, PNG, WebP or PDF body, max 5 MB. Type checked from the bytes; photo metadata removed.                           |
| `GET /v1/compliance/documents`, `GET /v1/compliance/documents/{id}/file`, `DELETE /v1/compliance/documents/{id}` | Expiry flag per document: none, ok, soon, expired.                                                                        |
| `POST /v1/policies/generate`                                                                                     | `{ kind, answers }` for admissions, health, safety or child_protection. Always a draft.                                   |
| `GET /v1/policies`, `GET /v1/policies/{id}`, `PATCH /v1/policies/{id}`                                           | Editing an approved policy makes it a draft again.                                                                        |
| `POST /v1/policies/{id}/approve`                                                                                 | Principal only. Older approved versions are archived.                                                                     |
| `GET /v1/policies/{id}/pdf`                                                                                      | Low-ink A4 PDF; drafts are marked DRAFT.                                                                                  |
| `POST /v1/compliance/pack`                                                                                       | One PDF: centre details, self-audit, approved policies, documents. Marks the pack step done.                              |

Routes under `/v1/children/{id}` and `/v1/assistant` also take the centre in the `X-Centre-Id` header.

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

| Milestone | Endpoints                                                                     |
| --------- | ----------------------------------------------------------------------------- |
| 4         | `POST /v1/plans/weekly`, `/activities/adapt`, `/printables`                   |
| 5         | `POST /v1/centres/{id}/attendance`, `GET /v1/attendance/export?month=YYYY-MM` |
| 6         | `POST /v1/channels/whatsapp/webhook`, `/channels/sms/webhook`                 |
