# Knowledge base

Wes answers questions about the NCF, ELDAs and registration **only** from documents in this
folder (CLAUDE.md §2, principle 3: no source, no claim). Everything here is versioned,
chunked, embedded and cited.

> **Status: placeholder content only.** The real document set (`<<NCF_AND_DBE_DOCUMENT_SET>>`)
> has not been added yet. Until it is, Wes must say it cannot answer from an official source.

## Layout

```
knowledge/
  sources.yaml            # one entry per document: slug, title, publisher, kind, url, licence
  ncf/                    # National Curriculum Framework (birth to four) and ELDA descriptions
  registration/           # Registration norms, standards and official guidance
  templates/              # Centre policy templates we may adapt (with permission)
  placeholder/            # Clearly labelled stand-ins used in development and tests
```

## Adding a real document

1. Get the official file (PDF or Word) from the publisher. Check the licence allows reuse.
2. Put it in the right folder, named `<slug>.<ext>` (e.g. `ncf/ncf-birth-to-four.pdf`).
3. Add an entry to `sources.yaml`: `slug`, `title`, `publisher`, `kind`, `url`, `licence`,
   `published_on`.
4. Bump `corpus_version` at the top of `sources.yaml` (e.g. `2026.11.0`).
5. Run the ingestion job (Milestone 2): `pnpm --filter @wes/worker ingest`. It extracts text,
   splits it into chunks along headings, embeds each chunk and records page anchors for citations.
6. Run the evals. Registration and planning cases must still pass with the new corpus.

## Rules

- Never paraphrase official rules into this folder. Store the source document itself.
- Every chunk keeps a citation anchor (document, page, section) that users can see.
- Old corpus versions are kept so past answers can be traced to what Wes knew at the time.
- Anything not yet sourced is marked `TODO(content)` in code and UI.
