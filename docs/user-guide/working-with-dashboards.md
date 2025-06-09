# Working with Dashboards

> **Purpose**: Complete guide to creating and managing dashboards for MESSAGE_QUEUE monitoring  
> **Audience**: Platform operators, SREs, and monitoring teams  
> **Prerequisites**: Platform running and entities created in New Relic

## Overview

The Message Queues Platform includes a powerful dashboard generator that creates pre-built visualizations for Kafka monitoring. These dashboards are designed around MESSAGE_QUEUE entities and provide operational insights at cluster, broker, topic, and consumer group levels.

## Quick Start: Create Your First Dashboard

### 1. Verify Entities Exist

Before creating dashboards, ensure MESSAGE_QUEUE entities are available:

```sql
-- Check entity availability
FROM MessageQueue SELECT count(*) 
WHERE entityType LIKE 'MESSAGE_QUEUE_%'
SINCE 10 minutes ago
FACET entityType
```

### 2. Create a Dashboard

```bash
# Create cluster overview dashboard
node dashboards/cli.js create --template=cluster-overview --provider=kafka

# With custom name
node dashboards/cli.js create \
  --template=cluster-overview \
  --provider=kafka \
  --name="Production Kafka Monitoring"
```

### 3. View in New Relic

1. Go to [New Relic Dashboards](https://one.newrelic.com/launcher/dashboards.dashboards)
2. Look for your newly created dashboard
3. Click to open and explore the visualizations

## Available Dashboard Templates

### Cluster Overview Dashboard
**Template**: `cluster-overview`  
**Purpose**: High-level cluster health and performance monitoring

**Widgets Include:**
- Cluster throughput (messages/sec, bytes/sec)
- Broker availability and health
- Topic count and partition distribution
- Consumer lag overview
- Error rate trending

```bash
# Create cluster overview
node dashboards/cli.js create --template=cluster-overview --provider=kafka
```

**Best for**: Operations teams, daily monitoring, executive dashboards

### Broker Details Dashboard
**Template**: `broker-details`  
**Purpose**: Deep dive into individual broker performance

**Widgets Include:**
- Per-broker CPU and memory usage
- Disk I/O and usage patterns
- Network throughput per broker
- JVM metrics and garbage collection
- Request queue size and processing time

```bash
# Create broker details dashboard
node dashboards/cli.js create --template=broker-details --provider=kafka
```

**Best for**: Performance analysis, capacity planning, troubleshooting

### Topic Analysis Dashboard
**Template**: `topic-analysis`  
**Purpose**: Topic-level monitoring and analysis

**Widgets Include:**
- Topic throughput and growth trends
- Partition distribution and balance
- Replication factor and under-replicated partitions
- Topic size and retention metrics
- Message size distribution

```bash
# Create topic analysis dashboard
node dashboards/cli.js create --template=topic-analysis --provider=kafka
```

**Best for**: Application teams, data flow monitoring, capacity planning

### Consumer Groups Dashboard
**Template**: `consumer-groups`  
**Purpose**: Consumer group performance and lag monitoring

**Widgets Include:**
- Consumer lag per group and topic
- Consumer group rebalancing events
- Processing rate vs. ingestion rate
- Consumer group health and availability
- Lag trend analysis and alerts

```bash
# Create consumer groups dashboard
node dashboards/cli.js create --template=consumer-groups --provider=kafka
```

**Best for**: Application developers, performance monitoring, SLA tracking

### Performance Optimization Dashboard
**Template**: `performance-optimization`  
**Purpose**: Advanced performance analysis and optimization

**Widgets Include:**
- Request latency percentiles (p50, p95, p99)
- Throughput vs. latency correlation
- Resource utilization patterns
- Bottleneck identification
- Performance trend analysis

```bash
# Create performance optimization dashboard
node dashboards/cli.js create --template=performance-optimization --provider=kafka
```

**Best for**: Performance engineers, optimization projects, capacity planning

### Infrastructure Overview Dashboard
**Template**: `infrastructure-overview`  
**Purpose**: Infrastructure-level monitoring for Kafka deployment

**Widgets Include:**
- Host-level metrics (CPU, memory, disk, network)
- Container/pod resource usage (if applicable)
- Infrastructure alerts and events
- Deployment topology visualization
- Infrastructure cost analysis

```bash
# Create infrastructure overview dashboard
node dashboards/cli.js create --template=infrastructure-overview --provider=kafka
```

**Best for**: Infrastructure teams, cost optimization, deployment monitoring

## Dashboard CLI Reference

### Basic Commands

```bash
# List available templates
node dashboards/cli.js list-templates

# List templates for specific provider
node dashboards/cli.js list-templates --provider=kafka

# Get template details
node dashboards/cli.js describe --template=cluster-overview
```

### Creation Options

```bash
# Basic creation
node dashboards/cli.js create --template=TEMPLATE --provider=PROVIDER

# With custom name
node dashboards/cli.js create \
  --template=cluster-overview \
  --provider=kafka \
  --name="My Custom Dashboard"

# With specific account
node dashboards/cli.js create \
  --template=cluster-overview \
  --provider=kafka \
  --account-id=1234567

# Dry run (preview without creating)
node dashboards/cli.js create \
  --template=cluster-overview \
  --provider=kafka \
  --dry-run
```

### Batch Operations

```bash
# Create full dashboard suite
node dashboards/cli.js generate-suite --provider=kafka

# Create specific set of dashboards
node dashboards/cli.js generate-suite \
  --provider=kafka \
  --templates=cluster-overview,broker-details,topic-analysis

# Generate for multiple environments
node dashboards/cli.js generate-suite \
  --provider=kafka \
  --environments=production,staging,development
```

### Management Commands

```bash
# List existing dashboards
node dashboards/cli.js list

# Update existing dashboard
node dashboards/cli.js update \
  --dashboard-guid=GUID \
  --template=cluster-overview

# Delete dashboard
node dashboards/cli.js delete --dashboard-guid=GUID

# Export dashboard configuration
node dashboards/cli.js export --dashboard-guid=GUID --output=dashboard.json
```

## Customizing Dashboards

### Template Customization

Dashboard templates are located in `dashboards/templates/infrastructure/`:

```
dashboards/templates/infrastructure/
├── kafka-cluster-health.json
├── kafka-broker-details.json
├── kafka-topic-analysis.json
├── kafka-consumer-groups.json
├── kafka-performance-optimization.json
└── kafka-infrastructure-overview.json
```

### Creating Custom Templates

1. **Copy existing template**:
```bash
cp dashboards/templates/infrastructure/kafka-cluster-health.json \
   dashboards/templates/infrastructure/my-custom-template.json
```

2. **Modify the template**:
```json
{
  "name": "My Custom Kafka Dashboard",
  "description": "Custom monitoring for my specific use case",
  "pages": [
    {
      "name": "Overview",
      "widgets": [
        {
          "title": "Custom Metric",
          "visualization": { "id": "viz.line" },
          "configuration": {
            "nrqlQueries": [{
              "query": "FROM MessageQueue SELECT average(customMetric) WHERE entityType = 'MESSAGE_QUEUE_BROKER' TIMESERIES",
              "accountId": "{{accountId}}"
            }]
          }
        }
      ]
    }
  ]
}
```

3. **Register the template**:
Add to `dashboards/templates/infrastructure/index.js`:
```javascript
module.exports = {
  'cluster-overview': require('./kafka-cluster-health.json'),
  'broker-details': require('./kafka-broker-details.json'),
  'my-custom': require('./my-custom-template.json'),  // Add your template
  // ... other templates
};
```

4. **Use the custom template**:
```bash
node dashboards/cli.js create --template=my-custom --provider=kafka
```

### Widget Customization

**Common widget types:**
- `viz.line` - Time series line chart
- `viz.area` - Area chart
- `viz.bar` - Bar chart
- `viz.pie` - Pie chart
- `viz.table` - Data table
- `viz.billboard` - Single value display
- `viz.heatmap` - Heat map visualization

**Example custom widget**:
```json
{
  "title": "Top Topics by Throughput",
  "visualization": { "id": "viz.table" },
  "layout": { "column": 1, "row": 1, "width": 6, "height": 3 },
  "configuration": {
    "nrqlQueries": [{
      "query": "FROM MessageQueue SELECT latest(throughput) WHERE entityType = 'MESSAGE_QUEUE_TOPIC' FACET entityName LIMIT 10",
      "accountId": "{{accountId}}"
    }]
  }
}
```

## Dashboard Variables

### Using Variables in Templates

Templates support variables for dynamic dashboards:

```json
{
  "variables": [
    {
      "name": "cluster",
      "title": "Cluster",
      "type": "NRQL",
      "nrqlQuery": "FROM MessageQueue SELECT uniques(clusterName) WHERE entityType = 'MESSAGE_QUEUE_CLUSTER'",
      "defaultValue": "*"
    },
    {
      "name": "timeRange",
      "title": "Time Range",
      "type": "ENUM",
      "enumValues": ["30 minutes ago", "1 hour ago", "3 hours ago", "1 day ago"],
      "defaultValue": "1 hour ago"
    }
  ]
}
```

### Using Variables in Queries

```sql
-- Use cluster variable in NRQL
FROM MessageQueue 
SELECT average(throughput) 
WHERE entityType = 'MESSAGE_QUEUE_BROKER' 
  AND clusterName LIKE '{{cluster}}'
SINCE {{timeRange}}
TIMESERIES
```

### Dynamic Variables

**Cluster Selection:**
```json
{
  "name": "cluster",
  "type": "NRQL",
  "nrqlQuery": "FROM MessageQueue SELECT uniques(clusterName) WHERE entityType = 'MESSAGE_QUEUE_CLUSTER' SINCE 1 day ago"
}
```

**Broker Selection:**
```json
{
  "name": "broker",
  "type": "NRQL", 
  "nrqlQuery": "FROM MessageQueue SELECT uniques(entityName) WHERE entityType = 'MESSAGE_QUEUE_BROKER' AND clusterName = '{{cluster}}' SINCE 1 day ago"
}
```

## Advanced Dashboard Features

### Multi-Account Dashboards

```bash
# Create dashboard for specific account
node dashboards/cli.js create \
  --template=cluster-overview \
  --provider=kafka \
  --account-id=1234567

# Create cross-account dashboard
node dashboards/cli.js create \
  --template=cluster-overview \
  --provider=kafka \
  --accounts=1234567,2345678,3456789
```

### Alerting Integration

Add alert conditions to dashboard widgets:

```json
{
  "title": "Broker CPU Usage",
  "configuration": {
    "nrqlQueries": [{
      "query": "FROM MessageQueue SELECT average(cpuUsage) WHERE entityType = 'MESSAGE_QUEUE_BROKER' TIMESERIES"
    }],
    "thresholds": [
      {
        "alertSeverity": "WARNING",
        "value": 80
      },
      {
        "alertSeverity": "CRITICAL", 
        "value": 95
      }
    ]
  }
}
```

### Dashboard Sharing

```bash
# Set dashboard permissions
node dashboards/cli.js permissions \
  --dashboard-guid=GUID \
  --permissions=PUBLIC_READ_WRITE

# Generate shareable URL
node dashboards/cli.js share --dashboard-guid=GUID

# Export for sharing
node dashboards/cli.js export \
  --dashboard-guid=GUID \
  --format=json \
  --output=shared-dashboard.json
```

## Best Practices

### Dashboard Design

**1. Organize by Audience**
- **Operations**: Cluster health, alerting, SLA metrics
- **Development**: Application-specific topics, consumer lag
- **Infrastructure**: Resource usage, capacity planning

**2. Follow the Golden Signals**
- **Latency**: Request/response times, processing delays
- **Traffic**: Throughput, requests per second
- **Errors**: Error rates, failed operations
- **Saturation**: Resource utilization, queue depths

**3. Use Consistent Time Ranges**
- Default to 1 hour for operational dashboards
- Use 24 hours for trend analysis
- Provide time range variables for flexibility

### Query Optimization

**1. Use Efficient NRQL**
```sql
-- Good: Specific entity types and time ranges
FROM MessageQueue 
SELECT average(throughput) 
WHERE entityType = 'MESSAGE_QUEUE_BROKER'
  AND clusterName = 'production'
SINCE 1 hour ago
TIMESERIES 5 minutes

-- Avoid: Broad queries without filters
FROM MessageQueue SELECT * SINCE 1 day ago
```

**2. Leverage Faceting**
```sql
-- Group by relevant dimensions
FROM MessageQueue 
SELECT average(errorRate) 
WHERE entityType = 'MESSAGE_QUEUE_TOPIC'
FACET clusterName, entityName
SINCE 1 hour ago
```

**3. Use Appropriate Aggregations**
```sql
-- Use latest() for current state
FROM MessageQueue SELECT latest(partitionCount) WHERE entityType = 'MESSAGE_QUEUE_TOPIC'

-- Use average() for performance metrics
FROM MessageQueue SELECT average(responseTime) WHERE entityType = 'MESSAGE_QUEUE_BROKER'

-- Use sum() for throughput metrics
FROM MessageQueue SELECT sum(messagesPerSecond) WHERE entityType = 'MESSAGE_QUEUE_CLUSTER'
```

### Maintenance

**1. Regular Updates**
- Update dashboards when entity schemas change
- Refresh queries when new metrics are added
- Test dashboards after platform updates

**2. Performance Monitoring**
- Monitor dashboard load times
- Optimize slow queries
- Use appropriate data retention policies

**3. Access Management**
- Set appropriate permissions for different teams
- Use variables to filter data by team/environment
- Regular access reviews for compliance

## Troubleshooting Dashboards

### No Data Showing

**Check 1: Entity Availability**
```sql
FROM MessageQueue SELECT count(*) 
WHERE entityType LIKE 'MESSAGE_QUEUE_%'
SINCE 1 hour ago
```

**Check 2: Query Syntax**
- Verify NRQL syntax is correct
- Check entity type names match exactly
- Ensure time ranges are appropriate

**Check 3: Permissions**
- Verify User API Key has dashboard permissions
- Check account access for the data source
- Ensure proper role assignments

### Dashboard Creation Fails

**Check 1: API Permissions**
```bash
# Test dashboard API access
curl -H "Api-Key: $NEW_RELIC_USER_API_KEY" \
     "https://api.newrelic.com/graphql" \
     -d '{"query": "{ actor { user { email } } }"}'
```

**Check 2: Template Validation**
```bash
# Validate template syntax
node dashboards/cli.js validate --template=cluster-overview
```

**Check 3: Account Limits**
- Check dashboard count limits
- Verify widget count limits per dashboard
- Ensure API rate limits aren't exceeded

### Slow Dashboard Performance

**Optimization 1: Query Efficiency**
- Add WHERE clauses to filter data
- Use appropriate time ranges
- Avoid SELECT * queries

**Optimization 2: Widget Optimization**
- Reduce number of widgets per dashboard
- Use summary metrics instead of raw data
- Implement data sampling for high-volume queries

## Integration Examples

### Grafana Integration

Export dashboard data for Grafana:

```bash
# Export dashboard as Grafana-compatible JSON
node dashboards/cli.js export \
  --dashboard-guid=GUID \
  --format=grafana \
  --output=grafana-dashboard.json
```

### Slack Integration

Embed dashboard links in Slack notifications:

```javascript
// Example Slack webhook
const dashboardUrl = 'https://one.newrelic.com/dashboards/GUID';
const slackMessage = {
  text: `Kafka Cluster Alert: High consumer lag detected`,
  attachments: [{
    color: 'warning',
    fields: [{
      title: 'Dashboard',
      value: `<${dashboardUrl}|View Kafka Monitoring Dashboard>`,
      short: true
    }]
  }]
};
```

### API Integration

Query dashboard data programmatically:

```javascript
const NewRelicClient = require('../core/http/new-relic-client');

const client = new NewRelicClient({
  apiKey: process.env.NEW_RELIC_USER_API_KEY,
  accountId: process.env.NEW_RELIC_ACCOUNT_ID
});

// Get dashboard widgets data
const query = `
  FROM MessageQueue 
  SELECT average(throughput) 
  WHERE entityType = 'MESSAGE_QUEUE_CLUSTER'
  SINCE 1 hour ago
`;

const result = await client.executeNrqlQuery(query);
console.log('Cluster throughput:', result.results[0].average);
```

---

**Next Steps:**
- [CLI Reference](cli-reference.md) - Complete command reference
- [Troubleshooting](troubleshooting.md) - Dashboard troubleshooting guide
- [Platform Modes](platform-modes.md) - Understanding data sources
- [Infrastructure Setup](../operations/infrastructure-setup.md) - Setting up data collection