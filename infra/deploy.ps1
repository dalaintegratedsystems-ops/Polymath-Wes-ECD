# One-command deployment with the Azure CLI (works with a private GitHub repository).
#   ./infra/deploy.ps1 -ResourceGroup wes-staging
#   ./infra/deploy.ps1 -ResourceGroup wes-staging -AnthropicApiKey $env:ANTHROPIC_API_KEY
# Requires: Azure CLI (az login done) with Contributor + User Access Administrator on the group.
param(
  [Parameter(Mandatory = $true)] [string] $ResourceGroup,
  [ValidateSet('staging', 'production')] [string] $Environment = 'staging',
  [string] $Location = 'southafricanorth',
  [string] $RegistryUsername = '',
  [string] $RegistryPassword = '',
  [string] $AnthropicApiKey = '',
  [string] $VoyageApiKey = '',
  [string] $WhatsAppPhoneNumberId = '',
  [string] $WhatsAppAccessToken = '',
  [string] $WhatsAppAppSecret = '',
  [string] $WhatsAppVerifyToken = '',
  [switch] $Redeploy
)
$ErrorActionPreference = 'Stop'

az group create --name $ResourceGroup --location $Location --output none

$params = @(
  "environmentType=$Environment",
  "location=$Location",
  "isFirstDeployment=$(if ($Redeploy) { 'false' } else { 'true' })"
)
if ($RegistryUsername) { $params += "registryUsername=$RegistryUsername", "registryPassword=$RegistryPassword" }
if ($AnthropicApiKey) { $params += "anthropicApiKey=$AnthropicApiKey" }
if ($VoyageApiKey) { $params += "voyageApiKey=$VoyageApiKey" }
if ($WhatsAppPhoneNumberId) {
  $params += "whatsappPhoneNumberId=$WhatsAppPhoneNumberId", "whatsappAccessToken=$WhatsAppAccessToken",
    "whatsappAppSecret=$WhatsAppAppSecret", "whatsappVerifyToken=$WhatsAppVerifyToken"
}

$result = az deployment group create `
  --resource-group $ResourceGroup `
  --template-file "$PSScriptRoot/main.bicep" `
  --parameters $params `
  --query properties.outputs.webUrl.value --output tsv

Write-Host "Wes is deployed: $result"
