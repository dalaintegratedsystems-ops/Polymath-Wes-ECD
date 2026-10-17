import { createHash } from 'node:crypto';

/**
 * Embeddings behind one interface (ADR-0006). Production uses Voyage AI; development, tests and
 * CI use a deterministic hashed bag-of-words embedding so retrieval works offline. Hybrid search
 * (full-text + vector) means the local embedding is a helper, not the only signal.
 */
export interface EmbeddingProvider {
  readonly name: string;
  readonly dimensions: number;
  embed(texts: string[], kind: 'document' | 'query'): Promise<number[][]>;
}

export const EMBEDDING_DIMENSIONS = 1024;

function normalise(v: number[]): number[] {
  const norm = Math.sqrt(v.reduce((a, x) => a + x * x, 0)) || 1;
  return v.map((x) => x / norm);
}

/** Feature hashing over word unigrams and bigrams. Not semantic, but stable and free. */
export function createHashEmbeddingProvider(dimensions = EMBEDDING_DIMENSIONS): EmbeddingProvider {
  return {
    name: 'hash',
    dimensions,
    async embed(texts) {
      return texts.map((text) => {
        const v = new Array<number>(dimensions).fill(0);
        const words = text.toLowerCase().match(/[\p{L}\p{N}]+/gu) ?? [];
        const features = [...words, ...words.slice(1).map((w, i) => `${words[i]}_${w}`)];
        for (const f of features) {
          const h = createHash('md5').update(f).digest();
          const idx = h.readUInt32LE(0) % dimensions;
          v[idx]! += h[4]! & 1 ? 1 : -1;
        }
        return normalise(v);
      });
    },
  };
}

/** Voyage AI embeddings (https://docs.voyageai.com). Only redacted or public text is sent. */
export function createVoyageEmbeddingProvider(opts: {
  apiKey: string;
  model?: string;
  dimensions?: number;
}): EmbeddingProvider {
  const model = opts.model ?? 'voyage-multilingual-2';
  const dimensions = opts.dimensions ?? EMBEDDING_DIMENSIONS;
  return {
    name: `voyage:${model}`,
    dimensions,
    async embed(texts, kind) {
      const res = await fetch('https://api.voyageai.com/v1/embeddings', {
        method: 'POST',
        headers: { 'content-type': 'application/json', authorization: `Bearer ${opts.apiKey}` },
        body: JSON.stringify({ input: texts, model, input_type: kind }),
      });
      if (!res.ok) throw new Error(`Voyage embeddings failed: ${res.status}`);
      const json = (await res.json()) as { data: { embedding: number[]; index: number }[] };
      return json.data.sort((a, b) => a.index - b.index).map((d) => d.embedding);
    },
  };
}

export function createEmbeddingProvider(
  env: Record<string, string | undefined> = process.env,
): EmbeddingProvider {
  const key =
    env.VOYAGE_API_KEY && !env.VOYAGE_API_KEY.startsWith('<<') ? env.VOYAGE_API_KEY : undefined;
  if (env.EMBEDDING_PROVIDER === 'voyage' && key) {
    return createVoyageEmbeddingProvider({
      apiKey: key,
      model: env.EMBEDDING_MODEL,
      dimensions: env.EMBEDDING_DIMENSIONS ? Number(env.EMBEDDING_DIMENSIONS) : undefined,
    });
  }
  if ((env.APP_ENV ?? env.NODE_ENV) === 'production') {
    throw new Error('Production requires EMBEDDING_PROVIDER=voyage and VOYAGE_API_KEY (ADR-0006).');
  }
  return createHashEmbeddingProvider();
}
