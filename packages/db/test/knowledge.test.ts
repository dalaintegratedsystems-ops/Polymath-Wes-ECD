import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { ANONYMOUS, withRequestContext } from '../src/client';
import {
  searchKnowledge,
  storeKnowledgeSource,
  toOrQuery,
  type SourceToStore,
} from '../src/knowledge';
import { createTestDb, type TestDb } from '../src/testing';

let t: TestDb;

/** A one-hot-ish vector so similarity is easy to reason about in tests. */
const vec = (i: number) => Array.from({ length: 1024 }, (_, j) => (j === i ? 1 : 0));

const source = (over: Partial<SourceToStore> = {}): SourceToStore => ({
  slug: 'fixture-guide',
  title: 'TEST FIXTURE — not official content',
  publisher: 'Test',
  kind: 'guidance',
  url: null,
  corpusVersion: '2026.10.0',
  contentSha256: 'a'.repeat(64),
  isPlaceholder: false,
  chunks: [
    {
      ordinal: 0,
      heading: 'Documents',
      citation: 'Documents',
      content: 'Keep your policies and staff records in one file.',
      tokenCount: 12,
      embedding: vec(1),
    },
    {
      ordinal: 1,
      heading: 'Water play',
      citation: 'Water play',
      content: 'Use bottles and basins for pouring games.',
      tokenCount: 10,
      embedding: vec(2),
    },
  ],
  ...over,
});

beforeAll(async () => {
  t = await createTestDb();
});
afterAll(async () => t?.close());

describe('knowledge store and hybrid search', () => {
  it('builds OR queries from meaningful words only', () => {
    expect(toOrQuery('What documents do I need for registration?')).toBe(
      'documents | registration',
    );
    expect(toOrQuery('?? !!')).toBeNull();
  });

  it('inserts once and skips unchanged content', async () => {
    expect(await storeKnowledgeSource(t.db, source())).toBe('inserted');
    expect(await storeKnowledgeSource(t.db, source())).toBe('unchanged');
  });

  it('finds chunks by words, as the API role under RLS', async () => {
    const hits = await withRequestContext(t.appDb, ANONYMOUS, (tx) =>
      searchKnowledge(tx, { query: 'Which documents and records?' }),
    );
    expect(hits[0]).toMatchObject({ sourceSlug: 'fixture-guide', anchor: 'Documents' });
  });

  it('finds chunks by vector similarity too', async () => {
    const hits = await withRequestContext(t.appDb, ANONYMOUS, (tx) =>
      searchKnowledge(tx, { query: 'zzz', embedding: vec(2) }),
    );
    expect(hits.map((h) => h.anchor)).toEqual(['Water play']);
  });

  it('searches only the newest version of each source', async () => {
    await storeKnowledgeSource(
      t.db,
      source({
        corpusVersion: '2026.11.0',
        contentSha256: 'b'.repeat(64),
        chunks: [
          {
            ordinal: 0,
            heading: 'Documents',
            citation: 'Documents (v2)',
            content: 'Documents now go in a blue file.',
            tokenCount: 8,
            embedding: vec(1),
          },
        ],
      }),
    );
    const hits = await withRequestContext(t.appDb, ANONYMOUS, (tx) =>
      searchKnowledge(tx, { query: 'documents' }),
    );
    expect(hits.map((h) => h.anchor)).toEqual(['Documents (v2)']);
  });

  it('never returns placeholder sources', async () => {
    await storeKnowledgeSource(
      t.db,
      source({
        slug: 'placeholder-x',
        isPlaceholder: true,
        contentSha256: 'c'.repeat(64),
        chunks: [
          {
            ordinal: 0,
            heading: 'Zebra',
            citation: 'Zebra',
            content: 'zebra crossing placeholder',
            tokenCount: 3,
            embedding: null,
          },
        ],
      }),
    );
    const hits = await withRequestContext(t.appDb, ANONYMOUS, (tx) =>
      searchKnowledge(tx, { query: 'zebra' }),
    );
    expect(hits).toEqual([]);
  });

  it('keeps knowledge read-only for the API role', async () => {
    await expect(
      withRequestContext(t.appDb, ANONYMOUS, (tx) =>
        storeKnowledgeSource(tx as never, source({ slug: 'nope', contentSha256: 'd'.repeat(64) })),
      ),
    ).rejects.toThrow();
  });
});
