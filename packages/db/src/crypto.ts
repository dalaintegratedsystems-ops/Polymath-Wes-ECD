import { createCipheriv, createDecipheriv, createHmac, randomBytes } from 'node:crypto';

/**
 * Field-level encryption for guardian contact details (ADR-0007).
 * AES-256-GCM with a random 96-bit IV. Format: "v1:" + base64(iv | tag | ciphertext).
 * In production the data key is unwrapped from Azure Key Vault at startup; locally it
 * comes from FIELD_ENCRYPTION_KEY. The blind index lets us look rows up by phone
 * without decrypting them.
 */
export interface FieldCrypto {
  encrypt(plaintext: string): string;
  decrypt(ciphertext: string): string;
  blindIndex(value: string): string;
}

function decodeKey(name: string, base64: string | undefined): Buffer {
  if (!base64) throw new Error(`${name} is not set`);
  const key = Buffer.from(base64, 'base64');
  if (key.length !== 32) throw new Error(`${name} must be 32 bytes (base64), got ${key.length}`);
  return key;
}

export function createFieldCrypto(
  encryptionKeyB64: string | undefined = process.env.FIELD_ENCRYPTION_KEY,
  blindIndexKeyB64: string | undefined = process.env.BLIND_INDEX_KEY,
): FieldCrypto {
  const encKey = decodeKey('FIELD_ENCRYPTION_KEY', encryptionKeyB64);
  const idxKey = decodeKey('BLIND_INDEX_KEY', blindIndexKeyB64);

  return {
    encrypt(plaintext) {
      const iv = randomBytes(12);
      const cipher = createCipheriv('aes-256-gcm', encKey, iv);
      const ct = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
      const tag = cipher.getAuthTag();
      return `v1:${Buffer.concat([iv, tag, ct]).toString('base64')}`;
    },
    decrypt(value) {
      if (!value.startsWith('v1:')) throw new Error('Unknown ciphertext version');
      const raw = Buffer.from(value.slice(3), 'base64');
      const iv = raw.subarray(0, 12);
      const tag = raw.subarray(12, 28);
      const ct = raw.subarray(28);
      const decipher = createDecipheriv('aes-256-gcm', encKey, iv);
      decipher.setAuthTag(tag);
      return Buffer.concat([decipher.update(ct), decipher.final()]).toString('utf8');
    },
    blindIndex(value) {
      return createHmac('sha256', idxKey).update(value.trim().toLowerCase()).digest('base64url');
    },
  };
}
