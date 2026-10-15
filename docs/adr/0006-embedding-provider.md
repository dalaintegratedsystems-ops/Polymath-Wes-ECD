# ADR-0006: Embedding provider

- Status: Proposed — default assumed, needs confirmation (Milestone 0 decision #4)
- Date: 2026-10-16

## Context

Grounded answers need vector search over the curated corpus. Anthropic does not offer an
embeddings model, so we need another provider. Queries may be in English, Afrikaans, isiXhosa or
isiZulu.

## Decision (default)

- An `EmbeddingProvider` interface in `packages/agent`, chosen by `EMBEDDING_PROVIDER`.
- Default: **Voyage AI `voyage-multilingual-2`** (1024 dimensions), the provider Anthropic
  recommends for use with Claude.
- What is sent: corpus chunks (public documents) at ingestion, and **already-redacted** user
  queries at question time. No direct identifiers leave the server.
- Vector column fixed at 1024 dimensions with an HNSW cosine index (`knowledge_chunks.embedding`).

## Alternatives

- **Self-hosted `bge-m3`** (open weights, strong multilingual) on Azure in South Africa North:
  full data residency and no per-call cost, but GPU/CPU hosting and ops effort. Recommended if
  POPIA review or cost requires it. Needs a re-embed and a column dimension change.
- Azure OpenAI embeddings: not chosen to avoid a second LLM vendor.

## Consequences

Changing provider means re-embedding the corpus (cheap at our size) and possibly a migration for
the vector dimension. isiXhosa/isiZulu retrieval quality must be checked with evals.
