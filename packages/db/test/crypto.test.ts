import { describe, expect, it } from 'vitest';
import { createFieldCrypto } from '../src/crypto';

describe('field crypto', () => {
  const crypto = createFieldCrypto();

  it('round-trips and never repeats ciphertext', () => {
    const a = crypto.encrypt('+27821234567');
    const b = crypto.encrypt('+27821234567');
    expect(a).not.toBe(b);
    expect(a.startsWith('v1:')).toBe(true);
    expect(crypto.decrypt(a)).toBe('+27821234567');
  });

  it('detects tampering', () => {
    const ct = crypto.encrypt('secret');
    const raw = Buffer.from(ct.slice(3), 'base64');
    raw[raw.length - 1] = (raw[raw.length - 1] ?? 0) ^ 0xff;
    expect(() => crypto.decrypt(`v1:${raw.toString('base64')}`)).toThrow();
  });

  it('produces a stable blind index', () => {
    expect(crypto.blindIndex('+27821234567')).toBe(crypto.blindIndex(' +27821234567 '));
    expect(crypto.blindIndex('+27821234567')).not.toBe(crypto.blindIndex('+27821234568'));
  });

  it('rejects keys of the wrong length', () => {
    expect(() => createFieldCrypto(Buffer.from('short').toString('base64'), 'x')).toThrow(
      /32 bytes/,
    );
    expect(() => createFieldCrypto('', '')).toThrow(/not set/);
  });
});
