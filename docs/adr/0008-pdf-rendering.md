# ADR-0008: PDF rendering with Playwright in the worker

- Status: Accepted (Milestone 0), built in Milestones 3–4
- Date: 2026-10-16

## Context

We produce policies, application packs, printables and attendance exports as A4 PDFs. They
must be low-ink, black-and-white-safe, multilingual (including isiXhosa and isiZulu characters)
and consistent with our design system.

## Decision

- Templates are HTML + CSS (print stylesheets), rendered by **Playwright/Chromium** in the worker
  (`pdf.render` job), never in the API request path.
- Fonts are bundled in the worker image; no network fetches during rendering.
- Output goes to blob storage; the API returns a short-lived signed URL. WhatsApp receives the
  PDF as a document message.

## Consequences

The worker image is larger (Chromium). Rendering is asynchronous, so the UI shows progress and
notifies when a PDF is ready.
