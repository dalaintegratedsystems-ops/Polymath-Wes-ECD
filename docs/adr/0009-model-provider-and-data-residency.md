# ADR-0009: Model provider and data residency

- Status: Proposed — needs a decision before production
- Date: 2026-10-16

## Context

Claude models are not hosted in South Africa. Sending personal information outside South Africa
is a cross-border transfer under POPIA section 72.

## Decision (current)

- Every model call is preceded by **redaction**: child and guardian names, phone numbers and
  other contact details are replaced with tokens; the token vault never leaves our servers.
- Model IDs come from environment variables (`WES_MODEL_*`), and the Anthropic client is created
  in one place, so switching provider endpoint is a configuration change.
- Two options to decide between before production:
  1. **Anthropic API directly.** Simplest; latest models first.
  2. **Claude on Microsoft Foundry (Azure).** Consolidated Azure billing and governance. Region
     availability for our models must be checked; it may not remove the cross-border transfer.
- Either way: zero data retention terms where available, and a documented section 72 basis in
  `docs/privacy.md`.

## Consequences

Redaction quality is safety-critical and gets its own eval category (Milestone 2).
