# Infrastructure (Azure, South Africa North)

How to deploy: [docs/deployment.md](../docs/deployment.md). Design: [ADR-0012](../docs/adr/0012-deployment-architecture.md).

```
infra/
  main.bicep              entry point (resource group scope)
  azuredeploy.json        compiled template for the Deploy to Azure button (generated)
  deploy.sh / deploy.ps1  one-command deployment with the Azure CLI
  modules/
    network.bicep         VNet, delegated subnets, private DNS for Postgres
    postgres.bicep        PostgreSQL 16 Flexible Server + pgvector, private access
    keyvault.bicep        Key Vault, generated secrets, identity read access
    storage.bicep         private blob storage for documents and PDFs
    monitoring.bicep      Log Analytics + Application Insights
    apps.bicep            Container Apps environment, web (public) and api (internal)
```

After editing any `.bicep` file, regenerate the button template (CI fails if you forget):

```bash
bicep build infra/main.bicep --outfile infra/azuredeploy.json
```
