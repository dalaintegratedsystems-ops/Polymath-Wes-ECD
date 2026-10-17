# ADR-0012: Deployment architecture (simple, low overhead, secure)

- Status: Accepted — one-click template built (2026-10-18)
- Date: 2026-10-17, revised 2026-10-18

## Context

Pilot scale is tens of centres, growing to a few thousand. Children's data must stay in South
Africa (POPIA). The team is small: every managed service is something to secure, pay for and
operate. The owner asked for the simplest secure option and a one-click deployment.

## Decision

**Azure South Africa North, one resource group per environment, five core resources:**

| Concern       | Choice                                                                                                                                                                                                                     |
| ------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Compute       | Azure Container Apps (Consumption profile): **web** (public) and **api** (internal-only ingress). Staging scales to zero.                                                                                                  |
| Release       | An init container in the API runs `dist/release.js` before each revision: migrations, `wes_app`/`wes_worker` passwords, knowledge ingestion, optional demo data. The owner database credential is given only to this step. |
| Database      | PostgreSQL 16 Flexible Server (Burstable), pgvector, VNet-integrated, **no public endpoint**, TLS, automatic backups.                                                                                                      |
| Secrets       | Key Vault (RBAC). Container Apps reference secrets by URI through a user-assigned managed identity. Secrets are generated on first deployment and never re-written unless asked.                                           |
| Files         | Private Blob Storage, shared-key access disabled (identity only).                                                                                                                                                          |
| Observability | Log Analytics + Application Insights.                                                                                                                                                                                      |
| Delivery      | GitHub Actions builds images to GHCR on every push; optional OIDC-federated roll-out to staging. Infrastructure in Bicep (`infra/`), compiled to `infra/azuredeploy.json` for the Deploy-to-Azure button.                  |

Background jobs will run inside the API process with a Postgres-backed queue (no Redis) when
they are needed (Milestone 3); the separate worker app is not deployed until volume justifies it.

### Environments

- **staging**: a private pilot. PINs go to the server log until WhatsApp/SMS (M6); Wes may run
  offline and with local embeddings.
- **production**: refuses to start without real PIN delivery and model/embedding keys; warm
  replicas, purge protection, 35-day backups.

## Security baseline

Application: RLS per centre (ADR-0003), OTP + rotating refresh tokens (ADR-0004), httpOnly
session cookies (ADR-0011), field encryption (ADR-0007), append-only audit log, CSP/helmet,
rate limits, idempotency, redaction before model calls, secret and dependency scanning.

Platform: API not internet-facing; database private; managed identities; HTTPS only; secrets
only in Key Vault; least-privilege role assignments; logs redacted.

## Deliberately not now

AKS, service mesh, microservices, Redis, multi-region, Front Door + WAF (add when traffic or
attack patterns justify it), SIEM, HSM-backed keys, Key Vault private endpoint.

## Alternatives considered

- **AWS af-south-1**: ECS Fargate + RDS + S3 + Secrets Manager is equivalent; nothing in the code
  is cloud-specific. Only `infra/` would change.
- **AWS Amplify**: hosts the Next.js app but not the long-running API, worker, Postgres RLS or
  pgvector without a rewrite; rejected.
- **Single VPS with Docker Compose**: cheapest, but OS patching, firewalling and backups become
  our job; not recommended for children's data without a dedicated operator.
- **Vercel / Supabase**: data processed or stored outside South Africa; rejected.
