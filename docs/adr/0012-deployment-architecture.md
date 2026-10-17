# ADR-0012: Deployment architecture (right-sized)

- Status: Proposed (recommended 2026-10-17; built in Milestone 7)
- Date: 2026-10-17

## Context

Pilot scale is tens of centres, growing to a few thousand. Children's data must stay in South
Africa (POPIA). The team is small, so every managed service is something to secure, pay for and
operate. We want strong security where it matters without platform sprawl.

## Decision

**Azure South Africa North, one region, two environments (staging, production).**

| Concern       | Choice                                                                                                                                                                                                                          |
| ------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Compute       | Azure Container Apps: one environment, three apps (web, api, worker). Built-in ingress with managed TLS and a custom domain. Staging scales to zero.                                                                            |
| Database      | Azure Database for PostgreSQL Flexible Server (Burstable tier to start), pgvector, VNet-integrated with **no public endpoint**, automated backups + point-in-time restore. Zone-redundant HA when production load justifies it. |
| Files         | Blob Storage, private containers, short-lived SAS links, lifecycle rules.                                                                                                                                                       |
| Secrets       | Key Vault referenced by Container Apps through **managed identities**. No secrets in images, CI or env files.                                                                                                                   |
| Observability | Application Insights + Log Analytics with the same redaction rules as the API logger; budget alerts.                                                                                                                            |
| Delivery      | GitHub Actions → Azure Container Registry. GitHub OIDC federation to Azure (no long-lived credentials). Merge to `main` deploys staging; a tagged release deploys production after manual approval.                             |
| IaC           | Bicep modules under `infra/`.                                                                                                                                                                                                   |

**Recommended simplification (pending decision):** run background jobs on a Postgres-backed
queue (e.g. pg-boss) instead of Redis + BullMQ. It removes a managed service and a secret at
this scale; revisit if job volume grows.

## Security baseline at deployment

Already in the application: RLS per centre (ADR-0003), OTP + rotating refresh tokens
(ADR-0004), httpOnly session cookies (ADR-0011), field encryption (ADR-0007), append-only audit
log, CSP/helmet, rate limits, idempotency, redaction before model calls, secret and dependency
scanning in CI.

Added at deployment: private database networking; managed identities; HTTPS-only + HSTS;
database roles `wes_owner` / `wes_app` / `wes_worker` with credentials in Key Vault (or Entra ID
auth); backups with a documented restore drill; Microsoft Defender for Cloud free-tier
recommendations; nonce-based CSP; WhatsApp webhook signature verification (M6); JWT secret
rotation runbook.

## Deliberately not now

AKS/Kubernetes, service mesh, microservices, multi-region active-active, Front Door + WAF
(add when traffic or attack patterns justify it), SIEM, HSM-backed keys. Each adds cost and
operational load without addressing a current risk.

## Alternatives considered

- **AWS af-south-1 (Cape Town)** with ECS Fargate + RDS + S3 + Secrets Manager: equivalent; choose
  if Dala's credits or skills favour AWS. Nothing in the code is cloud-specific.
- **Azure App Service**: also viable; Container Apps chosen for the worker and scale-to-zero.
- **Vercel / Supabase / similar**: rejected — data would be processed or stored outside South Africa.
