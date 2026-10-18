# ADR-0014: WhatsApp channel

- Status: Accepted (Milestone 6)
- Date: 2026-10-18

## Context

Most practitioners work on a personal phone and many already live in WhatsApp (CLAUDE.md §2).
Wes must answer there with the same agent, data and safety rules as the app, within Meta's
rules: signed webhooks, quick acknowledgement, a 24-hour customer-service window, and approved
templates outside it. The API runs privately inside the Container Apps environment (ADR-0012).

## Decision

- **Adapter:** `WhatsAppCloudAdapter` (packages/channels) talks to the Meta Cloud API over plain
  HTTPS; a BSP can implement the same `ChannelAdapter` interface later.
- **Webhook path:** Meta calls the public web app at `/api/whatsapp/webhook`, which passes the
  request on byte for byte to the private API. The API verifies `X-Hub-Signature-256` with the
  app secret; unsigned or wrongly signed requests get 401. The API stays private.
- **Acknowledge first:** the API answers 200 at once and handles messages afterwards. Each
  message id is claimed once (`app.channel_claim_inbound`), so Meta's retries are ignored.
- **Identity:** the sender is the phone number in the signed payload, matched to an active
  account by a narrow definer function. Unknown numbers get only a pointer to the app.
- **Conversation:** a numbered menu (an interactive list when it fits) with role-aware options;
  free text goes to the same Wes pipeline as the app (redaction, safety gate, child-protection
  escalation, tools, post-check). Replies are split under 1,000 characters. The menu shown last
  is stored on the WhatsApp conversation, which resumes across sessions.
- **Files:** PDFs (the application pack) are uploaded as WhatsApp media and sent as documents,
  so no public file links exist.
- **PINs and reminders:** sign-in PINs use an approved Authentication template
  (`wes_sign_in_code`). Reminders (including document expiry, 30 days ahead) are claimed
  atomically every 15 minutes; inside the 24-hour window they are a normal message, outside it
  the approved `wes_reminder` template.
- **SMS** stays unavailable until a provider is chosen (`<<SMS_PROVIDER_CREDENTIALS>>`);
  production requires WhatsApp for PINs.

## Consequences

- One agent and one data model across channels; tests cover both with a mock Meta server.
- Template names must match what is approved in Meta Business Manager (env-configurable).
- Voice notes and images from WhatsApp are not handled yet (phase 2: voice-note observations).
