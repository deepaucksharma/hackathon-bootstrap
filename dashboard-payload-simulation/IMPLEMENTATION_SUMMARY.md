# AWS MSK Message Queues UI Implementation Summary

## Executive Overview

After extensive research and testing based on New Relic's official entity definitions, we have successfully determined how to make AWS MSK entities appear in the New Relic Message Queues UI.

### Key Discoveries

1. **MessageQueueSample is Required**: The Message Queues UI only displays events with `eventType: "MessageQueueSample"`
2. **No Entity Synthesis for MSK**: AWS MSK entities (AWSMSKCLUSTER, AWSMSKBROKER, AWSMSKTOPIC) have no automatic synthesis rules
3. **Direct Event Submission Works**: Entities can be created directly via MessageQueueSample events without synthesis

## Implementation Architecture

```
┌─────────────────┐     ┌──────────────────┐     ┌─────────────────┐
│   Kafka JMX     │────▶│   nri-kafka      │────▶│ MessageQueue    │
│   Metrics       │     │   MSK Shim       │     │ Sample Events   │
└─────────────────┘     └──────────────────┘     └────────┬────────┘
                                                           │
┌─────────────────┐     ┌──────────────────┐              │
│  CloudWatch     │────▶│ Transformation   │──────────────┘
│  Metrics        │     │    Lambda        │              │
└─────────────────┘     └──────────────────┘              ▼
                                                  ┌─────────────────┐
                                                  │  Message Queues │
                                                  │       UI        │
                                                  └─────────────────┘
```

## Complete Solution

### 1. Event Structure

```javascript
{
  // Required Fields
  "eventType": "MessageQueueSample",        // MUST be this exact value
  "provider": "AwsMsk",                     // For filtering in UI
  "queue.name": "cluster-broker-1",         // Displayed in UI
  "entity.name": "cluster-broker-1",        // Entity identifier
  "entity.type": "AWSMSKBROKER",           // Use official NR types
  
  // Recommended Fields
  "collector.name": "cloudwatch-metric-streams",
  "queue.type": "kafka_broker",             // kafka_cluster, kafka_broker, kafka_topic
  "timestamp": 1234567890000,
  
  // AWS Context (for relationships)
  "awsAccountId": "123456789012",
  "awsRegion": "us-east-1",
  "awsMskClusterName": "my-cluster",
  "awsMskBrokerId": "1",                    // For brokers only
  
  // Metrics (queue.* prefix for UI visibility)
  "queue.cpuPercent": 35.5,
  "queue.bytesInPerSecond": 1500000,
  "queue.messagesPerSecond": 1000
}
```

### 2. Entity Type Mapping

| Entity | Official Type | Queue Type | Identifier Pattern |
|--------|--------------|------------|-------------------|
| Cluster | AWSMSKCLUSTER | kafka_cluster | `{clusterName}` |
| Broker | AWSMSKBROKER | kafka_broker | `{clusterName}-broker-{id}` |
| Topic | AWSMSKTOPIC | kafka_topic | `{clusterName}-{topicName}` |

### 3. Metric Mappings

#### Cluster Metrics
- `ActiveControllerCount` → `queue.activeControllers`
- `GlobalPartitionCount` → `queue.globalPartitions`
- `OfflinePartitionsCount` → `queue.offlinePartitions`

#### Broker Metrics
- `BytesInPerSec` → `queue.bytesInPerSecond`
- `MessagesInPerSec` → `queue.messagesPerSecond`
- `CpuUser` → `queue.cpuPercent`

#### Topic Metrics
- `MessagesInPerSec` → `queue.messagesPerSecond`
- `SumOffsetLag` → `queue.consumerLag`

## Implementation Options

### Option 1: nri-kafka MSK Shim (Recommended)

Modify the MSK shim to output MessageQueueSample events:

```go
func TransformToMessageQueue(sample *DimensionalMetricSample) map[string]interface{} {
    return map[string]interface{}{
        "eventType": "MessageQueueSample",
        "provider": "AwsMsk",
        "entity.type": determineEntityType(sample),
        "queue.name": sample.EntityName,
        // ... map metrics
    }
}
```

**Pros**: Integrated with existing infrastructure, real-time metrics
**Cons**: Requires nri-kafka deployment

### Option 2: CloudWatch Metric Streams

Use Lambda to transform CloudWatch metrics:

```python
def transform_to_messagequeue(metric_data):
    return {
        'eventType': 'MessageQueueSample',
        'provider': 'AwsMsk',
        'entity.type': determine_entity_type(metric_data),
        # ... map metrics
    }
```

**Pros**: Serverless, scalable
**Cons**: CloudWatch delays, additional AWS costs

### Option 3: Direct API Submission

Submit events directly via Event API:

```javascript
const event = {
    eventType: 'MessageQueueSample',
    provider: 'AwsMsk',
    // ... build event
};
await submitToNewRelic([event]);
```

**Pros**: Simple, flexible
**Cons**: Requires custom implementation

## Validation

### 1. Verify Events Arriving
```sql
FROM MessageQueueSample 
SELECT count(*) 
WHERE provider = 'AwsMsk' 
SINCE 10 minutes ago
```

### 2. Check UI Visibility
Navigate to: **New Relic One > Infrastructure > Third-party services > Message queues**

### 3. Monitor Health
```sql
FROM MessageQueueSample 
SELECT latest(queue.offlinePartitions), latest(queue.cpuPercent)
WHERE provider = 'AwsMsk' 
FACET entity.name
```

## Production Checklist

- [ ] Choose implementation option (nri-kafka shim recommended)
- [ ] Implement MessageQueueSample transformation
- [ ] Map all required metrics with queue.* prefix
- [ ] Include AWS context fields for relationships
- [ ] Test with sample data
- [ ] Validate in Message Queues UI
- [ ] Set up monitoring dashboards
- [ ] Configure alert conditions
- [ ] Document custom implementation
- [ ] Plan rollout strategy

## Files in This Repository

1. **FINAL_MSK_QUEUES_UI_SOLUTION.md** - Complete solution details
2. **PRODUCTION_IMPLEMENTATION_GUIDE.md** - Production-ready code templates
3. **NRQL_VALIDATION_QUERIES.md** - Comprehensive query library
4. **msk-shim-messagequeue-integration.go** - Go implementation template
5. **test-messagequeue-solution.js** - Working test script

## Key Takeaways

1. **MessageQueueSample is the only way** to get entities in the Message Queues UI
2. **Entity synthesis is not required** since MSK entities have no synthesis rules
3. **All metrics can be embedded** directly in MessageQueueSample events
4. **Use official entity types** (AWSMSKCLUSTER, etc.) from New Relic definitions
5. **Include queue.* prefixed metrics** for UI visibility

## Next Steps

1. Implement the chosen solution in your environment
2. Test with a subset of clusters
3. Monitor for data quality and completeness
4. Roll out to all MSK clusters
5. Create custom dashboards and alerts

This solution provides complete visibility of AWS MSK clusters in the New Relic Message Queues UI without depending on entity synthesis.