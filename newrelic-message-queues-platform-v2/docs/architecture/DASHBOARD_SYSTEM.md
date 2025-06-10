# Message Queue Dashboard System

## Overview

The Message Queue Dashboard System provides comprehensive visualization and monitoring capabilities for the New Relic Message Queues Platform. It includes pre-built templates, a flexible builder system, and a CLI tool for easy dashboard management.

## Architecture

```
src/dashboards/
├── templates/
│   └── standard-message-queue-dashboard.ts  # Dashboard template
├── builders/
│   └── dashboard-builder.ts                 # Dashboard construction & deployment
├── cli/
│   └── dashboard-cli.ts                     # Command-line interface
├── generator.ts                             # Legacy compatibility wrapper
└── index.ts                                 # Module exports
```

## Dashboard Pages

The standard dashboard includes 5 comprehensive pages:

### 1. Overview Page
- **Platform Health Score**: Overall cluster health with thresholds
- **Cluster Availability**: Real-time availability percentage
- **Total Message Throughput**: Platform-wide messages/second
- **Platform Error Rate**: System-wide error percentage
- **Cluster Status Matrix**: Detailed status for all clusters
- **Message Throughput Trend**: Historical throughput visualization
- **Entity Distribution**: Breakdown of entity types
- **Critical Issues**: List of current critical problems

### 2. Broker Performance Page
- **Average CPU Usage**: CPU utilization trends
- **Average Memory Usage**: Memory consumption patterns
- **Network Throughput**: Network bandwidth usage
- **Broker Status Details**: Comprehensive broker metrics table
- **Request Latency Distribution**: Latency histogram
- **Broker Load Distribution**: Load balancing visualization

### 3. Topic Analytics Page
- **Top Topics by Message Throughput**: Highest traffic topics
- **Topic Consumer Lag**: Lag analysis across topics
- **Topic Error Rates**: Error rate trends
- **Topic Efficiency Distribution**: Performance categorization
- **Topic Storage Distribution**: Storage usage by topic
- **Topic Configuration and Performance**: Detailed topic metrics

### 4. Consumer Groups Page
- **Total Platform Consumer Lag**: Aggregate lag metric
- **Active Consumer Groups**: Count of active groups
- **Average Lag per Consumer**: Mean lag calculation
- **Consumer Group Health**: Health distribution pie chart
- **Consumer Lag Trend**: Historical lag visualization
- **Top Consumer Groups by Lag**: Worst performing groups
- **Consumer Group Performance Details**: Comprehensive metrics table

### 5. Alerts & Anomalies Page
- **Active Critical Alerts**: Count of critical issues
- **Active Warning Alerts**: Count of warnings
- **Platform Anomaly Score**: Calculated anomaly metric
- **Incident Count Trend**: Comparison with previous period
- **Alert Timeline**: Time-series alert visualization
- **Issues by Entity Type**: Problem distribution
- **Resource Exhaustion Risk**: Resource threshold violations
- **Consumer Lag Anomalies**: Abnormal lag detection
- **Critical Issues Detail**: Comprehensive issue listing

## Using the Dashboard System

### Prerequisites

1. Set environment variables:
```bash
export NEW_RELIC_ACCOUNT_ID=your-account-id
export NEW_RELIC_API_KEY=your-user-api-key
export NEW_RELIC_REGION=US  # or EU
```

2. Ensure the platform is built:
```bash
npm run build
```

### Creating Dashboards

#### Using the CLI

```bash
# Create standard dashboard
npm run dashboard:create

# Create with custom name
node dist/dashboards/cli/dashboard-cli.js create -n "Production MQ Monitor"

# List all dashboards
npm run dashboard:list

# Delete a dashboard
node dist/dashboards/cli/dashboard-cli.js delete <dashboard-guid>

# Validate dashboard queries
node dist/dashboards/cli/dashboard-cli.js validate
```

#### Programmatically

```typescript
import { DashboardGenerator } from './dist/dashboards/generator.js';

const config = {
  accountId: 'your-account-id',
  apiKey: 'your-api-key',
  region: 'US'
};

const generator = new DashboardGenerator(config);
const dashboardUrl = await generator.generate('My Dashboard');
```

