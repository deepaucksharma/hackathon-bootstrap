# Summary Metrics - Message Queue Entities

Summary metrics are displayed in the Entity Explorer list view, providing at-a-glance operational status for message queue entities.

## Overview

Summary metrics appear as columns in the entity list, allowing quick comparison and identification of issues across multiple entities. We recommend defining 3 summary metrics per entity type, typically referencing golden metrics.

## MESSAGE_QUEUE_CLUSTER

```yaml
summaryMetrics:
  healthScore:
    title: Health Score
    unit: PERCENTAGE
    goldenMetric: healthScore
    
  totalThroughput:
    title: Total Throughput
    unit: BYTES_PER_SECOND
    goldenMetric: totalThroughput
    
  errorRate:
    title: Error Rate
    unit: PERCENTAGE
    goldenMetric: errorRate
```

### Display Example
| Cluster Name | Health Score | Total Throughput | Error Rate |
|-------------|--------------|------------------|------------|
| prod-kafka-us-east | 95% | 125 MB/s | 0.02% |
| prod-kafka-eu-west | 87% | 89 MB/s | 0.15% |
| staging-kafka | 100% | 12 MB/s | 0.00% |

## MESSAGE_QUEUE_BROKER

```yaml
summaryMetrics:
  cpuUsage:
    title: CPU Usage
    unit: PERCENTAGE
    goldenMetric: cpuUsage
    
  networkThroughput:
    title: Network I/O
    unit: BYTES_PER_SECOND
    goldenMetric: networkThroughput
    
  partitionCount:
    title: Partitions
    unit: COUNT
    tag:
      key: partitionCount
```

## MESSAGE_QUEUE_TOPIC

```yaml
summaryMetrics:
  messagesInRate:
    title: Messages In/sec
    unit: MESSAGES_PER_SECOND
    goldenMetric: messagesInRate
    
  consumerLag:
    title: Consumer Lag
    unit: COUNT
    goldenMetric: consumerLag
    
  partitionCount:
    title: Partitions
    unit: COUNT
    tag:
      key: partitions
```

## MESSAGE_QUEUE_QUEUE

```yaml
summaryMetrics:
  queueDepth:
    title: Queue Depth
    unit: COUNT
    goldenMetric: queueDepth
    
  throughputRate:
    title: Message Rate
    unit: MESSAGES_PER_SECOND
    queries:
      newRelic:
        select: rate(sum(queue.messages.in + queue.messages.out), 1 second)
        from: MessageQueue
        
  processingTime:
    title: Processing Time
    unit: MS
    goldenMetric: processingTime
```

## MESSAGE_QUEUE_CONSUMER_GROUP

```yaml
summaryMetrics:
  totalLag:
    title: Total Lag
    unit: COUNT
    goldenMetric: totalLag
    
  memberCount:
    title: Members
    unit: COUNT
    goldenMetric: memberCount
    
  lagTrend:
    title: Lag Trend
    unit: COUNT
    queries:
      newRelic:
        select: derivative(consumer.lag.total, 1 minute)
        from: MessageQueue
```

## Configuration Options

### Golden Metric Reference

Most summary metrics reference existing golden metrics:

```yaml
summaryMetrics:
  metricName:
    title: Display Title
    unit: METRIC_UNIT
    goldenMetric: goldenMetricKey
```

### Tag-based Metrics

For simple tag values:

```yaml
summaryMetrics:
  environment:
    title: Environment
    unit: STRING
    tag:
      key: environment
```

### Custom Queries

For calculated metrics not defined as golden metrics:

```yaml
summaryMetrics:
  utilizationScore:
    title: Utilization
    unit: PERCENTAGE
    queries:
      newRelic:
        select: (avg(broker.cpu.usage) + avg(broker.memory.usage)) / 2
        from: MessageQueue
        where: entityType = 'MESSAGE_QUEUE_BROKER'
```

## Units

Supported units for summary metrics:

- **Rate Units**: REQUESTS_PER_SECOND, MESSAGES_PER_SECOND, OPERATIONS_PER_SECOND
- **Size Units**: BYTES, BYTES_PER_SECOND, BITS_PER_SECOND
- **Time Units**: SECONDS, MS
- **Count Units**: COUNT, PERCENTAGE
- **Other**: STRING (for tag values), APDEX, TIMESTAMP

## Best Practices

### Metric Selection

1. **Health Indicator** - One metric showing overall health
2. **Activity Indicator** - One metric showing throughput/usage
3. **Problem Indicator** - One metric highlighting issues

### Visual Design

- **Use consistent units** across similar metrics
- **Leverage color coding** with thresholds
- **Keep titles short** for column width
- **Round appropriately** (2 decimal places max)

### Performance

- **Reference golden metrics** when possible
- **Avoid complex calculations** in list view
- **Use latest() for point-in-time values**
- **Cache tag values** to reduce lookups

## Implementation Example

```typescript
interface SummaryMetric {
  title: string;
  unit: MetricUnit;
  goldenMetric?: string;
  tag?: { key: string };
  queries?: { [provider: string]: Query };
}

const clusterSummaryMetrics: Record<string, SummaryMetric> = {
  healthScore: {
    title: "Health Score",
    unit: "PERCENTAGE",
    goldenMetric: "healthScore"
  },
  totalThroughput: {
    title: "Total Throughput", 
    unit: "BYTES_PER_SECOND",
    goldenMetric: "totalThroughput"
  },
  brokerCount: {
    title: "Brokers",
    unit: "COUNT",
    tag: { key: "brokerCount" }
  }
};

function renderSummaryMetrics(entity: Entity): SummaryMetricValues {
  const values = {};
  
  for (const [key, config] of Object.entries(clusterSummaryMetrics)) {
    if (config.goldenMetric) {
      values[key] = entity.goldenMetrics[config.goldenMetric];
    } else if (config.tag) {
      values[key] = entity.tags[config.tag.key];
    }
  }
  
  return values;
}
```

## Multi-Provider Considerations

Different providers may show different summary metrics:

```yaml
# Kafka topics show partitions
summaryMetrics:
  partitions:
    title: Partitions
    unit: COUNT
    tag:
      key: partitionCount

# RabbitMQ queues show consumers
summaryMetrics:
  consumers:
    title: Consumers
    unit: COUNT
    tag:
      key: consumerCount

# SQS queues show visibility timeout
summaryMetrics:
  visibilityTimeout:
    title: Visibility Timeout
    unit: SECONDS
    tag:
      key: visibilityTimeout
```

## Color Coding Thresholds

Summary metrics can include thresholds for visual indicators:

```yaml
summaryMetrics:
  healthScore:
    title: Health Score
    unit: PERCENTAGE
    goldenMetric: healthScore
    thresholds:
      - value: 90
        severity: NORMAL
        color: green
      - value: 70
        severity: WARNING
        color: yellow
      - value: 0
        severity: CRITICAL
        color: red
```

## Migration from Legacy

When migrating from custom summary metrics to golden metric references:

1. Identify existing summary metric queries
2. Create corresponding golden metrics
3. Update summary metrics to reference golden metrics
4. Test in staging environment
5. Deploy with monitoring