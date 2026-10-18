// Container Apps: the public web app and the internal-only API (with its release step).
param location string
param namePrefix string
param suffix string
param environmentType string
param appsSubnetId string
param workspaceName string
param identityId string
@description('Client ID of the managed identity, used to get storage tokens.')
param identityClientId string
param blobEndpoint string
param blobContainer string
param keyVaultUri string
param insightsConnectionString string
param webImage string
param apiImage string
param registryServer string
param registryUsername string
@secure()
param registryPassword string
param hasAnthropicKey bool
param hasVoyageKey bool
param loadDemoData bool

var isProd = environmentType == 'production'
var webName = '${namePrefix}-web-${suffix}'
var apiName = '${namePrefix}-api-${suffix}'
var useRegistryCredentials = !empty(registryUsername) && !empty(registryPassword)

resource workspace 'Microsoft.OperationalInsights/workspaces@2023-09-01' existing = {
  name: workspaceName
}

resource env 'Microsoft.App/managedEnvironments@2024-03-01' = {
  name: '${namePrefix}-env-${suffix}'
  location: location
  properties: {
    vnetConfiguration: { infrastructureSubnetId: appsSubnetId, internal: false }
    workloadProfiles: [{ name: 'Consumption', workloadProfileType: 'Consumption' }]
    appLogsConfiguration: {
      destination: 'log-analytics'
      logAnalyticsConfiguration: {
        customerId: workspace.properties.customerId
        sharedKey: workspace.listKeys().primarySharedKey
      }
    }
  }
}

// Secrets are Key Vault references (versionless: the latest value), read by the managed identity.
func kvSecret(name string, vaultUri string, identity string) object => {
  name: name
  keyVaultUrl: '${vaultUri}secrets/${name}'
  identity: identity
}
var baseSecrets = [
  kvSecret('database-url', keyVaultUri, identityId)
  kvSecret('database-owner-url', keyVaultUri, identityId)
  kvSecret('app-db-password', keyVaultUri, identityId)
  kvSecret('worker-db-password', keyVaultUri, identityId)
  kvSecret('jwt-signing-secret', keyVaultUri, identityId)
  kvSecret('otp-pepper', keyVaultUri, identityId)
  kvSecret('field-encryption-key', keyVaultUri, identityId)
  kvSecret('blind-index-key', keyVaultUri, identityId)
]
var registrySecret = useRegistryCredentials ? [{ name: 'registry-password', value: registryPassword }] : []
var apiSecrets = concat(
  baseSecrets,
  hasAnthropicKey ? [kvSecret('anthropic-api-key', keyVaultUri, identityId)] : [],
  hasVoyageKey ? [kvSecret('voyage-api-key', keyVaultUri, identityId)] : [],
  registrySecret
)
var registries = useRegistryCredentials
  ? [{ server: registryServer, username: registryUsername, passwordSecretRef: 'registry-password' }]
  : []

var sharedEnv = [
  { name: 'NODE_ENV', value: 'production' }
  { name: 'APP_ENV', value: environmentType }
  { name: 'FIELD_ENCRYPTION_KEY', secretRef: 'field-encryption-key' }
  { name: 'BLIND_INDEX_KEY', secretRef: 'blind-index-key' }
  { name: 'EMBEDDING_PROVIDER', value: hasVoyageKey ? 'voyage' : 'hash' }
  { name: 'EMBEDDING_MODEL', value: 'voyage-multilingual-2' }
  { name: 'EMBEDDING_DIMENSIONS', value: '1024' }
  { name: 'APPLICATIONINSIGHTS_CONNECTION_STRING', value: insightsConnectionString }
]
var keyEnv = concat(
  hasAnthropicKey ? [{ name: 'ANTHROPIC_API_KEY', secretRef: 'anthropic-api-key' }] : [],
  hasVoyageKey ? [{ name: 'VOYAGE_API_KEY', secretRef: 'voyage-api-key' }] : []
)