### Testing Dashboard Generation

Run the test script to verify dashboard creation:

```bash
npm run dashboard:test
```

This will:
1. Create a standard dashboard
2. Create a custom dashboard with selected pages
3. List all dashboards
4. Display results

## Dashboard Queries

All dashboards use NRQL queries against the `MessageQueue` event type with entity-specific filtering:

```sql
-- Example: Cluster health
FROM MessageQueue 
SELECT average(cluster.health.score) AS 'Health Score' 
WHERE entityType = 'MESSAGE_QUEUE_CLUSTER' 
SINCE 30 minutes ago

-- Example: Broker CPU usage
FROM MessageQueue 
SELECT average(broker.cpu.usage) AS 'CPU %' 
WHERE entityType = 'MESSAGE_QUEUE_BROKER' 
SINCE 1 hour ago TIMESERIES AUTO

-- Example: Consumer lag
FROM MessageQueue 
SELECT sum(consumerGroup.lag.total) AS 'Total Lag' 
WHERE entityType = 'MESSAGE_QUEUE_CONSUMER_GROUP' 
SINCE 5 minutes ago
```

## Customization

### Creating Custom Templates

```typescript
import { DashboardTemplate } from './src/dashboards/templates/standard-message-queue-dashboard';

const customTemplate: DashboardTemplate = {
  name: 'Custom MQ Dashboard',
  description: 'Specialized monitoring',
  permissions: 'PUBLIC_READ_WRITE',
  pages: [
    {
      name: 'Custom Page',
      description: 'Custom metrics',
      widgets: [
        {
          title: 'Custom Widget',
          layout: { column: 1, row: 1, width: 6, height: 3 },
          visualization: { id: 'viz.line' },
          rawConfiguration: {
            nrqlQueries: [{
              accountId: 'your-account-id',
              query: 'YOUR CUSTOM NRQL QUERY'
            }]
          }
        }
      ]
    }
  ]
};
```

### Modifying Existing Templates

The `StandardMessageQueueDashboard` class can be extended:

```typescript
class CustomMessageQueueDashboard extends StandardMessageQueueDashboard {
  protected createCustomPage(): DashboardPage {
    // Your custom page implementation
  }
}
```

## Troubleshooting

### Common Issues

1. **Authentication Error**
   - Verify your API key has dashboard management permissions
   - Ensure you're using a User API key, not an Ingest key

2. **NRQL Query Errors**
   - Check that MESSAGE_QUEUE entities exist in your account
   - Verify the time range contains data
   - Use the validate command to test queries

3. **Dashboard Not Appearing**
   - Check the returned dashboard URL
   - Verify your account ID is correct
   - Ensure the region (US/EU) matches your account

### Debug Mode

Enable debug logging:

```bash
DEBUG=* npm run dashboard:create
```

## Best Practices

1. **Naming Conventions**
   - Use descriptive dashboard names
   - Include environment or cluster identifiers
   - Follow your organization's naming standards

2. **Performance Optimization**
   - Limit the number of widgets per page
   - Use appropriate time windows for queries
   - Leverage FACET wisely to avoid cardinality issues

3. **Dashboard Management**
   - Regularly review and update dashboards
   - Remove unused dashboards
   - Version control dashboard templates

4. **Security**
   - Never commit API keys to version control
   - Use environment variables for sensitive data
   - Set appropriate dashboard permissions

## Integration with Platform

The dashboard system integrates seamlessly with the platform:

1. **Automatic Entity Discovery**: Dashboards automatically query newly created entities
2. **Golden Metrics**: All dashboard metrics align with entity golden metrics
3. **Real-time Updates**: Dashboards reflect live data as it's streamed
4. **Relationship Awareness**: Dashboards can navigate entity relationships

## Future Enhancements

- Alert rule generation from dashboard thresholds
- Dashboard-as-code with Terraform integration
- Mobile-optimized dashboard layouts
- Custom visualization plugins
- Dashboard sharing and collaboration features