import { AppError } from '@wes/shared';

/**
 * Profile photos and logos. The phone resizes before upload; the server trusts nothing it is
 * told: the type comes from the bytes, and metadata (EXIF, GPS, XMP, comments) is removed so a
 * photo can never reveal where a centre or practitioner is. No native image library needed.
 */
export type ImageMime = 'image/jpeg' | 'image/png' | 'image/webp';

export const MAX_IMAGE_BYTES = 512 * 1024;

export function sniffImage(buf: Buffer): ImageMime | null {
  if (buf.length > 3 && buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) return 'image/jpeg';
  if (buf.length > 8 && buf.subarray(0, 8).equals(PNG_SIGNATURE)) return 'image/png';
  if (
    buf.length > 12 &&
    buf.toString('ascii', 0, 4) === 'RIFF' &&
    buf.toString('ascii', 8, 12) === 'WEBP'
  ) {
    return 'image/webp';
  }
  return null;
}

const PNG_SIGNATURE = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

function invalid(): never {
  throw new AppError(
    'validation_failed',
    'That file is not a photo we can use. Try a JPEG or PNG.',
  );
}

/** JPEG: keep APP0 (JFIF) and APP14 (Adobe colour), drop every other APPn and comments. */
function stripJpeg(buf: Buffer): Buffer {
  const out: Buffer[] = [buf.subarray(0, 2)];
  let i = 2;
  while (i + 4 <= buf.length) {
    if (buf[i] !== 0xff) invalid();
    const marker = buf[i + 1]!;
    if (marker === 0xda) {
      out.push(buf.subarray(i)); // start of scan: image data to the end
      return Buffer.concat(out);
    }
    const len = buf.readUInt16BE(i + 2);
    if (len < 2 || i + 2 + len > buf.length) invalid();
    const isApp = marker >= 0xe0 && marker <= 0xef;
    const keep = !(isApp && marker !== 0xe0 && marker !== 0xee) && marker !== 0xfe;
    if (keep) out.push(buf.subarray(i, i + 2 + len));
    i += 2 + len;
  }
  invalid();
}

const PNG_DROP = new Set(['eXIf', 'tEXt', 'zTXt', 'iTXt', 'tIME']);

function stripPng(buf: Buffer): Buffer {
  const out: Buffer[] = [PNG_SIGNATURE];
  let i = 8;
  while (i + 12 <= buf.length) {
    const len = buf.readUInt32BE(i);
    const type = buf.toString('ascii', i + 4, i + 8);
    const end = i + 12 + len;
    if (end > buf.length) invalid();
    if (!PNG_DROP.has(type)) out.push(buf.subarray(i, end));
    i = end;
    if (type === 'IEND') return Buffer.concat(out);
  }
  invalid();
}

function stripWebp(buf: Buffer): Buffer {
  const chunks: Buffer[] = [];
  let i = 12;
  while (i + 8 <= buf.length) {
    const type = buf.toString('ascii', i, i + 4);
    const len = buf.readUInt32LE(i + 4);
    const end = i + 8 + len + (len % 2);
    if (i + 8 + len > buf.length) invalid();
    if (type !== 'EXIF' && type !== 'XMP ') {
      const chunk = Buffer.from(buf.subarray(i, Math.min(end, buf.length)));
      // VP8X flags: clear the "has EXIF" (bit 3) and "has XMP" (bit 2) flags.
      if (type === 'VP8X') chunk[8] = chunk[8]! & ~0b1100;
      chunks.push(chunk);
    }
    i = end;
  }
  const body = Buffer.concat(chunks);
  const header = Buffer.alloc(12);
  header.write('RIFF', 0, 'ascii');
  header.writeUInt32LE(body.length + 4, 4);
  header.write('WEBP', 8, 'ascii');
  return Buffer.concat([header, body]);
}

/** Validate an uploaded image and return it without metadata. */
export function cleanImage(buf: Buffer): { mime: ImageMime; bytes: Buffer } {
  if (buf.length === 0) invalid();
  if (buf.length > MAX_IMAGE_BYTES) {
    throw new AppError('validation_failed', 'That photo is too big. Use one under 512 KB.');
  }
  const mime = sniffImage(buf);
  if (!mime) invalid();
  const bytes =
    mime === 'image/jpeg' ? stripJpeg(buf) : mime === 'image/png' ? stripPng(buf) : stripWebp(buf);
  return { mime, bytes };
}
