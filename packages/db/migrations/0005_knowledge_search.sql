-- Full-text search alongside pgvector for hybrid retrieval (ADR-0006). 'simple' configuration:
-- no English stemming, so Afrikaans, isiXhosa and isiZulu text is indexed as written.
ALTER TABLE knowledge_chunks
  ADD COLUMN search tsvector GENERATED ALWAYS AS (
    to_tsvector('simple', coalesce(heading, '') || ' ' || content)
  ) STORED;
--> statement-breakpoint
CREATE INDEX knowledge_chunks_search_idx ON knowledge_chunks USING gin (search);
