# Infrastructure (Azure, South Africa North)

Bicep modules land in **Milestone 7**. Planned layout:

```
infra/
  main.bicep                 # subscription-level entry: resource group + modules
  modules/
    container-apps.bicep     # api, worker, web (Container Apps environment)
    postgres.bicep           # Azure Database for PostgreSQL Flexible Server 16 + pgvector
    storage.bicep            # Blob Storage (documents, PDFs) with private endpoints
    keyvault.bicep           # Key Vault: JWT keys, field-encryption data key, provider secrets
    monitoring.bicep         # Log Analytics + Application Insights
    redis.bicep              # Azure Cache for Redis (BullMQ)
  parameters/
    staging.bicepparam
    production.bicepparam
```

Inputs still needed: `<<AZURE_SUBSCRIPTION_ID>>`, `<<AZURE_RESOURCE_GROUP>>`.

Principles: everything in `southafricanorth`; private networking between services; managed
identities instead of connection-string secrets where possible; database roles `wes_owner`,
`wes_app` and `wes_worker` created by a post-deploy script (see ADR-0003).
