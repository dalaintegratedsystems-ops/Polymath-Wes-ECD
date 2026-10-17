// PostgreSQL 16 Flexible Server with pgvector, private access only, automatic backups.
param location string
param namePrefix string
param suffix string
param environmentType string
param subnetId string
param dnsZoneId string
param adminLogin string
@secure()
param adminPassword string
@description('Set the admin password only on the first deployment, so re-deploys never change it.')
param setAdminPassword bool

var isProd = environmentType == 'production'

resource server 'Microsoft.DBforPostgreSQL/flexibleServers@2024-08-01' = {
  name: '${namePrefix}-pg-${suffix}'
  location: location
  sku: {
    name: isProd ? 'Standard_B2s' : 'Standard_B1ms'
    tier: 'Burstable'
  }
  properties: union(
    {
      version: '16'
      administratorLogin: adminLogin
      storage: { storageSizeGB: 32, autoGrow: 'Enabled' }
      backup: { backupRetentionDays: isProd ? 35 : 7, geoRedundantBackup: 'Disabled' }
      network: {
        delegatedSubnetResourceId: subnetId
        privateDnsZoneArmResourceId: dnsZoneId
        publicNetworkAccess: 'Disabled'
      }
      highAvailability: { mode: 'Disabled' }
      authConfig: { activeDirectoryAuth: 'Disabled', passwordAuth: 'Enabled' }
    },
    setAdminPassword ? { administratorLoginPassword: adminPassword } : {}
  )
}

// pgvector for knowledge retrieval (and pgcrypto, used by local tooling).
resource extensions 'Microsoft.DBforPostgreSQL/flexibleServers/configurations@2024-08-01' = {
  parent: server
  name: 'azure.extensions'
  properties: { value: 'VECTOR,PGCRYPTO', source: 'user-override' }
}

resource database 'Microsoft.DBforPostgreSQL/flexibleServers/databases@2024-08-01' = {
  parent: server
  name: 'wes'
  properties: { charset: 'UTF8', collation: 'en_US.utf8' }
  dependsOn: [extensions]
}

output fqdn string = server.properties.fullyQualifiedDomainName
output databaseName string = database.name
