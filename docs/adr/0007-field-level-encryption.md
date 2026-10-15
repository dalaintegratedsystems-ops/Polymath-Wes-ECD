# ADR-0007: Field-level encryption for guardian contacts

- Status: Accepted (Milestone 0)
- Date: 2026-10-16

## Context

Guardian phone numbers are the most sensitive contact data we hold. Disk encryption protects
against stolen disks, not against a leaked database dump or an over-broad query.

## Decision

- Guardian phones are encrypted in the application with **AES-256-GCM** (random 96-bit IV, auth
  tag), stored as `v1:<base64(iv|tag|ciphertext)>` in `guardians.phone_ciphertext`.
- An **HMAC-SHA256 blind index** (`phone_blind_index`, separate key) lets us find a guardian by
  phone and enforce uniqueness per centre without decrypting.
- Keys: `FIELD_ENCRYPTION_KEY` and `BLIND_INDEX_KEY` (32 bytes each). In production the data key
  is wrapped by a Key Vault key and unwrapped at startup; never committed, never logged.
- The `v1:` prefix allows key rotation: new writes use the new version, a background job
  re-encrypts old rows.

## Consequences

- Phone numbers can't be searched by partial match (by design).
- Losing the key loses the data: Key Vault soft-delete and purge protection are required (M7).
