import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { parse } from 'yaml';
import { z } from 'zod';
import { chunkMarkdown, type Chunk } from './chunk';
import type { EmbeddingProvider } from './embeddings';

/**
 * Ingest the curated corpus in `knowledge/` (see knowledge/README.md): read sources.yaml, chunk
 * each document, embed the chunks, and hand them to `store` (the database writer). Text and
 * Markdown are supported now; PDFs are converted to text with [page N] markers first.
 */
const SourceSchema = z.object({
  slug: z.string().regex(/^[a-z0-9-]+$/),
  title: z.string(),
  publisher: z.string(),
  kind: z.enum(['ncf', 'elda', 'registration_norms', 'guidance', 'policy_template', 'placeholder']),
  path: z.string(),
  url: z.string().nullable().optional(),
  licence: z.string().optional(),
});

const CorpusSchema = z.object({
  corpus_version: z.string(),
  sources: z.array(SourceSchema),
});

export interface StoredSource {
  slug: string;
  title: string;
  publisher: string;
  kind: z.infer<typeof SourceSchema>['kind'];
  url: string | null;
  corpusVersion: string;
  contentSha256: string;
  isPlaceholder: boolean;
  chunks: (Chunk & { citation: string; embedding: number[] })[];
}

export interface IngestReport {
  corpusVersion: string;
  results: { slug: string; chunks: number; outcome: string }[];
}

export async function ingestCorpus(opts: {
  dir: string;
  embedder: EmbeddingProvider;
  store: (source: StoredSource) => Promise<string>;
}): Promise<IngestReport> {
  const corpus = CorpusSchema.parse(parse(await readFile(join(opts.dir, 'sources.yaml'), 'utf8')));
  const results: IngestReport['results'] = [];

  for (const s of corpus.sources) {
    if (!/\.(md|txt)$/i.test(s.path)) {
      results.push({ slug: s.slug, chunks: 0, outcome: 'skipped: convert to text/markdown first' });
      continue;
    }
    const text = await readFile(join(opts.dir, s.path), 'utf8');
    const chunks = chunkMarkdown(s.title, text);
    const embeddings = chunks.length
      ? await opts.embedder.embed(
          chunks.map((c) => `${c.anchor}\n${c.content}`),
          'document',
        )
      : [];
    const outcome = await opts.store({
      slug: s.slug,
      title: s.title,
      publisher: s.publisher,
      kind: s.kind,
      url: s.url ?? null,
      corpusVersion: corpus.corpus_version,
      contentSha256: createHash('sha256').update(text).digest('hex'),
      isPlaceholder: s.kind === 'placeholder',
      chunks: chunks.map((c, i) => ({ ...c, citation: c.anchor, embedding: embeddings[i]! })),
    });
    results.push({ slug: s.slug, chunks: chunks.length, outcome });
  }
  return { corpusVersion: corpus.corpus_version, results };
}
