// Key Vault holding every application secret. Apps read them with a managed identity (RBAC),
// so no secret appears in the template outputs, the container images or CI.
param location string
param namePrefix string
param suffix string
param environmentType string
param identityPrincipalId string
@description('Write secret values (first deployment only). Re-deploys keep the existing values.')
param writeSecrets bool
@secure()
param secrets object

var isProd = environmentType == 'production'
// Key Vault Secrets User
var secretsUserRole = '4633458b-17de-408a-b874-0445c86b69e6'

resource vault 'Microsoft.KeyVault/vaults@2023-07-01' = {
  name: '${namePrefix}-kv-${suffix}'
  location: location
  properties: union(
    {
      tenantId: subscription().tenantId
      sku: { family: 'A', name: 'standard' }
      enableRbacAuthorization: true
      enableSoftDelete: true
      softDeleteRetentionInDays: 90
      publicNetworkAccess: 'Enabled'
    },
    isProd ? { enablePurgeProtection: true } : {}
  )
}

resource secretItems 'Microsoft.KeyVault/vaults/secrets@2023-07-01' = [
  for item in items(secrets): if (writeSecrets && !empty(item.value)) {
    parent: vault
    name: item.key
    properties: { value: item.value }
  }
]

resource readSecrets 'Microsoft.Authorization/roleAssignments@2022-04-01' = {
  scope: vault
  name: guid(vault.id, identityPrincipalId, secretsUserRole)
  properties: {
    principalId: identityPrincipalId
    principalType: 'ServicePrincipal'
    roleDefinitionId: subscriptionResourceId('Microsoft.Authorization/roleDefinitions', secretsUserRole)
  }
}

output name string = vault.name
output uri string = vault.properties.vaultUri
#disable-next-line BCP053
output roleAssignmentId string = readSecrets.id
