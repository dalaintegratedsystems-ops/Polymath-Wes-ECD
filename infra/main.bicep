// Polymath Wes: one-click Azure deployment (ADR-0012, simplified).
//
// Two container apps (public web, internal API with its release step), PostgreSQL 16 with
// pgvector on a private network, Key Vault for every secret (read by a managed identity),
// private blob storage and Log Analytics. Deploy into a resource group in South Africa North.
//
// Build the portal template:  bicep build infra/main.bicep --outfile infra/azuredeploy.json

targetScope = 'resourceGroup'

@description('staging: a private pilot (PINs appear in the server log until WhatsApp/SMS arrive in Milestone 6; Wes runs offline without an Anthropic key). production: every safety check enforced.')
@allowed(['staging', 'production'])
param environmentType string = 'staging'

@description('Azure region. Keep South Africa North so children\'s data stays in South Africa (POPIA).')
param location string = 'southafricanorth'

@description('Short lowercase prefix for resource names (3 to 8 letters).')
@minLength(3)
@maxLength(8)
param namePrefix string = 'wes'

@description('Web app container image.')
param webImage string = 'ghcr.io/dalaintegratedsystems-ops/polymath-wes-web:latest'

@description('API container image.')
param apiImage string = 'ghcr.io/dalaintegratedsystems-ops/polymath-wes-api:latest'

@description('Container registry server, for private images.')
param registryServer string = 'ghcr.io'

@description('Registry username (leave empty for public images). For GHCR: your GitHub username.')
param registryUsername string = ''

@description('Registry password or token (leave empty for public images). For GHCR: a token with read:packages.')
@secure()
param registryPassword string = ''

@description('Anthropic API key for Wes. Leave empty to run Wes in offline mode (staging only).')
@secure()
param anthropicApiKey string = ''

@description('Voyage AI key for embeddings (ADR-0006). Leave empty to use local embeddings (staging only).')
@secure()
param voyageApiKey string = ''

@description('Load fictional demo centres and children into an empty staging database.')
param loadDemoData bool = true

@description('Leave true for the first deployment. Set false when re-deploying so existing secrets and the database password are kept.')
param isFirstDeployment bool = true

// Generated once per deployment; only written when isFirstDeployment is true.
@secure()
param seedA string = newGuid()
@secure()
param seedB string = newGuid()
@secure()
param seedC string = newGuid()
@secure()
param seedD string = newGuid()
@secure()
param seedE string = newGuid()
@secure()
param seedF string = newGuid()

var suffix = take(uniqueString(resourceGroup().id), 6)
func hex(g string) string => replace(g, '-', '')
var adminLogin = 'wesadmin'
var adminPassword = 'Wes${hex(seedA)}'
var appDbPassword = 'App${hex(seedB)}'
var workerDbPassword = 'Wkr${hex(seedC)}'

resource identity 'Microsoft.ManagedIdentity/userAssignedIdentities@2023-01-31' = {
  name: '${namePrefix}-id-${suffix}'
  location: location
}

module network 'modules/network.bicep' = {
  name: 'network'
  params: { location: location, namePrefix: namePrefix, suffix: suffix }
}

module monitoring 'modules/monitoring.bicep' = {
  name: 'monitoring'
  params: { location: location, namePrefix: namePrefix, suffix: suffix, environmentType: environmentType }
}

module postgres 'modules/postgres.bicep' = {
  name: 'postgres'
  params: {
    location: location
    namePrefix: namePrefix
    suffix: suffix
    environmentType: environmentType
    subnetId: network.outputs.databaseSubnetId
    dnsZoneId: network.outputs.dnsZoneId
    adminLogin: adminLogin
    adminPassword: adminPassword
    setAdminPassword: isFirstDeployment
  }
}

var dbHost = postgres.outputs.fqdn
var dbName = postgres.outputs.databaseName

module keyvault 'modules/keyvault.bicep' = {
  name: 'keyvault'
  params: {
    location: location
    namePrefix: namePrefix
    suffix: suffix
    environmentType: environmentType
    identityPrincipalId: identity.properties.principalId
    writeSecrets: isFirstDeployment
    secrets: {
      'database-url': 'postgres://wes_app:${appDbPassword}@${dbHost}:5432/${dbName}?sslmode=require'
      'database-owner-url': 'postgres://${adminLogin}:${adminPassword}@${dbHost}:5432/${dbName}?sslmode=require'
      'app-db-password': appDbPassword
      'worker-db-password': workerDbPassword
      'jwt-signing-secret': '${hex(seedD)}${hex(seedE)}'
      'otp-pepper': hex(seedF)
      // 64 hex characters = 32-byte keys (accepted by @wes/db field crypto).
      'field-encryption-key': '${hex(seedA)}${hex(seedE)}'
      'blind-index-key': '${hex(seedB)}${hex(seedD)}'
      'anthropic-api-key': anthropicApiKey
      'voyage-api-key': voyageApiKey
    }
  }
}

module storage 'modules/storage.bicep' = {
  name: 'storage'
  params: {
    location: location
    namePrefix: namePrefix
    suffix: suffix
    identityPrincipalId: identity.properties.principalId
  }
}

module apps 'modules/apps.bicep' = {
  name: 'apps'
  params: {
    location: location
    namePrefix: namePrefix
    suffix: suffix
    environmentType: environmentType
    appsSubnetId: network.outputs.appsSubnetId
    workspaceName: monitoring.outputs.workspaceName
    identityId: identity.id
    keyVaultUri: keyvault.outputs.uri
    insightsConnectionString: monitoring.outputs.connectionString
    webImage: webImage
    apiImage: apiImage
    registryServer: registryServer
    registryUsername: registryUsername
    registryPassword: registryPassword
    hasAnthropicKey: !empty(anthropicApiKey)
    hasVoyageKey: !empty(voyageApiKey)
    loadDemoData: loadDemoData
  }
  // The identity must be able to write blobs before the API starts (Key Vault is already a dependency).
  dependsOn: [storage]
}

@description('Open this in a phone browser to use Wes.')
output webUrl string = apps.outputs.webUrl
output keyVaultName string = keyvault.outputs.name
output containerAppsEnvironment string = apps.outputs.environmentName
output apiAppName string = apps.outputs.apiAppName
output webAppName string = apps.outputs.webAppName
