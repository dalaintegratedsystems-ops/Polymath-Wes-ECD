/**
 * Split a curated document into citeable chunks along its headings. Each chunk keeps an anchor
 * ("Section › Subsection") that users see as the citation. Long sections are split on paragraph
 * boundaries so a chunk stays small enough to quote. Source PDFs are converted to text with page
 * markers (`[page 12]`) before chunking; the anchor then includes the page.
 */
export interface Chunk {
  ordinal: number;
  heading: string | null;
  anchor: string;
  content: string;
  tokenCount: number;
}

const MAX_CHARS = 1800;

/** Rough token estimate (≈4 characters per token for English). */
export function estimateTokens(text: string): number {
  return Math.ceil(text.length / 4);
}

export function chunkMarkdown(title: string, markdown: string): Chunk[] {
  const lines = markdown.replace(/\r\n/g, '\n').split('\n');
  const sections: { path: string[]; body: string[] }[] = [];
  const path: string[] = [];
  let current: { path: string[]; body: string[] } = { path: [], body: [] };

  for (const line of lines) {
    const m = line.match(/^(#{1,4})\s+(.*)$/);
    if (m) {
      if (current.body.join('').trim()) sections.push(current);
      const depth = m[1]!.length;
      path.splice(depth - 1);
      path[depth - 1] = m[2]!.trim();
      current = { path: path.filter(Boolean).slice(1), body: [] };
    } else {
      current.body.push(line);
    }
  }
  if (current.body.join('').trim()) sections.push(current);

  const chunks: Chunk[] = [];
  for (const section of sections) {
    const paragraphs = section.body
      .join('\n')
      .split(/\n{2,}/)
      .map((p) => p.trim())
      .filter(Boolean);
    let buffer = '';
    const flush = () => {
      if (!buffer.trim()) return;
      const page = buffer.match(/\[page (\d+)\]/i)?.[1];
      const heading = section.path.at(-1) ?? null;
      const anchor = [section.path.join(' › ') || title, page ? `p. ${page}` : null]
        .filter(Boolean)
        .join(', ');
      const content = buffer.replace(/\[page \d+\]/gi, '').trim();
      chunks.push({
        ordinal: chunks.length,
        heading,
        anchor,
        content,
        tokenCount: estimateTokens(content),
      });
      buffer = '';
    };
    for (const p of paragraphs) {
      if (buffer && buffer.length + p.length + 2 > MAX_CHARS) flush();
      buffer = buffer ? `${buffer}\n\n${p}` : p;
    }
    flush();
  }
  return chunks;
}
