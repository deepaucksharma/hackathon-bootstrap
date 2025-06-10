# Entity Summary - Message Queue Entities

The entity summary is the main dashboard view for each message queue entity, providing comprehensive operational insights.

## Overview

Entity summaries are defined as dashboard templates that are automatically populated with entity-specific data. Each entity type has its own summary dashboard optimized for its metrics and use cases.

## Dashboard Structure

### Standard 4-Page Layout

All message queue entities follow a consistent 4-page dashboard structure:

1. **Executive Overview** - Business KPIs and health scores
2. **Consumer Groups** - Lag analysis and consumer health
3. **Infrastructure & Cost** - Resource utilization and optimization
4. **Topics & Partitions** - Topic performance and distribution

## Dashboard Templates

### MESSAGE_QUEUE_CLUSTER

```yaml
dashboardTemplates:
  newRelic:
    template: cluster-dashboard.json
    filterNRQLByEntityID: true
```

**Page 1: Executive Overview**
- Cluster health score (large billboard)
- Total throughput trend
- Error rate over time
- Active brokers and topics count
- Top topics by throughput

**Page 2: Broker Health**
- Broker status table
- CPU and memory usage by broker
- Network throughput distribution
- Under-replicated partitions
- Leader election rate

**Page 3: Infrastructure**
- Resource utilization heatmap
- Disk usage trends
- JVM heap memory analysis
- Network I/O patterns
- Cost estimation metrics

**Page 4: Performance Analysis**
- Request latency percentiles
- Producer/consumer rates
- Partition distribution
- Replication lag
- Error breakdown by type

### MESSAGE_QUEUE_BROKER

```yaml
dashboardTemplates:
  newRelic:
    template: broker-dashboard.json
    filterNRQLByEntityID: true
```

**Key Widgets:**
- Resource utilization gauges
- Partition ownership table
- Request handler metrics
- Network connections
- Log segment statistics
- JVM performance metrics

### MESSAGE_QUEUE_TOPIC

```yaml
dashboardTemplates:
  newRelic:
    template: topic-dashboard.json
    filterNRQLByEntityID: true
```

**Key Widgets:**
- Message flow visualization
- Partition lag by consumer group
- Producer throughput by client
- Message size distribution
- Retention vs. usage analysis
- Error rate by partition

### MESSAGE_QUEUE_QUEUE

```yaml
dashboardTemplates:
  newRelic:
    template: queue-dashboard.json
    filterNRQLByEntityID: true
```

**Key Widgets:**
- Queue depth gauge and trend
- Enqueue/dequeue rates
- Message age distribution
- Dead letter queue metrics
- Consumer connection status
- Processing time histogram

### MESSAGE_QUEUE_CONSUMER_GROUP

```yaml
dashboardTemplates:
  newRelic:
    template: consumer-group-dashboard.json
    filterNRQLByEntityID: true
```

**Key Widgets:**
- Lag trend per topic
- Member assignment table
- Commit rate and failures
- Rebalancing history
- Processing rate by member
- Lag recovery projection

## Multi-Provider Templates

Different providers can have customized dashboards:

```yaml
dashboardTemplates:
  kafka:
    template: kafka-cluster-dashboard.json
  rabbitmq:
    template: rabbitmq-cluster-dashboard.json
  sqs:
    template: sqs-queue-dashboard.json
```

## Dashboard JSON Structure

Example dashboard template structure:

```json
{
  "name": "{{entity.name}} - Message Queue Cluster",
  "description": "Operational dashboard for {{entity.name}}",
  "permissions": "PUBLIC_READ_WRITE",
  "pages": [
    {
      "name": "Executive Overview",
      "widgets": [
        {
          "title": "Cluster Health Score",
          "visualization": "billboard",
          "configuration": {
            "queries": [
              {
                "accountId": "{{entity.accountId}}",
                "query": "SELECT latest(cluster.health.score) FROM MessageQueue WHERE entityGuid = '{{entity.id}}' SINCE 5 minutes ago"
              }
            ],
            "thresholds": [
              { "value": 90, "alertSeverity": "SUCCESS" },
              { "value": 70, "alertSeverity": "WARNING" },
              { "value": 0, "alertSeverity": "CRITICAL" }
            ]
          }
        }
      ]
    }
  ]
}
```

## NRQL Query Patterns

### Entity Filtering

By default, queries are filtered by entity GUID:
```sql
FROM MessageQueue 
SELECT average(broker.cpu.usage) 
WHERE entityGuid = '{{entity.id}}'
SINCE 30 minutes ago
```

### Relationship Queries

Query related entities:
```sql
FROM MessageQueue 
SELECT sum(topic.throughput.in.bytesPerSecond) 
WHERE clusterName = '{{tags.clusterName}}'
FACET topic
SINCE 1 hour ago
```

### Time-based Comparisons

Compare with previous period:
```sql
FROM MessageQueue 
SELECT average(cluster.health.score) as 'Current',
       average(cluster.health.score) as 'Previous' 
WHERE entityGuid = '{{entity.id}}'
SINCE 1 hour ago 
COMPARE WITH 1 hour ago
```

## Widget Best Practices

### Billboard Widgets
- Use for KPIs and current values
- Include thresholds for visual alerts
- Display units clearly

### Line Charts
- Default to 1-hour time window
- Include comparison with previous period
- Use appropriate aggregation (avg, sum, max)

### Tables
- Limit to top 20-50 rows
- Include actionable columns
- Sort by most relevant metric

### Heatmaps
- Useful for distribution analysis
- Resource utilization patterns
- Error hotspot identification

## Variables and Filters

### Dashboard Variables

```json
{
  "variables": [
    {
      "name": "environment",
      "type": "NRQL",
      "query": "FROM MessageQueue SELECT uniques(tags.environment) WHERE clusterName = '{{tags.clusterName}}'"
    },
    {
      "name": "topic",
      "type": "NRQL",
      "query": "FROM MessageQueue SELECT uniques(topic) WHERE clusterName = '{{tags.clusterName}}'"
    }
  ]
}
```

### Disable Auto-Filtering

For cross-entity queries:
```yaml
dashboardTemplates:
  newRelic:
    template: cluster-dashboard.json
    filterNRQLByEntityID: false
```

Then manually filter in queries:
```sql
WHERE entity.guid = '{{entity.id}}' OR tags.clusterName = '{{tags.clusterName}}'
```

## Creating Custom Dashboards

1. **Build in New Relic UI** - Use the dashboard builder
2. **Export as JSON** - Download dashboard configuration
3. **Sanitize** - Remove account-specific data
4. **Templatize** - Replace values with variables
5. **Test** - Validate with different entities

## Best Practices

1. **Consistent Layout** - Follow the 4-page structure
2. **Progressive Disclosure** - Overview → Details → Troubleshooting
3. **Performance** - Limit widgets per page (12-15 max)
4. **Time Windows** - Use consistent time ranges
5. **Mobile Friendly** - Consider mobile viewport
6. **Documentation** - Include helpful descriptions