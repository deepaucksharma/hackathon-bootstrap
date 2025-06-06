# Reverse Engineering CloudWatch Metric Streams Format

## The Hypothesis

If we can send metrics that look EXACTLY like CloudWatch Metric Streams metrics, entity synthesis should work!

## What We Know from Entity Definitions

### From `INFRA-AWSMSKBROKER-to-INFRA-AWSMSKTOPIC.yml`:
```yaml
conditions:
  - EventType = 'Metric'
  - EntityType IN ('AWSMSKTOPIC', 'AWS_MSK_TOPIC')
  - CollectorName = 'cloudwatch-metric-streams'
```

### Key Requirements:
1. **EventType**: Must be 'Metric' (not Event)
2. **CollectorName**: Must be 'cloudwatch-metric-streams'
3. **EntityType**: Must match expected values

## Analyzing Reference Account Data

From account 3026020 (86.7% working), we need to see:
```sql
-- Check the exact metric structure
FROM Metric 
SELECT * 
WHERE collector.name = 'cloudwatch-metric-streams'
AND metricName LIKE '%kafka%'
LIMIT 10
```

## The Reverse Engineering Plan

### Step 1: Modify Metric API Client

```go
// In metric_api_client.go
func (c *MetricAPIClient) SendMetricWithCollector(name string, value float64, attributes map[string]interface{}) error {
    // Force the collector name
    attributes["collector.name"] = "cloudwatch-metric-streams"
    attributes["instrumentation.source"] = "cloudwatch"
    
    // Add AWS CloudWatch specific attributes
    attributes["aws.Namespace"] = "AWS/Kafka"
    attributes["aws.MetricName"] = name
    
    // Send as CloudWatch would
    return c.SendGaugeMetric(name, value, attributes)
}
```

### Step 2: Match CloudWatch Metric Names

CloudWatch MSK metrics have specific names:
```
AWS/Kafka:
- BrokerDiskUsage
- BytesInPerSec
- BytesOutPerSec
- CpuIdle
- CpuSystem
- CpuUser
- FetchConsumerRequestQueueTimeMs
- GlobalPartitionCount
- GlobalTopicCount
- KafkaDataLogDiskUsed
- MemoryFree
- MemoryUsed
- MessagesInPerSec
- NetworkRxPackets
- NetworkTxPackets
- OfflinePartitionsCount
- ProduceRequestQueueTimeMs
- RequestHandlerAvgIdlePercent
- UnderReplicatedPartitions
```

### Step 3: Transform Our Metrics

```go
// Map our metrics to CloudWatch format
func transformToCloudWatchMetric(kafkaMetric string) string {
    mapping := map[string]string{
        "kafka.broker.bytesIn": "BytesInPerSec",
        "kafka.broker.bytesOut": "BytesOutPerSec",
        "kafka.broker.messagesIn": "MessagesInPerSec",
        "kafka.broker.underReplicatedPartitions": "UnderReplicatedPartitions",
        // ... etc
    }
    return mapping[kafkaMetric]
}
```

### Step 4: Critical Attributes for Entity Synthesis

```go
attributes := map[string]interface{}{
    // Entity synthesis keys
    "entity.type": "AWS_KAFKA_BROKER",
    "entity.name": fmt.Sprintf("arn:aws:kafka:%s:%s:broker/%s/%s/%s", region, accountId, clusterName, clusterId, brokerId),
    "entity.guid": generateProperGUID(),
    
    // CloudWatch specific
    "collector.name": "cloudwatch-metric-streams",
    "eventType": "Metric",
    "instrumentation.provider": "cloudwatch",
    "instrumentation.source": "cloudwatch",
    
    // AWS dimensions (as CloudWatch sends them)
    "aws.accountId": accountId,
    "aws.region": region,
    "aws.kafka.clusterName": clusterName,
    "aws.kafka.brokerId": brokerId,
    
    // Additional CloudWatch attributes
    "aws.Namespace": "AWS/Kafka",
    "aws.Dimensions": []map[string]string{
        {"Name": "ClusterName", "Value": clusterName},
        {"Name": "BrokerID", "Value": brokerId},
    },
}
```

### Step 5: Send Metrics in CloudWatch Pattern

CloudWatch sends metrics with specific patterns:
1. All metrics for a dimension set come together
2. Timestamps are aligned
3. Metric names follow AWS naming convention

## Implementation Strategy

### 1. Create a CloudWatch Emulator

```go
type CloudWatchEmulator struct {
    metricClient *MetricAPIClient
    config       *MSKConfig
}

func (c *CloudWatchEmulator) EmitBrokerMetrics(brokerData map[string]interface{}) {
    // Create metric batch like CloudWatch would
    metrics := []MetricData{
        {
            Name: "BytesInPerSec",
            Value: brokerData["bytesIn"],
            Timestamp: time.Now().Unix() * 1000,
            Attributes: c.buildCloudWatchAttributes("broker", brokerData),
        },
        // ... more metrics
    }
    
    // Send batch
    c.metricClient.SendBatch(metrics)
}
```

### 2. Test with One Metric First

Start simple:
```go
// Just try to get one metric to synthesize an entity
metric := MetricData{
    Name: "BytesInPerSec",
    Type: "gauge",
    Value: 1000.0,
    Attributes: map[string]interface{}{
        "collector.name": "cloudwatch-metric-streams",
        "entity.type": "AWS_KAFKA_BROKER",
        "aws.accountId": "123456789012",
        "aws.region": "us-east-1",
        // ... etc
    },
}
```

## Potential Issues

1. **Authentication**: New Relic might validate the source
2. **Batch Format**: CloudWatch sends metrics in specific batch formats
3. **Timing**: Entity synthesis might expect specific timing patterns
4. **Additional Validation**: There might be server-side checks we don't know about

## Next Steps

1. Analyze exact metric format from working accounts
2. Build CloudWatch emulator
3. Test with minimal metric set
4. Iterate based on results

This is definitely worth trying!