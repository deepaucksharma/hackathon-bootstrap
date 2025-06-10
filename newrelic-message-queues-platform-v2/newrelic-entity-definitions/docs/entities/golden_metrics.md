# Golden Metrics - Message Queue Entities

Golden metrics are the most important metrics for each message queue entity type. They provide quick insights into entity health and performance.

## Overview

Each entity type has specific golden metrics that best represent its operational state. These metrics are displayed prominently in the New Relic UI and used for alerting.

## MESSAGE_QUEUE_CLUSTER

### Health Score
```yaml
healthScore:
  title: Cluster Health Score
  unit: PERCENTAGE
  queries:
    newRelic:
      select: latest(cluster.health.score)
      from: MessageQueue
      where: entityType = 'MESSAGE_QUEUE_CLUSTER'
  displayAsValue: true
```

### Total Throughput
```yaml
totalThroughput:
  title: Total Throughput
  unit: BYTES_PER_SECOND
  queries:
    newRelic:
      select: sum(cluster.throughput.in.bytesPerSec + cluster.throughput.out.bytesPerSec)
      from: MessageQueue
      where: entityType = 'MESSAGE_QUEUE_CLUSTER'
```

### Error Rate
```yaml
errorRate:
  title: Error Rate
  unit: PERCENTAGE
  queries:
    newRelic:
      select: average(cluster.error.rate)
      from: MessageQueue
      where: entityType = 'MESSAGE_QUEUE_CLUSTER'
```

### Availability
```yaml
availability:
  title: Cluster Availability
  unit: PERCENTAGE
  queries:
    newRelic:
      select: average(cluster.availability.percentage)
      from: MessageQueue
      where: entityType = 'MESSAGE_QUEUE_CLUSTER'
  displayAsValue: true
```

## MESSAGE_QUEUE_BROKER

### CPU Usage
```yaml
cpuUsage:
  title: CPU Usage
  unit: PERCENTAGE
  queries:
    newRelic:
      select: average(broker.cpu.usage)
      from: MessageQueue
      where: entityType = 'MESSAGE_QUEUE_BROKER'
```

### Memory Usage
```yaml
memoryUsage:
  title: Memory Usage
  unit: PERCENTAGE
  queries:
    newRelic:
      select: average(broker.memory.usage)
      from: MessageQueue
      where: entityType = 'MESSAGE_QUEUE_BROKER'
```

### Network Throughput
```yaml
networkThroughput:
  title: Network Throughput
  unit: BYTES_PER_SECOND
  queries:
    newRelic:
      select: sum(broker.network.in.bytesPerSecond + broker.network.out.bytesPerSecond)
      from: MessageQueue
      where: entityType = 'MESSAGE_QUEUE_BROKER'
```

### Request Latency P99
```yaml
requestLatency:
  title: Request Latency (P99)
  unit: MS
  queries:
    newRelic:
      select: percentile(broker.request.latency, 99)
      from: MessageQueue
      where: entityType = 'MESSAGE_QUEUE_BROKER'
  displayAsValue: true
```

## MESSAGE_QUEUE_TOPIC

### Messages In Rate
```yaml
messagesInRate:
  title: Messages In Rate
  unit: MESSAGES_PER_SECOND
  queries:
    newRelic:
      select: rate(sum(topic.messages.in), 1 second)
      from: MessageQueue
      where: entityType = 'MESSAGE_QUEUE_TOPIC'
```

### Messages Out Rate
```yaml
messagesOutRate:
  title: Messages Out Rate
  unit: MESSAGES_PER_SECOND
  queries:
    newRelic:
      select: rate(sum(topic.messages.out), 1 second)
      from: MessageQueue
      where: entityType = 'MESSAGE_QUEUE_TOPIC'
```

### Consumer Lag
```yaml
consumerLag:
  title: Total Consumer Lag
  unit: COUNT
  queries:
    newRelic:
      select: sum(topic.consumer.lag.sum)
      from: MessageQueue
      where: entityType = 'MESSAGE_QUEUE_TOPIC'
  displayAsValue: true
```

### Error Rate
```yaml
errorRate:
  title: Topic Error Rate
  unit: PERCENTAGE
  queries:
    newRelic:
      select: (sum(topic.errors) / sum(topic.messages.total)) * 100
      from: MessageQueue
      where: entityType = 'MESSAGE_QUEUE_TOPIC'
```

## MESSAGE_QUEUE_QUEUE

### Queue Depth
```yaml
queueDepth:
  title: Queue Depth
  unit: COUNT
  queries:
    newRelic:
      select: latest(queue.depth)
      from: MessageQueue
      where: entityType = 'MESSAGE_QUEUE_QUEUE'
  displayAsValue: true
```

