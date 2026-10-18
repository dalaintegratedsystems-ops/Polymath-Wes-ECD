import { PDFDocument, StandardFonts, rgb, type PDFFont, type PDFPage } from 'pdf-lib';
import type { PrintableRequest } from '@wes/shared';
import { pdfSafe } from '../../platform/pdf';

/**
 * Low-ink A4 printables: outlines and light grey only, no filled areas, so a centre can print
 * a class set on a cheap printer or photocopy them in black and white.
 */

const A4: [number, number] = [595.28, 841.89];
const M = 40;
const INK = rgb(0, 0, 0);
const LIGHT = rgb(0.72, 0.72, 0.72);
const GUIDE = rgb(0.6, 0.6, 0.6);

interface Fonts {
  regular: PDFFont;
  bold: PDFFont;
}

function header(page: PDFPage, fonts: Fonts, title: string, subtitle: string) {
  page.drawText(pdfSafe(title), {
    x: M,
    y: A4[1] - M - 14,
    size: 18,
    font: fonts.bold,
    color: INK,
  });
  page.drawText(pdfSafe(subtitle), {
    x: M,
    y: A4[1] - M - 32,
    size: 10,
    font: fonts.regular,
    color: GUIDE,
  });
  page.drawText('Name: ______________________', {
    x: A4[0] - M - 190,
    y: A4[1] - M - 14,
    size: 11,
    font: fonts.regular,
    color: INK,
  });
}

function footer(page: PDFPage, fonts: Fonts, centreName: string) {
  page.drawText(pdfSafe(`${centreName}  |  Made with Polymath Wes`), {
    x: M,
    y: M / 2,
    size: 8,
    font: fonts.regular,
    color: GUIDE,
  });
}

/** Largest font size (up to max) at which the text fits the width. */
function fit(font: PDFFont, text: string, width: number, max: number) {
  let size = max;
  while (size > 10 && font.widthOfTextAtSize(text, size) > width) size -= 2;
  return size;
}

function flashcards(doc: PDFDocument, fonts: Fonts, req: PrintableRequest, centre: string) {
  const cols = 2;
  const rows = 3;
  const w = (A4[0] - M * 2) / cols;
  const h = (A4[1] - M * 2 - 30) / rows;
  for (let i = 0; i < req.words.length; i += cols * rows) {
    const page = doc.addPage(A4);
    page.drawText(pdfSafe(`${req.title}: cut along the dashed lines`), {
      x: M,
      y: A4[1] - M - 10,
      size: 10,
      font: fonts.regular,
      color: GUIDE,
    });
    req.words.slice(i, i + cols * rows).forEach((raw, j) => {
      const word = pdfSafe(raw);
      const x = M + (j % cols) * w;
      const y = A4[1] - M - 30 - (Math.floor(j / cols) + 1) * h;
      page.drawRectangle({
        x,
        y,
        width: w,
        height: h,
        borderColor: GUIDE,
        borderWidth: 0.8,
        borderDashArray: [6, 4],
      });
      const letter = word.charAt(0).toUpperCase() + word.charAt(0).toLowerCase();
      page.drawText(letter, {
        x: x + 14,
        y: y + h - 44,
        size: 28,
        font: fonts.regular,
        color: GUIDE,
      });
      const size = fit(fonts.bold, word, w - 30, 54);
      page.drawText(word, {
        x: x + (w - fonts.bold.widthOfTextAtSize(word, size)) / 2,
        y: y + h / 2 - size / 3,
        size,
        font: fonts.bold,
        color: INK,
      });
    });
    footer(page, fonts, centre);
  }
}

function tracing(doc: PDFDocument, fonts: Fonts, req: PrintableRequest, centre: string) {
  const perPage = 5;
  for (let i = 0; i < req.words.length; i += perPage) {
    const page = doc.addPage(A4);
    header(page, fonts, req.title, 'Trace the light letters with a crayon, from left to right.');
    req.words.slice(i, i + perPage).forEach((raw, j) => {
      const word = pdfSafe(raw.toLowerCase());
      const base = A4[1] - M - 120 - j * 135;
      const size = fit(fonts.regular, `${word}   ${word}`, A4[0] - M * 2 - 20, 64);
      // Writing lines: top, dashed middle, baseline.
      for (const [dy, dash] of [
        [size * 0.72, false],
        [size * 0.36, true],
        [0, false],
      ] as const) {
        page.drawLine({
          start: { x: M, y: base + dy },
          end: { x: A4[0] - M, y: base + dy },
          thickness: 0.6,
          color: GUIDE,
          ...(dash ? { dashArray: [4, 4] } : {}),
        });
      }
      page.drawText(`${word}   ${word}`, {
        x: M + 10,
        y: base,
        size,
        font: fonts.regular,
        color: LIGHT,
      });
      // An empty row underneath to write on their own.
      page.drawLine({
        start: { x: M, y: base - 40 },
        end: { x: A4[0] - M, y: base - 40 },
        thickness: 0.6,
        color: GUIDE,
      });
    });
    footer(page, fonts, centre);
  }
}

function counting(doc: PDFDocument, fonts: Fonts, req: PrintableRequest, centre: string) {
  const page = doc.addPage(A4);
  header(page, fonts, req.title, 'Count the circles. Write the number in the box.');
  const rows = req.upTo;
  const rowH = Math.min(70, (A4[1] - M * 2 - 90) / rows);
  // Shuffle-free but not in order, so children count rather than recite.
  const order = Array.from({ length: rows }, (_, i) => ((i * 3) % rows) + 1);
  order.forEach((n, i) => {
    const y = A4[1] - M - 90 - i * rowH;
    const r = Math.min(14, rowH / 3);
    for (let k = 0; k < n; k++) {
      page.drawCircle({
        x: M + 20 + k * (r * 2 + 12),
        y: y - rowH / 2 + r,
        size: r,
        borderColor: INK,
        borderWidth: 1.2,
      });
    }
    page.drawRectangle({
      x: A4[0] - M - 60,
      y: y - rowH / 2 - 8,
      width: 50,
      height: 40,
      borderColor: INK,
      borderWidth: 1,
    });
  });
  footer(page, fonts, centre);
}

export async function renderPrintable(req: PrintableRequest, centreName: string): Promise<Buffer> {
  const doc = await PDFDocument.create();
  doc.setTitle(pdfSafe(req.title));
  doc.setCreator('Polymath Wes');
  const fonts = {
    regular: await doc.embedFont(StandardFonts.Helvetica),
    bold: await doc.embedFont(StandardFonts.HelveticaBold),
  };
  if (req.kind === 'flashcards') flashcards(doc, fonts, req, centreName);
  else if (req.kind === 'tracing') tracing(doc, fonts, req, centreName);
  else counting(doc, fonts, req, centreName);
  return Buffer.from(await doc.save({ useObjectStreams: true }));
}
