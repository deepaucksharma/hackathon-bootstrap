# Final AWS MSK Message Queues UI Solution

## Executive Summary

After extensive testing and analysis of New Relic's entity definitions, we've discovered:

1. **AWS MSK entities have NO automatic synthesis rules** in New Relic
2. **MessageQueueSample is the ONLY event type** that appears in the Message Queues UI
3. **Entity synthesis is NOT required** for UI visibility

## The Solution: MessageQueueSample-Only Strategy

### Why This Works

- MSK entities (AWSMSKCLUSTER, AWSMSKBROKER, AWSMSKTOPIC) don't have synthesis rules
- The Message Queues UI specifically queries `MessageQueueSample` events
- All metrics and relationships can be embedded directly in MessageQueueSample

### Complete Working Example

```javascript
// For AWS MSK Cluster
{
  "eventType": "MessageQueueSample",
  "timestamp": Date.now(),
  "provider": "AwsMsk",
  "collector.name": "cloudwatch-metric-streams",
  
  // Queue identification (REQUIRED)
  "queue.name": "production-msk-cluster",
  "queue.type": "kafka_cluster",
  
  // Entity identification (REQUIRED)
  "entity.name": "production-msk-cluster",
  "entity.type": "AWSMSKCLUSTER",  // Official NR type
  
  // Queue metrics (visible in UI)
  "queue.activeControllers": 1,
  "queue.globalPartitions": 30,
  "queue.offlinePartitions": 0,
  "queue.brokerCount": 3,
  
  // AWS context (for relationships)
  "awsAccountId": "123456789012",
  "awsRegion": "us-east-1",
  "awsMskClusterName": "production-msk-cluster",
  "aws.accountId": "123456789012",
  "aws.availabilityZone": "us-east-1a",
  
  // Embed CloudWatch metrics
  "activeControllers": 1,
  "globalPartitions": 30,
  "offlinePartitions": 0
}

// For AWS MSK Broker
{
  "eventType": "MessageQueueSample",
  "timestamp": Date.now(),
  "provider": "AwsMsk",
  "collector.name": "cloudwatch-metric-streams",
  
  "queue.name": "production-msk-cluster-broker-1",
  "queue.type": "kafka_broker",
  
  "entity.name": "production-msk-cluster-broker-1",
  "entity.type": "AWSMSKBROKER",
  
  // Queue metrics
  "queue.incomingMessagesPerSecond": 1500,
  "queue.bytesInPerSecond": 1500000,
  "queue.bytesOutPerSecond": 1200000,
  "queue.cpuPercent": 35.5,
  "queue.networkRxDropped": 0,
  "queue.networkTxDropped": 0,
  
  // Relationship fields
  "awsAccountId": "123456789012",
  "awsRegion": "us-east-1",
  "awsMskClusterName": "production-msk-cluster",
  "awsMskBrokerId": "1",
  
  // Golden metrics
  "incomingMessagesPerSecond": 1500,
  "networkRxDropped": 0,
  "networkTxDropped": 0
}

// For AWS MSK Topic
{
  "eventType": "MessageQueueSample",
  "timestamp": Date.now(),
  "provider": "AwsMsk",
  "collector.name": "cloudwatch-metric-streams",
  
  "queue.name": "production-msk-cluster-orders",
  "queue.type": "kafka_topic",
  
  "entity.name": "production-msk-cluster-orders",
  "entity.type": "AWSMSKTOPIC",
  
  // Queue metrics
  "queue.messagesPerSecond": 500,
  "queue.bytesInPerSecond": 500000,
  "queue.bytesOutPerSecond": 400000,
  "queue.consumerLag": 1000,
  "queue.partitionCount": 10,
  "queue.replicationFactor": 3,
  
  // Relationship fields
  "awsAccountId": "123456789012",
  "awsRegion": "us-east-1",
  "awsMskClusterName": "production-msk-cluster"
}
```

## Key Requirements

