import { describe, expect, it } from 'vitest';
import { cleanImage, sniffImage } from '../src/platform/images';
import {
  assertAcceptablePassword,
  hashPassword,
  temporaryPassword,
  verifyPassword,
} from '../src/platform/passwords';

describe('passwords', () => {
  it('hashes with a fresh salt and verifies only the right password', async () => {
    const a = await hashPassword('the swing under the tree');
    const b = await hashPassword('the swing under the tree');
    expect(a).not.toBe(b);
    expect(a.startsWith('scrypt$32768$8$3$')).toBe(true);
    expect(await verifyPassword('the swing under the tree', a)).toBe(true);
    expect(await verifyPassword('the swing under the trees', a)).toBe(false);
    expect(await verifyPassword('anything', 'bcrypt$garbage')).toBe(false);
  });

  it('makes temporary passwords that pass its own policy', () => {
    for (let i = 0; i < 20; i++) {
      const p = temporaryPassword();
      expect(() => assertAcceptablePassword(p, 'sipho.m')).not.toThrow();
    }
  });

  it('refuses short, common, repeated and username-based passwords', () => {
    expect(() => assertAcceptablePassword('short')).toThrow(/at least 10/);
    expect(() => assertAcceptablePassword('Password123')).toThrow(/too easy/);
    expect(() => assertAcceptablePassword('aaaaaaaaaaaa')).toThrow(/too easy/);
    expect(() => assertAcceptablePassword('xsipho.m2026x', 'Sipho.M')).toThrow(/username/);
  });
});

function pngChunk(type: string, data: Buffer) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length);
  return Buffer.concat([len, Buffer.from(type, 'ascii'), data, Buffer.alloc(4)]);
}

function webpChunk(type: string, data: Buffer) {
  const len = Buffer.alloc(4);
  len.writeUInt32LE(data.length);
  return Buffer.concat([
    Buffer.from(type, 'ascii'),
    len,
    data,
    data.length % 2 ? Buffer.alloc(1) : Buffer.alloc(0),
  ]);
}

describe('images', () => {
  it('strips text and EXIF chunks from PNG', () => {
    const png = Buffer.concat([
      Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
      pngChunk('IHDR', Buffer.alloc(13)),
      pngChunk('tEXt', Buffer.from('Location\0Khayelitsha')),
      pngChunk('eXIf', Buffer.from('GPS-TEST')),
      pngChunk('IDAT', Buffer.from([1, 2, 3])),
      pngChunk('IEND', Buffer.alloc(0)),
    ]);
    const { mime, bytes } = cleanImage(png);
    expect(mime).toBe('image/png');
    expect(bytes.includes(Buffer.from('Khayelitsha'))).toBe(false);
    expect(bytes.includes(Buffer.from('GPS-TEST'))).toBe(false);
    expect(bytes.includes(Buffer.from('IDAT'))).toBe(true);
  });

  it('strips EXIF and XMP from WebP and fixes the header', () => {
    const vp8x = Buffer.alloc(10);
    vp8x[0] = 0b1100; // has EXIF + XMP
    const body = Buffer.concat([
      webpChunk('VP8X', vp8x),
      webpChunk('VP8 ', Buffer.from([9, 9, 9, 9])),
      webpChunk('EXIF', Buffer.from('GPS-TEST')),
      webpChunk('XMP ', Buffer.from('<x/>')),
    ]);
    const header = Buffer.alloc(12);
    header.write('RIFF', 0, 'ascii');
    header.writeUInt32LE(body.length + 4, 4);
    header.write('WEBP', 8, 'ascii');
    const { bytes } = cleanImage(Buffer.concat([header, body]));
    expect(sniffImage(bytes)).toBe('image/webp');
    expect(bytes.includes(Buffer.from('GPS-TEST'))).toBe(false);
    expect(bytes.readUInt32LE(4)).toBe(bytes.length - 8);
    expect(bytes[20]! & 0b1100).toBe(0);
  });

  it('rejects truncated and oversized files', () => {
    expect(() => cleanImage(Buffer.from([0xff, 0xd8, 0xff, 0xe1, 0xff, 0xff]))).toThrow();
    expect(() => cleanImage(Buffer.alloc(600 * 1024, 0xff))).toThrow(/too big/);
    expect(() => cleanImage(Buffer.alloc(0))).toThrow();
  });
});