### Throughput In
```yaml
throughputIn:
  title: Messages Enqueued
  unit: MESSAGES_PER_SECOND
  queries:
    newRelic:
      select: rate(sum(queue.messages.in), 1 second)
      from: MessageQueue
      where: entityType = 'MESSAGE_QUEUE_QUEUE'
```

### Throughput Out
```yaml
throughputOut:
  title: Messages Dequeued
  unit: MESSAGES_PER_SECOND
  queries:
    newRelic:
      select: rate(sum(queue.messages.out), 1 second)
      from: MessageQueue
      where: entityType = 'MESSAGE_QUEUE_QUEUE'
```

### Processing Time
```yaml
processingTime:
  title: Average Processing Time
  unit: MS
  queries:
    newRelic:
      select: average(queue.processing.time)
      from: MessageQueue
      where: entityType = 'MESSAGE_QUEUE_QUEUE'
```

## MESSAGE_QUEUE_CONSUMER_GROUP

### Total Lag
```yaml
totalLag:
  title: Total Consumer Lag
  unit: COUNT
  queries:
    newRelic:
      select: sum(consumer.lag.total)
      from: MessageQueue
      where: entityType = 'MESSAGE_QUEUE_CONSUMER_GROUP'
  displayAsValue: true
```

### Maximum Lag
```yaml
maxLag:
  title: Maximum Partition Lag
  unit: COUNT
  queries:
    newRelic:
      select: max(consumer.lag.max)
      from: MessageQueue
      where: entityType = 'MESSAGE_QUEUE_CONSUMER_GROUP'
  displayAsValue: true
```

### Member Count
```yaml
memberCount:
  title: Active Members
  unit: COUNT
  queries:
    newRelic:
      select: uniqueCount(consumer.member.id)
      from: MessageQueue
      where: entityType = 'MESSAGE_QUEUE_CONSUMER_GROUP'
  displayAsValue: true
```

### Commit Rate
```yaml
commitRate:
  title: Offset Commit Rate
  unit: OPERATIONS_PER_SECOND
  queries:
    newRelic:
      select: rate(sum(consumer.commits), 1 second)
      from: MessageQueue
      where: entityType = 'MESSAGE_QUEUE_CONSUMER_GROUP'
```

## Multi-Provider Support

Different providers may require different metric implementations:

```yaml
consumerLag:
  title: Consumer Lag
  unit: COUNT
  queries:
    # Kafka implementation
    kafka:
      select: sum(kafka.consumer.lag)
      from: KafkaOffsetSample
      where: "provider = 'kafka'"
    
    # RabbitMQ implementation
    rabbitmq:
      select: sum(rabbitmq.queue.messages.ready)
      from: RabbitmqQueueSample
      where: "provider = 'rabbitmq'"
    
    # SQS implementation
    sqs:
      select: latest(aws.sqs.approximateNumberOfMessagesVisible)
      from: QueueSample
      where: "provider = 'SqsQueue'"
```

## Implementation Guidelines

### Metric Naming Convention

All metrics follow hierarchical naming:
- `{entityType}.{category}.{metric}[.{qualifier}]`

Examples:
- `cluster.throughput.in.bytesPerSec`
- `broker.request.latency.p99`
- `topic.consumer.lag.max`

### Performance Considerations

1. **Use `latest()` for gauge metrics** - Current values like queue depth
2. **Use `rate()` for counter metrics** - Message rates, byte rates
3. **Use `average()` for sampled metrics** - CPU, memory usage
4. **Use `percentile()` for latency metrics** - P50, P95, P99

### Display Options

- `displayAsValue: true` - Show as single value instead of time series
- `unit` - Enables automatic unit conversion (bytes → MB/GB)

### Alert Thresholds

Recommended alert thresholds:

| Metric | Warning | Critical |
|--------|---------|----------|
| Cluster Health Score | < 80 | < 60 |
| CPU Usage | > 70% | > 85% |
| Memory Usage | > 80% | > 90% |
| Consumer Lag | > 10k | > 100k |
| Error Rate | > 1% | > 5% |
| Queue Depth | > 100k | > 1M |

## Best Practices

1. **Limit to essential metrics** - Maximum 10 golden metrics per entity type
2. **Focus on actionable metrics** - Metrics that drive operational decisions
3. **Include both performance and reliability** - Balance throughput with error rates
4. **Provider-agnostic when possible** - Abstract provider differences
5. **Consider business impact** - Metrics that relate to SLOs/SLAs