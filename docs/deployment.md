# Deploying Wes to Azure

One click (or one command) creates everything in a new resource group in **South Africa North**.
Design and reasoning: [ADR-0012](adr/0012-deployment-architecture.md).

## What gets created

| Resource                             | Purpose                                                               | Security                                                                          |
| ------------------------------------ | --------------------------------------------------------------------- | --------------------------------------------------------------------------------- |
| Container App **web**                | The PWA                                                               | Public, HTTPS only, managed certificate                                           |
| Container App **api**                | The API, plus a release step that runs before each new version        | **Internal only**: not reachable from the internet                                |
| PostgreSQL 16 Flexible Server        | All data, with pgvector                                               | **Private network only**, TLS, automatic backups (7 days staging, 35 production)  |
| Key Vault                            | Every secret (database URLs, signing keys, encryption keys, API keys) | RBAC; read by the apps' managed identity; nothing secret in images, CI or outputs |
| Storage account                      | Documents and PDFs (from Milestone 3)                                 | Private, no shared keys, TLS 1.2+                                                 |
| Log Analytics + Application Insights | Logs and telemetry                                                    | Application logs are redacted by the API                                          |
| Virtual network + private DNS        | Keeps the database private                                            | —                                                                                 |
| Managed identity                     | Lets the apps read Key Vault and write blobs                          | Least privilege                                                                   |

Secrets are generated during the first deployment (database passwords, JWT key, OTP pepper,
32-byte field-encryption and blind-index keys). Nobody sees them unless they open Key Vault.

## Before you start

1. An Azure subscription where you can create resource groups and **assign roles**
   (Owner, or Contributor + User Access Administrator).
2. The container images. GitHub Actions builds them on every push to `main`
   (`.github/workflows/deploy.yml`) and publishes them to
   `ghcr.io/dalaintegratedsystems-ops/polymath-wes-web` and `…-api`.
   - If the GitHub packages are **private**, create a GitHub token with `read:packages` and
     pass your GitHub username and that token as the registry username and password.
3. Optional keys: an **Anthropic API key** (otherwise Wes runs in offline mode, staging only)
   and a **Voyage AI key** (otherwise local embeddings, staging only).

## Option A: Deploy to Azure button

[![Deploy to Azure](https://aka.ms/deploytoazurebutton)](https://portal.azure.com/#create/Microsoft.Template/uri/https%3A%2F%2Fraw.githubusercontent.com%2Fdalaintegratedsystems-ops%2FPolymath-Wes-ECD%2Fmain%2Finfra%2Fazuredeploy.json)

The portal fetches `infra/azuredeploy.json` from GitHub, so **this button only works while the
repository is public**. For a private repository use option B (same template, one command).

In the form: create a new resource group, keep the region **South Africa North**, choose
**staging**, and paste the optional keys. Leave the generated seed fields alone. Deployment
takes about 15 to 20 minutes (the database is the slow part). The **webUrl** output is the app.

## Option B: one command

With the [Azure CLI](https://learn.microsoft.com/cli/azure/install-azure-cli) and `az login`:

```bash
./infra/deploy.sh wes-staging
```

On Windows:

```powershell
./infra/deploy.ps1 -ResourceGroup wes-staging
```

Add keys with `ANTHROPIC_API_KEY=… VOYAGE_API_KEY=… ./infra/deploy.sh wes-staging`, or
`REGISTRY_USERNAME` / `REGISTRY_PASSWORD` for private images.

## After the first deployment

- **Sign in (staging):** WhatsApp and SMS delivery arrive in Milestone 6. Until then, staging
  writes sign-in PINs to the API log. Find them in the portal: Container App _api_ → Log
  stream, or Log Analytics. This is why staging must stay a private pilot.
- **Demo data:** staging loads the fictional demo centres on first start (turn off with
  `loadDemoData=false`). Demo principal: `060 000 0001`.
- **Automatic updates:** set repository variables `AZURE_RESOURCE_GROUP`, `AZURE_CLIENT_ID`,
  `AZURE_TENANT_ID`, `AZURE_SUBSCRIPTION_ID` (an Entra app with a federated credential for
  this repo and Contributor on the group). Every push to `main` then rolls staging to the new
  images. No Azure secret is stored in GitHub.
- **Custom domain:** Container App _web_ → Custom domains → add your domain; Azure issues the
  certificate.

## Re-deploying the template

Only needed to change infrastructure (images update automatically). **Always set
`isFirstDeployment=false`** (or `REDEPLOY=true ./infra/deploy.sh …`), otherwise new secrets are
generated, and a new field-encryption key would make stored guardian phone numbers unreadable.

## Production

`environmentType=production` turns on every safety check: it refuses to start without real
PIN delivery (Milestone 6), an Anthropic key and a Voyage key, keeps one replica warm, enables
Key Vault purge protection and 35-day database backups. Use it once Milestone 6 is complete.

## Troubleshooting

| Symptom                                                                           | Fix                                                                                                                                                      |
| --------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------- |
| API revision fails with a Key Vault access error right after the first deployment | Role assignments can take a few minutes to apply. Re-run with `isFirstDeployment=false`, or restart the revision.                                        |
| Image pull fails                                                                  | Packages are private: pass registry username and token, or make the packages public.                                                                     |
| `release` init container fails                                                    | Open its logs (Container App _api_ → Revisions → Console logs). It shows the failing step: migrations, role passwords, knowledge ingestion or demo data. |
| Deploy button says it can't download the template                                 | The repository is private. Use option B.                                                                                                                 |
