import { and, eq, sql } from 'drizzle-orm';
import type { Database, Transaction } from './client';
import * as schema from './schema';

/**
 * Knowledge storage and hybrid retrieval (ADR-0006).
 * Search combines Postgres full-text ranking with pgvector similarity using reciprocal rank
 * fusion, over the newest version of each non-placeholder source.
 */
export interface KnowledgeResult {
  chunkId: string;
  sourceSlug: string;
  title: string;
  anchor: string;
  content: string;
  corpusVersion: string;
  score: number;
}

type Executor = Database | Transaction;

function rowsOf<T>(result: unknown): T[] {
  if (Array.isArray(result)) return result as T[];
  return ((result as { rows?: T[] }).rows ?? []) as T[];
}

const STOP = new Set([
  'the',
  'and',
  'for',
  'are',
  'but',
  'not',
  'you',
  'all',
  'can',
  'her',
  'was',
  'one',
  'our',
  'out',
  'what',
  'how',
  'who',
  'why',
  'when',
  'where',
  'which',
  'with',
  'this',
  'that',
  'from',
  'have',
  'need',
  'does',
  'into',
  'about',
  'your',
  'there',
  'their',
  'they',
  'them',
  'will',
  'would',
  'should',
  'could',
  'some',
  'any',
  'tell',
  'please',
]);

/** OR-query of meaningful words, safe to pass to to_tsquery. */
export function toOrQuery(text: string): string | null {
  const words = (text.toLowerCase().match(/[\p{L}\p{N}]+/gu) ?? []).filter(
    (w) => w.length > 2 && !STOP.has(w),
  );
  const unique = [...new Set(words)].slice(0, 16);
  return unique.length ? unique.join(' | ') : null;
}

const vectorLiteral = (v: number[]) => `[${v.map((x) => Number(x.toFixed(6))).join(',')}]`;

export async function searchKnowledge(
  db: Executor,
  opts: { query: string; embedding?: number[]; limit?: number; minVectorSimilarity?: number },
): Promise<KnowledgeResult[]> {
  const limit = opts.limit ?? 5;
  const latest = sql`s.id IN (
    SELECT DISTINCT ON (slug) id FROM knowledge_sources ORDER BY slug, created_at DESC
  ) AND s.is_placeholder = false`;

  type Row = {
    chunk_id: string;
    slug: string;
    title: string;
    citation: string;
    content: string;
    corpus_version: string;
    score: number;
  };

  const q = toOrQuery(opts.query);
  const fts = q
    ? rowsOf<Row>(
        await db.execute(sql`
          SELECT c.id AS chunk_id, s.slug, s.title, c.citation, c.content, s.corpus_version,
                 ts_rank_cd(c.search, to_tsquery('simple', ${q})) AS score
          FROM knowledge_chunks c JOIN knowledge_sources s ON s.id = c.source_id
          WHERE ${latest} AND c.search @@ to_tsquery('simple', ${q})
          ORDER BY score DESC LIMIT 20`),
      )
    : [];

  const vec = opts.embedding
    ? rowsOf<Row>(
        await db.execute(sql`
          SELECT c.id AS chunk_id, s.slug, s.title, c.citation, c.content, s.corpus_version,
                 1 - (c.embedding <=> ${vectorLiteral(opts.embedding)}::vector) AS score
          FROM knowledge_chunks c JOIN knowledge_sources s ON s.id = c.source_id
          WHERE ${latest} AND c.embedding IS NOT NULL
          ORDER BY c.embedding <=> ${vectorLiteral(opts.embedding)}::vector LIMIT 20`),
      ).filter((r) => Number(r.score) >= (opts.minVectorSimilarity ?? 0.35))
    : [];

  // Reciprocal rank fusion (k = 60).
  const fused = new Map<string, { row: Row; score: number }>();
  for (const list of [fts, vec]) {
    list.forEach((row, i) => {
      const prev = fused.get(row.chunk_id);
      const add = 1 / (60 + i + 1);
      fused.set(row.chunk_id, { row, score: (prev?.score ?? 0) + add });
    });
  }
  return [...fused.values()]
    .sort((a, b) => b.score - a.score)
    .slice(0, limit)
    .map(({ row, score }) => ({
      chunkId: row.chunk_id,
      sourceSlug: row.slug,
      title: row.title,
      anchor: row.citation,
      content: row.content,
      corpusVersion: row.corpus_version,
      score,
    }));
}

export interface SourceToStore {
  slug: string;
  title: string;
  publisher: string;
  kind: 'ncf' | 'elda' | 'registration_norms' | 'guidance' | 'policy_template' | 'placeholder';
  url: string | null;
  corpusVersion: string;
  contentSha256: string;
  isPlaceholder: boolean;
  chunks: {
    ordinal: number;
    heading: string | null;
    citation: string;
    content: string;
    tokenCount: number;
    embedding: number[] | null;
  }[];
}

/**
 * Insert or refresh one source version. Unchanged content (same hash) is skipped, so ingestion
 * is cheap to re-run. Runs as the owner or worker role (the API can't write knowledge).
 */
export async function storeKnowledgeSource(
  db: Database,
  src: SourceToStore,
): Promise<'inserted' | 'updated' | 'unchanged'> {
  return db.transaction(async (tx) => {
    const [existing] = await tx
      .select({ id: schema.knowledgeSources.id, sha: schema.knowledgeSources.contentSha256 })
      .from(schema.knowledgeSources)
      .where(
        and(
          eq(schema.knowledgeSources.slug, src.slug),
          eq(schema.knowledgeSources.corpusVersion, src.corpusVersion),
        ),
      );
    if (existing && existing.sha === src.contentSha256) return 'unchanged';

    let sourceId: string;
    if (existing) {
      await tx
        .delete(schema.knowledgeChunks)
        .where(eq(schema.knowledgeChunks.sourceId, existing.id));
      await tx
        .update(schema.knowledgeSources)
        .set({
          title: src.title,
          publisher: src.publisher,
          kind: src.kind,
          url: src.url,
          contentSha256: src.contentSha256,
          isPlaceholder: src.isPlaceholder,
        })
        .where(eq(schema.knowledgeSources.id, existing.id));
      sourceId = existing.id;
    } else {
      const [row] = await tx
        .insert(schema.knowledgeSources)
        .values({
          slug: src.slug,
          title: src.title,
          publisher: src.publisher,
          kind: src.kind,
          url: src.url,
          corpusVersion: src.corpusVersion,
          contentSha256: src.contentSha256,
          isPlaceholder: src.isPlaceholder,
        })
        .returning({ id: schema.knowledgeSources.id });
      sourceId = row!.id;
    }
    if (src.chunks.length > 0) {
      await tx.insert(schema.knowledgeChunks).values(
        src.chunks.map((c) => ({
          sourceId,
          ordinal: c.ordinal,
          heading: c.heading,
          citation: c.citation,
          content: c.content,
          tokenCount: c.tokenCount,
          embedding: c.embedding,
        })),
      );
    }
    return existing ? 'updated' : 'inserted';
  });
}
