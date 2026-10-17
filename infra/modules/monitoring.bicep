// Logs and telemetry. Application logs are already redacted by the API (no PINs, phones or tokens
// outside staging's deliberate PIN logging).
param location string
param namePrefix string
param suffix string
param environmentType string

resource workspace 'Microsoft.OperationalInsights/workspaces@2023-09-01' = {
  name: '${namePrefix}-logs-${suffix}'
  location: location
  properties: {
    sku: { name: 'PerGB2018' }
    retentionInDays: environmentType == 'production' ? 90 : 30
  }
}

resource insights 'Microsoft.Insights/components@2020-02-02' = {
  name: '${namePrefix}-insights-${suffix}'
  location: location
  kind: 'web'
  properties: {
    Application_Type: 'web'
    WorkspaceResourceId: workspace.id
  }
}

output workspaceId string = workspace.id
output workspaceName string = workspace.name
output connectionString string = insights.properties.ConnectionString
