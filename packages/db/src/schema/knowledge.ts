import { boolean, index, integer, jsonb, pgTable, text, uniqueIndex, uuid, vector } from 'drizzle-orm/pg-core';
import { id, timestamps } from './_columns';

/** Embedding width must match EMBEDDING_DIMENSIONS (voyage-multilingual-2 → 1024). ADR-0006. */
export const EMBEDDING_DIMENSIONS = 1024;

/** A curated source document (NCF, ELDA descriptions, registration norms, templates). */
export const knowledgeSources = pgTable(
  'knowledge_sources',
  {
    id: id(),
    slug: text('slug').notNull(),
    title: text('title').notNull(),
    publisher: text('publisher').notNull(),
    kind: text('kind', {
      enum: ['ncf', 'elda', 'registration_norms', 'guidance', 'policy_template', 'placeholder'],
    }).notNull(),
    url: text('url'),
    /** Corpus version this source was ingested under, e.g. "2026.10.0". */
    corpusVersion: text('corpus_version').notNull(),
    contentSha256: text('content_sha256').notNull(),
    isPlaceholder: boolean('is_placeholder').notNull().default(false),
    metadata: jsonb('metadata').notNull().default({}),
    ...timestamps(),
  },
  (t) => [uniqueIndex('knowledge_sources_slug_version_uq').on(t.slug, t.corpusVersion)],
);

export const knowledgeChunks = pgTable(
  'knowledge_chunks',
  {
    id: id(),
    sourceId: uuid('source_id')
      .notNull()
      .references(() => knowledgeSources.id, { onDelete: 'cascade' }),
    ordinal: integer('ordinal').notNull(),
    heading: text('heading'),
    content: text('content').notNull(),
    /** Citation anchor shown to users, e.g. "NCF p. 24, ELDA 3". */
    citation: text('citation').notNull(),
    tokenCount: integer('token_count').notNull(),
    embedding: vector('embedding', { dimensions: EMBEDDING_DIMENSIONS }),
    ...timestamps(),
  },
  (t) => [
    index('knowledge_chunks_source_idx').on(t.sourceId),
    index('knowledge_chunks_embedding_idx').using('hnsw', t.embedding.op('vector_cosine_ops')),
  ],
);
