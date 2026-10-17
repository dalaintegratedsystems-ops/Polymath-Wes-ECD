import { randomInt, scrypt, timingSafeEqual, randomBytes } from 'node:crypto';
import { AppError, PASSWORD_MIN_LENGTH } from '@wes/shared';

/**
 * Password hashing with scrypt from Node's standard library (OWASP-recommended parameters:
 * N=2^15, r=8, p=3, about 32 MB per hash). Built in, so no native module to ship or patch.
 * Format: `scrypt$N$r$p$salt$hash` (base64), so parameters can be raised later.
 */
const N = 2 ** 15;
const R = 8;
const P = 3;
const KEY_LEN = 32;
const MAX_MEM = 64 * 1024 * 1024;

function derive(password: string, salt: Buffer, n: number, r: number, p: number): Promise<Buffer> {
  return new Promise((resolve, reject) =>
    scrypt(
      password.normalize('NFKC'),
      salt,
      KEY_LEN,
      { N: n, r, p, maxmem: MAX_MEM },
      (err, key) => (err ? reject(err) : resolve(key)),
    ),
  );
}

export async function hashPassword(password: string): Promise<string> {
  const salt = randomBytes(16);
  const key = await derive(password, salt, N, R, P);
  return ['scrypt', N, R, P, salt.toString('base64'), key.toString('base64')].join('$');
}

export async function verifyPassword(password: string, stored: string): Promise<boolean> {
  const [alg, n, r, p, salt, hash] = stored.split('$');
  if (alg !== 'scrypt' || !salt || !hash) return false;
  const expected = Buffer.from(hash, 'base64');
  const key = await derive(password, Buffer.from(salt, 'base64'), Number(n), Number(r), Number(p));
  return key.length === expected.length && timingSafeEqual(key, expected);
}

/** A hash to verify against when the username does not exist, so timing reveals nothing. */
let dummyHash: Promise<string> | null = null;
export function dummyPasswordHash(): Promise<string> {
  dummyHash ??= hashPassword(randomBytes(12).toString('hex'));
  return dummyHash;
}

// Easy-to-read words for temporary passwords that are read aloud or written down.
const WORDS = [
  'baobab',
  'protea',
  'fynbos',
  'karoo',
  'impala',
  'kudu',
  'zebra',
  'rooibos',
  'marula',
  'umbrella',
  'sunbird',
  'weaver',
  'hornbill',
  'gecko',
  'tortoise',
  'meerkat',
  'springbok',
  'eland',
  'aloe',
  'lantern',
  'pebble',
  'river',
  'mountain',
  'garden',
  'kettle',
  'drum',
  'basket',
  'blanket',
  'crayon',
  'puzzle',
  'story',
  'rainbow',
  'thunder',
  'sunrise',
  'harvest',
  'mango',
  'guava',
  'pumpkin',
  'spinach',
  'biscuit',
  'teapot',
  'bicycle',
  'canoe',
  'harbour',
  'meadow',
  'compass',
];

/** Four words and two digits, e.g. "kudu-mango-river-drum-42": long, memorable, typed once. */
export function temporaryPassword(): string {
  const words = Array.from({ length: 4 }, () => WORDS[randomInt(WORDS.length)]);
  return `${words.join('-')}-${randomInt(10, 100)}`;
}

// The most common passwords seen in breaches that also meet the length rule.
const COMMON = new Set([
  '1234567890',
  '0123456789',
  '12345678910',
  '1111111111',
  '0000000000',
  'qwertyuiop',
  'password123',
  'password1234',
  'iloveyou123',
  'qwerty1234',
  'qwerty123456',
  'abcdefghij',
  'abc1234567',
  'passwordpassword',
  'letmein123',
  'welcome123',
  'welcome1234',
  'football123',
  'princess123',
  'sunshine123',
  'monkey12345',
  'dragon12345',
  'baseball123',
  'superman123',
  'asdfghjkl1',
  'zxcvbnm123',
  '1q2w3e4r5t',
  'q1w2e3r4t5',
  '1qaz2wsx3edc',
  'administrator',
  'changeme123',
  'trustno1234',
  'mypassword',
  'mypassword1',
  'password12',
  'password!1',
  'southafrica',
  'southafrica1',
  'capetown123',
  'johannesburg',
  'mzansi12345',
  'springboks',
  'springbok123',
  'bafanabafana',
  'kaizerchiefs',
  'orlandopirates',
  'jesus12345',
  'blessed123',
]);

/** Policy from NIST SP 800-63B: length, no common passwords, nothing built from the username. */
export function assertAcceptablePassword(password: string, username?: string | null): void {
  const fail = (message: string) => {
    throw new AppError('validation_failed', message, [{ path: 'body.newPassword', message }]);
  };
  if (password.length < PASSWORD_MIN_LENGTH) {
    fail(`Use at least ${PASSWORD_MIN_LENGTH} characters`);
  }
  const lower = password.toLowerCase();
  if (COMMON.has(lower) || /^(.)\1+$/.test(password)) {
    fail('That password is too easy to guess. Try a short sentence you will remember.');
  }
  if (username && lower.includes(username.toLowerCase())) {
    fail('Do not use your username in your password.');
  }
}
