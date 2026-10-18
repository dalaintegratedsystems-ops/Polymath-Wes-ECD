import { PDFDocument, StandardFonts, rgb, type PDFFont, type PDFPage } from 'pdf-lib';

/**
 * Low-ink A4 PDFs with pdf-lib (pure JavaScript, no browser): black text on white, no
 * fills, standard fonts so files stay small for WhatsApp and 3G. See ADR-0013.
 */

const A4: [number, number] = [595.28, 841.89];
const MARGIN = 56;
const INK = rgb(0, 0, 0);
const GREY = rgb(0.35, 0.35, 0.35);

/** Standard PDF fonts cover Latin-1 (enough for English, Afrikaans, isiXhosa, isiZulu). */
export function pdfSafe(text: string): string {
  return text
    .replace(/[\u2018\u2019]/g, "'")
    .replace(/[\u201C\u201D]/g, '"')
    .replace(/[\u2013\u2014]/g, '-')
    .replace(/\u2026/g, '...')
    .replace(/[\u2022\u25CF]/g, '-')
    .replace(/[^\t\n\r\x20-\x7E\xA0-\xFF]/g, '?');
}

interface Fonts {
  regular: PDFFont;
  bold: PDFFont;
}

/** A tiny layout engine: flowing text with automatic page breaks. */
export class PdfWriter {
  private page!: PDFPage;
  private y = 0;
  private pageNumber = 0;

  private constructor(
    readonly doc: PDFDocument,
    private readonly fonts: Fonts,
    private readonly footer: string,
    private readonly watermark: string | null,
  ) {}

  static async create(opts: { title: string; footer: string; watermark?: string | null }) {
    const doc = await PDFDocument.create();
    doc.setTitle(pdfSafe(opts.title));
    doc.setCreator('Polymath Wes');
    doc.setProducer('Polymath Wes');
    const fonts = {
      regular: await doc.embedFont(StandardFonts.Helvetica),
      bold: await doc.embedFont(StandardFonts.HelveticaBold),
    };
    const w = new PdfWriter(doc, fonts, pdfSafe(opts.footer), opts.watermark ?? null);
    w.newPage();
    return w;
  }

  newPage(): void {
    this.page = this.doc.addPage(A4);
    this.pageNumber += 1;
    this.y = A4[1] - MARGIN;
    const { regular } = this.fonts;
    this.page.drawText(`${this.footer}  |  Page ${this.pageNumber}`, {
      x: MARGIN,
      y: MARGIN / 2,
      size: 8,
      font: regular,
      color: GREY,
    });
    if (this.watermark) {
      this.page.drawText(this.watermark, {
        x: A4[0] - MARGIN - this.fonts.bold.widthOfTextAtSize(this.watermark, 10),
        y: A4[1] - MARGIN / 2,
        size: 10,
        font: this.fonts.bold,
        color: GREY,
      });
    }
  }

  private ensure(height: number): void {
    if (this.y - height < MARGIN) this.newPage();
  }

  private wrap(text: string, font: PDFFont, size: number, width: number): string[] {
    const lines: string[] = [];
    for (const para of pdfSafe(text).split('\n')) {
      let line = '';
      for (const word of para.split(/\s+/).filter(Boolean)) {
        const next = line ? `${line} ${word}` : word;
        if (font.widthOfTextAtSize(next, size) <= width) {
          line = next;
        } else {
          if (line) lines.push(line);
          // Break very long words (e.g. URLs) so they never run off the page.
          let rest = word;
          while (font.widthOfTextAtSize(rest, size) > width) {
            let cut = rest.length;
            while (cut > 1 && font.widthOfTextAtSize(rest.slice(0, cut), size) > width) cut -= 1;
            lines.push(rest.slice(0, cut));
            rest = rest.slice(cut);
          }
          line = rest;
        }
      }
      lines.push(line);
    }
    return lines;
  }

  text(
    value: string,
    opts: {
      size?: number;
      bold?: boolean;
      indent?: number;
      gapAfter?: number;
      grey?: boolean;
    } = {},
  ): void {
    const size = opts.size ?? 11;
    const font = opts.bold ? this.fonts.bold : this.fonts.regular;
    const indent = opts.indent ?? 0;
    const lineHeight = size * 1.4;
    for (const line of this.wrap(value, font, size, A4[0] - MARGIN * 2 - indent)) {
      this.ensure(lineHeight);
      this.y -= lineHeight;
      this.page.drawText(line, {
        x: MARGIN + indent,
        y: this.y,
        size,
        font,
        color: opts.grey ? GREY : INK,
      });
    }
    this.y -= opts.gapAfter ?? 4;
  }