resource api 'Microsoft.App/containerApps@2024-03-01' = {
  name: apiName
  location: location
  identity: { type: 'UserAssigned', userAssignedIdentities: { '${identityId}': {} } }
  properties: {
    environmentId: env.id
    workloadProfileName: 'Consumption'
    configuration: {
      // Internal only: reachable from the web app inside the environment, not from the internet.
      ingress: { external: false, targetPort: 4000, transport: 'auto', allowInsecure: false }
      secrets: apiSecrets
      registries: registries
      activeRevisionsMode: 'Single'
    }
    template: {
      initContainers: [
        {
          // Release step: migrations, role passwords, knowledge ingestion, optional demo data.
          name: 'release'
          image: apiImage
          command: ['node', 'dist/release.js']
          resources: { cpu: json('0.25'), memory: '0.5Gi' }
          env: concat(sharedEnv, keyEnv, [
            { name: 'DATABASE_OWNER_URL', secretRef: 'database-owner-url' }
            { name: 'APP_DB_PASSWORD', secretRef: 'app-db-password' }
            { name: 'WORKER_DB_PASSWORD', secretRef: 'worker-db-password' }
            { name: 'DEMO_SEED', value: (loadDemoData && !isProd) ? 'true' : 'false' }
          ])
        }
      ]
      containers: [
        {
          name: 'api'
          image: apiImage
          resources: { cpu: json('0.75'), memory: '1.5Gi' }
          env: concat(sharedEnv, keyEnv, [
            { name: 'API_PORT', value: '4000' }
            { name: 'WEB_ORIGIN', value: 'https://${webName}.${env.properties.defaultDomain}' }
            { name: 'DATABASE_URL', secretRef: 'database-url' }
            { name: 'JWT_SIGNING_SECRET', secretRef: 'jwt-signing-secret' }
            { name: 'OTP_PEPPER', secretRef: 'otp-pepper' }
            // Staging pilots print PINs to the (private) log until WhatsApp/SMS arrive in M6.
            { name: 'OTP_DELIVERY', value: isProd ? 'sms' : 'console' }
            { name: 'WES_MODEL_MODE', value: hasAnthropicKey ? 'live' : 'offline' }
            // Registration documents: private blob container, managed identity (no keys).
            { name: 'BLOB_DRIVER', value: 'azure' }
            { name: 'BLOB_ACCOUNT_URL', value: blobEndpoint }
            { name: 'BLOB_CONTAINER', value: blobContainer }
            { name: 'AZURE_CLIENT_ID', value: identityClientId }
          ])
          probes: [
            { type: 'Liveness', httpGet: { path: '/healthz', port: 4000 }, periodSeconds: 30 }
            { type: 'Readiness', httpGet: { path: '/healthz', port: 4000 }, periodSeconds: 10 }
          ]
        }
      ]
      scale: {
        minReplicas: isProd ? 1 : 0
        maxReplicas: isProd ? 5 : 2
        rules: [{ name: 'http', http: { metadata: { concurrentRequests: '40' } } }]
      }
    }
  }
}

resource web 'Microsoft.App/containerApps@2024-03-01' = {
  name: webName
  location: location
  identity: { type: 'UserAssigned', userAssignedIdentities: { '${identityId}': {} } }
  properties: {
    environmentId: env.id
    workloadProfileName: 'Consumption'
    configuration: {
      ingress: { external: true, targetPort: 3000, transport: 'auto', allowInsecure: false }
      secrets: registrySecret
      registries: registries
      activeRevisionsMode: 'Single'
    }
    template: {
      containers: [
        {
          name: 'web'
          image: webImage
          resources: { cpu: json('0.5'), memory: '1Gi' }
          env: [
            { name: 'NODE_ENV', value: 'production' }
            { name: 'API_URL', value: 'https://${api.properties.configuration.ingress.fqdn}' }
            { name: 'APPLICATIONINSIGHTS_CONNECTION_STRING', value: insightsConnectionString }
          ]
          probes: [
            { type: 'Liveness', httpGet: { path: '/manifest.webmanifest', port: 3000 }, periodSeconds: 30 }
          ]
        }
      ]
      scale: {
        minReplicas: isProd ? 1 : 0
        maxReplicas: isProd ? 5 : 2
        rules: [{ name: 'http', http: { metadata: { concurrentRequests: '60' } } }]
      }
    }
  }
}

output webUrl string = 'https://${web.properties.configuration.ingress.fqdn}'
output apiInternalUrl string = 'https://${api.properties.configuration.ingress.fqdn}'
output environmentName string = env.name
output webAppName string = web.name
output apiAppName string = api.name
