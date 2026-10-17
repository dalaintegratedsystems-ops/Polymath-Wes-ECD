#!/usr/bin/env bash
# One-command deployment with the Azure CLI (works with a private GitHub repository).
#   ./infra/deploy.sh wes-staging
#   ANTHROPIC_API_KEY=... ./infra/deploy.sh wes-staging
#   REDEPLOY=true ./infra/deploy.sh wes-staging      # keep existing secrets
# Optional env: ENVIRONMENT (staging|production), LOCATION, REGISTRY_USERNAME, REGISTRY_PASSWORD,
#               ANTHROPIC_API_KEY, VOYAGE_API_KEY
set -euo pipefail

rg="${1:?usage: deploy.sh <resource-group>}"
location="${LOCATION:-southafricanorth}"
params=(
  "environmentType=${ENVIRONMENT:-staging}"
  "location=$location"
  "isFirstDeployment=$([[ "${REDEPLOY:-false}" == "true" ]] && echo false || echo true)"
)
[[ -n "${REGISTRY_USERNAME:-}" ]] && params+=("registryUsername=$REGISTRY_USERNAME" "registryPassword=${REGISTRY_PASSWORD:-}")
[[ -n "${ANTHROPIC_API_KEY:-}" ]] && params+=("anthropicApiKey=$ANTHROPIC_API_KEY")
[[ -n "${VOYAGE_API_KEY:-}" ]] && params+=("voyageApiKey=$VOYAGE_API_KEY")

az group create --name "$rg" --location "$location" --output none
url=$(az deployment group create \
  --resource-group "$rg" \
  --template-file "$(dirname "$0")/main.bicep" \
  --parameters "${params[@]}" \
  --query properties.outputs.webUrl.value --output tsv)
echo "Wes is deployed: $url"