  heading(value: string, level: 1 | 2 | 3 = 2): void {
    const size = level === 1 ? 20 : level === 2 ? 14 : 12;
    this.ensure(size * 3);
    this.y -= level === 1 ? 0 : 8;
    this.text(value, { size, bold: true, gapAfter: level === 1 ? 10 : 6 });
  }

  rule(): void {
    this.ensure(12);
    this.y -= 6;
    this.page.drawLine({
      start: { x: MARGIN, y: this.y },
      end: { x: A4[0] - MARGIN, y: this.y },
      thickness: 0.5,
      color: GREY,
    });
    this.y -= 10;
  }

  /** Label and value rows, e.g. centre details on a cover page. */
  rows(items: [string, string][]): void {
    for (const [label, value] of items) {
      this.ensure(18);
      const top = this.y;
      this.text(label, { size: 10, bold: true, gapAfter: 0 });
      const after = this.y;
      this.y = top;
      this.text(value || 'Not given', { size: 10, indent: 160, gapAfter: 2 });
      this.y = Math.min(this.y, after) - 2;
    }
    this.y -= 6;
  }

  /** Render simple Markdown: #, ##, ### headings, "- " bullets, numbered lists, paragraphs. */
  markdown(md: string): void {
    for (const block of md.replace(/\r/g, '').split(/\n{2,}/)) {
      const lines = block.split('\n');
      for (const raw of lines) {
        const line = raw.trimEnd();
        if (!line.trim()) continue;
        const h = /^(#{1,3})\s+(.*)$/.exec(line);
        if (h) {
          this.heading(h[2]!.replace(/\*\*/g, ''), Math.min(3, h[1]!.length) as 1 | 2 | 3);
          continue;
        }
        const bullet = /^\s*[-*]\s+(.*)$/.exec(line);
        if (bullet) {
          this.text(`-  ${bullet[1]!.replace(/\*\*/g, '')}`, { indent: 12, gapAfter: 2 });
          continue;
        }
        const numbered = /^\s*(\d+)[.)]\s+(.*)$/.exec(line);
        if (numbered) {
          this.text(`${numbered[1]}.  ${numbered[2]!.replace(/\*\*/g, '')}`, {
            indent: 12,
            gapAfter: 2,
          });
          continue;
        }
        this.text(line.replace(/\*\*/g, ''), { gapAfter: 2 });
      }
      this.y -= 6;
    }
  }

  /** A full page with a scanned document photo, scaled to fit. */
  async imagePage(caption: string, bytes: Uint8Array, mime: 'image/jpeg' | 'image/png') {
    this.newPage();
    this.text(caption, { size: 12, bold: true, gapAfter: 8 });
    const image = await (
      mime === 'image/png' ? this.doc.embedPng(bytes) : this.doc.embedJpg(bytes)
    ).catch(() => null);
    if (!image) {
      // A damaged photo must not stop the whole pack from being made.
      this.text('This picture could not be added. Open it in the app to view it.', { grey: true });
      return false;
    }
    const maxW = A4[0] - MARGIN * 2;
    const maxH = this.y - MARGIN - 8;
    const scale = Math.min(maxW / image.width, maxH / image.height, 1);
    const w = image.width * scale;
    const h = image.height * scale;
    this.page.drawImage(image, { x: MARGIN + (maxW - w) / 2, y: this.y - h, width: w, height: h });
    this.y -= h;
    return true;
  }

  /** Append every page of an uploaded PDF document. Returns false if it cannot be read. */
  async appendPdf(bytes: Uint8Array): Promise<boolean> {
    try {
      const src = await PDFDocument.load(bytes, { ignoreEncryption: false });
      const pages = await this.doc.copyPages(src, src.getPageIndices());
      for (const p of pages) this.doc.addPage(p);
      return true;
    } catch {
      return false;
    }
  }

  async save(): Promise<Buffer> {
    return Buffer.from(await this.doc.save({ useObjectStreams: true }));
  }
}

/** One policy (or any Markdown document) as a PDF. */
export async function markdownPdf(opts: {
  title: string;
  subtitle: string;
  markdown: string;
  draft: boolean;
  footer: string;
}): Promise<Buffer> {
  const w = await PdfWriter.create({
    title: opts.title,
    footer: opts.footer,
    watermark: opts.draft ? 'DRAFT: not yet approved' : null,
  });
  w.heading(opts.title, 1);
  w.text(opts.subtitle, { size: 10, grey: true, gapAfter: 8 });
  w.rule();
  w.markdown(opts.markdown);
  return w.save();
}
