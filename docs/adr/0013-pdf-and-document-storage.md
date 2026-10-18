# ADR-0013: PDFs with pdf-lib in the API; documents in Azure Blob via managed identity

- Status: Accepted (Milestone 3). Supersedes the rendering part of ADR-0008.
- Date: 2026-10-18

## Context

ADR-0008 planned HTML templates rendered by Playwright/Chromium in a separate worker. ADR-0012
then simplified deployment to two containers with no Redis and no worker app. A Chromium image
adds about 400 MB, slow cold starts and a large patching surface, for documents that are mostly
text (policies, packs) and simple shapes (printables in Milestone 4).

Registration documents (photos of certificates, letters) need durable, private storage. The
container disk is wiped on every restart.

## Decision

- PDFs are built with **pdf-lib** (pure JavaScript) inside the API request: standard fonts
  (Latin-1 covers English, Afrikaans, isiXhosa and isiZulu), black text, no fills, A4.
  `apps/api/src/platform/pdf.ts` holds a small layout engine (wrapping, page breaks, simple
  Markdown, images, appending uploaded PDFs). Files stay small for WhatsApp and 3G.
- A damaged upload never stops a pack: it is listed with a note instead of embedded.
- Documents go through a `BlobStore` interface: `memory` (tests), `filesystem` (local
  development), `azure` (deployed). The Azure driver calls the Blob REST API with a token from
  the Container Apps managed identity endpoint: no storage keys, no SDK. Staging and production
  refuse to start without `BLOB_DRIVER=azure`.
- Photos have EXIF, GPS and XMP removed and their type checked from the bytes; PDFs must start
  with `%PDF-`. Maximum 5 MB per document.

## Consequences

- No browser to ship or patch; packs build in well under a second for typical centres.
- Layout is simpler than HTML/CSS. If printables later need rich layout, a dedicated renderer
  can be added behind the same function without changing callers.
- Packs embed at most 20 MB of attachments; beyond that documents are listed only.
