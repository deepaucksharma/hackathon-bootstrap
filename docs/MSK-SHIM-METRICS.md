# MSK Shim Metrics Quick Reference

## Cluster Metrics (AwsMskClusterSample)

| Metric | JMX Source | Aggregation | Critical Notes |
|--------|------------|-------------|----------------|
| `activeControllerCount.Sum` | `KafkaController` | MAX | Must be exactly 1 |
| `offlinePartitionsCount.Sum` | `KafkaController` | MAX | Alert if > 0 |
| `underReplicatedPartitions.Sum` | `ReplicaManager` | **MAX** ⚠️ | Not SUM! Fixed in transformer.go:536 |
| `bytesInPerSec.Sum` | `BrokerTopicMetrics` | SUM | Cluster total throughput |
| `globalPartitionCount` | Topic metadata | SUM | Total partitions |

## Broker Metrics (AwsMskBrokerSample)

### Throughput (P0)
| Metric | Source |
|--------|--------|
| `bytesInPerSec.Average` | `BrokerTopicMetrics` |
| `bytesOutPerSec.Average` | `BrokerTopicMetrics` |
| `messagesInPerSec.Average` | `BrokerTopicMetrics` |
| `bytesRejectedPerSec.Average` | `BrokerTopicMetrics` (default 0) |

### Latency Breakdown (P0)
| Request Type | Metrics | Purpose |
|--------------|---------|---------|
| FetchConsumer | LocalTimeMs, RequestQueueTimeMs, ResponseSendTimeMs, TotalTimeMs | Consumer latency analysis |
| Produce | LocalTimeMs, RequestQueueTimeMs, ResponseSendTimeMs, TotalTimeMs | Producer latency analysis |

### Resources (P0)
| Metric | Source | Notes |
|--------|--------|-------|
| `cpuUser.Average` | SystemSample | From Infrastructure agent |
| `memoryUsed.Average` | SystemSample | Percentage used |
| `kafkaDataLogsDiskUsed.Average` | StorageSample | Filtered by DISK_MOUNT_REGEX |
| `networkRxThroughput.Average` | NetworkSample | Bytes per second |

### Handler Utilization (P1)
| Metric | Conversion |
|--------|------------|
| `requestHandlerAvgIdlePercent.Average` | × 100 if ≤ 1.0 |
| `networkProcessorAvgIdlePercent.Average` | × 100 if ≤ 1.0 |

## Topic Metrics (AwsMskTopicSample)

| Metric | Aggregation | Notes |
|--------|-------------|-------|
| `bytesInPerSec.Average` | SUM across brokers | Topic throughput |
| `partitionCount` | Direct | From metadata |
| `replicationFactor` | Direct | From metadata |
| `consumerLag` | SUM across partitions | If lag enrichment enabled |

## Common Pitfalls

### 1. Wrong Aggregation
```go
// ❌ WRONG
sum(broker.UnderReplicatedPartitions)

// ✅ CORRECT
max(broker.UnderReplicatedPartitions)
```

### 2. Missing Latency Metrics
Ensure JMX beans configured:
```yaml
- object_name: "kafka.network:type=RequestMetrics,name=*,request=FetchConsumer"
- object_name: "kafka.network:type=RequestMetrics,name=*,request=Produce"
```

### 3. Disk Usage Not Showing
Set regex patterns:
```bash
DISK_MOUNT_REGEX="data|kafka|storage"
LOG_MOUNT_REGEX="logs|kafka-logs"
```

## V2 Metrics (Optional)

Enable with `ENABLE_BROKER_TOPIC_METRICS_V2=true`:
- `broker.ActiveControllerCount`
- `broker.GlobalPartitionCount`
- `broker.bytesReadFromTopicPerSecond`
- `broker.messagesProducedToTopicPerSecond`