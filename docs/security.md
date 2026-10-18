# Security review (Milestone 7)

Scope: the whole platform as of Milestone 6 (web app, API, database, agent, WhatsApp, Azure
infrastructure), reviewed against OWASP ASVS 4.0 level 2 and POPIA. This is an engineering
self-review, not an independent penetration test; one is recommended before production.

## Controls in place

| Area (ASVS)           | Control                                                                                                                                                                                                                                | Where                                                       |
| --------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------- |
| V1 Architecture       | Modular monolith; the API is private inside the Container Apps environment; only the web app is public                                                                                                                                 | ADR-0002, ADR-0012                                          |
| V2 Authentication     | WhatsApp PIN (HMAC-hashed, 5 attempts, newest only, 5 min) or username and password (scrypt, lockout after 5 failures for 15 min, forced change of temporary passwords, NIST-style policy)                                             | `apps/api/src/modules/auth`, `platform/passwords.ts`        |
| V3 Sessions           | 10-minute JWT access tokens; rotating refresh tokens with reuse detection (whole family revoked); httpOnly SameSite cookies, never readable by page scripts; deactivation takes effect on the next request                             | ADR-0004, ADR-0011, `platform/context.ts`                   |
| V4 Access control     | Role checks in the API and row-level security in Postgres per centre; the app role cannot read password hashes or phone numbers (column grants); cross-centre access returns 404                                                       | `packages/db/migrations`, `rls.test.ts`, `accounts.test.ts` |
| V5 Validation         | Zod on every input; strict update schemas (no mass assignment); file types sniffed from bytes; EXIF, GPS and XMP removed; CSV formula injection neutralised                                                                            | `platform/route.ts`, `platform/images.ts`                   |
| V6 Cryptography       | AES-256-GCM field encryption and HMAC blind index for guardian phones; secrets in Key Vault, read by managed identity                                                                                                                  | ADR-0007, `infra/`                                          |
| V7 Errors and logging | One error envelope, no internals leaked; logs redact tokens, PINs and phones; audit log for every child-data read and write, appendable but not readable by the app                                                                    | `platform/errors.ts`, `audit_log`                           |
| V8 Data protection    | Minimal child data (first name, birth month); consent before any child record; withdrawal deletes records; offline drafts on the phone hold child ids and marks only, no names; personal page caches cleared on the signed-out screens | `docs/privacy.md`                                           |
| V9 Communications     | TLS at the Container Apps ingress; HSTS on the web app; private Postgres and Blob endpoints                                                                                                                                            | `infra/`                                                    |
| V10 Malicious code    | Pinned lockfile; `pnpm audit` and gitleaks in CI; no native modules for passwords, images or PDFs                                                                                                                                      | `.github/workflows/ci.yml`                                  |
| V12 Files             | Uploads capped (512 KB images, 5 MB documents), stored privately, served only through authenticated routes                                                                                                                             | `modules/profile`, `modules/compliance`                     |
| V13 API               | Idempotency keys on writes, rate limits, OpenAPI contract tests for 401/422/403 on every route                                                                                                                                         | `test/contract.test.ts`                                     |
| V14 Configuration     | Production refuses to start with logged PINs, local storage or missing secrets; CSP, frame denial, COOP, nosniff                                                                                                                       | `apps/api/src/config.ts`, `apps/web/next.config.ts`         |
| AI safety             | Redaction before every model call; deterministic child-protection pre-check and fixed escalation text; no diagnosis; prompt canary; citations required; 62 golden evals gate CI at 100% safety                                         | `packages/agent`, ADR on evals                              |

## Findings fixed during the build

| Finding                                                                                | Severity | Fix                                                           |
| -------------------------------------------------------------------------------------- | -------- | ------------------------------------------------------------- |
| Users could set their own `is_platform_admin` flag through the self-update policy      | High     | Column-level grants (migration 0008)                          |
| The offline safety check missed disclosures phrased with "hits", "kicks" or "slaps"    | High     | Wider patterns plus reported-disclosure pattern; 4 new evals  |
| Production configuration sent PINs by SMS with no provider, so the API could not start | High     | Production uses WhatsApp; SMS refused until a provider exists |
| A refused or unparseable Claude answer crashed classification instead of falling back  | Medium   | Treated as no answer; deterministic fallback                  |
| Admissions and health policies could never be drafted (choice values were sanitised)   | Medium   | Choices matched exactly; free text cleaned                    |
| drizzle-orm identifier escaping and postcss advisories                                 | Medium   | Upgraded and pinned                                           |
| Service worker crashed in browsers without service-worker support                      | Low      | Feature-detected registration                                 |

## Residual risks and recommendations

- **CSP allows inline scripts** (`'unsafe-inline'`), which Next.js needs without nonces. Move to a
  nonce-based CSP when all pages render dynamically. Priority: medium.
- **Rate limits are per replica, in memory.** With several replicas an attacker gets a little
  more headroom; account lockout and PIN attempt limits are in the database and still hold.
- **Live integrations are untested against real services:** Claude (live mode), Voyage
  embeddings and the WhatsApp Cloud API are covered by contract tests with fakes only. Run a
  staging smoke test with real keys before go-live.
- **Safety patterns in Afrikaans, isiXhosa and isiZulu** need native-speaker review.
- **No independent penetration test yet.** Recommended before handling real children's data.
- **Retention periods** marked TODO in `docs/privacy.md` need a legal decision.