### 1. Event Type
- **MUST** be `"eventType": "MessageQueueSample"`
- Other event types (AwsMskBrokerSample, etc.) won't appear in UI

### 2. Entity Types (from official definitions)
- Cluster: `"entity.type": "AWSMSKCLUSTER"`
- Broker: `"entity.type": "AWSMSKBROKER"`
- Topic: `"entity.type": "AWSMSKTOPIC"`

### 3. Required Fields
```javascript
{
  "eventType": "MessageQueueSample",      // Required
  "provider": "AwsMsk",                   // Required for filtering
  "collector.name": "cloudwatch-metric-streams", // Recommended
  "queue.name": "unique-identifier",      // Required for UI display
  "queue.type": "kafka_cluster|kafka_broker|kafka_topic", // Recommended
  "entity.name": "entity-identifier",     // Required
  "entity.type": "AWSMSK*",              // Required (see above)
}
```

### 4. Metrics Naming
- Use `queue.*` prefix for UI-visible metrics
- Embed original metric names for compatibility
- Example: both `queue.cpuPercent` and `cpuUser` 

### 5. Relationship Fields
Include these for future relationship support:
- `awsAccountId`
- `awsRegion` 
- `awsMskClusterName`
- `awsMskBrokerId` (for brokers)

## Implementation in nri-kafka MSK Shim

```go
// Transform MSK metrics to MessageQueueSample
func transformToMessageQueue(sample *types.DimensionalMetricSample) map[string]interface{} {
    event := map[string]interface{}{
        "eventType":      "MessageQueueSample",
        "timestamp":      time.Now().UnixMilli(),
        "provider":       "AwsMsk",
        "collector.name": "cloudwatch-metric-streams",
    }
    
    // Determine entity type and queue type
    switch {
    case strings.Contains(sample.Name, "Cluster"):
        event["entity.type"] = "AWSMSKCLUSTER"
        event["queue.type"] = "kafka_cluster"
    case strings.Contains(sample.Name, "Broker"):
        event["entity.type"] = "AWSMSKBROKER"
        event["queue.type"] = "kafka_broker"
    case strings.Contains(sample.Name, "Topic"):
        event["entity.type"] = "AWSMSKTOPIC"
        event["queue.type"] = "kafka_topic"
    }
    
    // Set queue.name and entity.name
    event["queue.name"] = sample.EntityName
    event["entity.name"] = sample.EntityName
    
    // Map metrics to queue.* namespace
    for key, value := range sample.Metrics {
        // Add both queue.* and original metric name
        queueKey := fmt.Sprintf("queue.%s", key)
        event[queueKey] = value
        event[key] = value
    }
    
    // Add AWS context
    event["awsAccountId"] = sample.AccountID
    event["awsRegion"] = sample.Region
    event["awsMskClusterName"] = sample.ClusterName
    
    return event
}
```

## Benefits of This Approach

1. **Immediate UI Visibility** - No waiting for entity synthesis
2. **No Synthesis Dependencies** - Works without synthesis rules
3. **Full Metrics Support** - All metrics available for dashboards
4. **Simpler Implementation** - Single event type strategy
5. **Future Compatible** - Includes fields for relationships

## Testing & Validation

Use the provided test script to validate:
```bash
./test-messagequeue-only-strategy.js
```

Expected results:
- ✅ Events appear in MessageQueueSample
- ✅ Entities visible in Message Queues UI
- ✅ Metrics available for querying
- ✅ Proper entity types displayed

## Summary

The Message Queues UI in New Relic requires `MessageQueueSample` events. Since AWS MSK entities don't have automatic synthesis rules, the best approach is to:

1. Send ONLY MessageQueueSample events
2. Use official entity types (AWSMSKCLUSTER, etc.)
3. Embed all metrics with queue.* prefix
4. Include relationship fields for future compatibility

This provides complete visibility in the Message Queues UI without depending on entity synthesis.