# MessageQueue UI Solution - Complete Guide

## 🎯 The Discovery

The Message Queues UI in New Relic specifically looks for events with `eventType: "MessageQueueSample"` - NOT the standard entity event types like AwsMskBrokerSample or KafkaBrokerSample.

## ✅ Working Solution

### Required Event Structure

```javascript
{
  "eventType": "MessageQueueSample",  // MUST be MessageQueueSample
  "timestamp": Date.now(),
  "provider": "AwsMsk",               // Shows in UI under provider
  "collector.name": "cloudwatch-metric-streams",
  
  // Queue identification (REQUIRED)
  "queue.name": "cluster-name-topic-1",  // This appears in the UI
  "queue.type": "kafka_topic",          // Optional but helpful
  
  // Entity fields (REQUIRED for entity synthesis)
  "entity.name": "cluster-name-topic-1",
  "entity.type": "AWS_KAFKA_TOPIC",     // or AWS_KAFKA_BROKER, AWS_KAFKA_CLUSTER
  "entity.guid": "base64-encoded-guid",
  
  // Queue metrics (appear in UI)
  "queue.messagesPerSecond": 1000.0,
  "queue.bytesPerSecond": 1000000.0,
  "queue.consumerLag": 500,
  
  // AWS context (optional but recommended)
  "awsRegion": "us-east-1",
  "awsAccountId": "123456789012",
  "providerAccountId": "your-nr-account-id"
}
```

## 📊 Entity Type Mapping

### For AWS MSK Cluster
```javascript
{
  "eventType": "MessageQueueSample",
  "queue.name": "my-msk-cluster",
  "queue.type": "kafka_cluster",
  "entity.type": "AWS_KAFKA_CLUSTER",
  "queue.brokerCount": 3,
  "queue.activeConnections": 25
}
```

### For AWS MSK Broker
```javascript
{
  "eventType": "MessageQueueSample",
  "queue.name": "my-msk-cluster-broker-1",
  "queue.type": "kafka_broker",
  "entity.type": "AWS_KAFKA_BROKER",
  "queue.cpuPercent": 35.5,
  "queue.memoryPercent": 45.2,
  "queue.diskUsedPercent": 55.0
}
```

### For AWS MSK Topic
```javascript
{
  "eventType": "MessageQueueSample",
  "queue.name": "my-msk-cluster-orders",
  "queue.type": "kafka_topic",
  "entity.type": "AWS_KAFKA_TOPIC",
  "queue.partitionCount": 10,
  "queue.replicationFactor": 3,
  "queue.consumerLag": 1000
}
```

## 🔑 Key Insights

1. **MessageQueueSample is the Key**: The UI specifically queries this event type
2. **queue.name is Required**: This field appears in the UI and is used for filtering
3. **entity.type Determines Icon**: Use AWS_KAFKA_* types for proper icons
4. **Metrics Appear in UI**: queue.* metrics show up in the queue details

## 🚀 Implementation Strategy

### Option 1: Dual Event Submission
Submit BOTH MessageQueueSample (for UI) AND AwsMsk*Sample (for metrics):

```javascript
// For UI visibility
await submitEvent({
  "eventType": "MessageQueueSample",
  "queue.name": "my-cluster-topic-1",
  "entity.type": "AWS_KAFKA_TOPIC",
  // ... other fields
});

// For detailed metrics
await submitEvent({
  "eventType": "AwsMskTopicSample",
  "clusterName": "my-cluster",
  "topic.name": "topic-1",
  // ... metric fields
});
```

### Option 2: MessageQueueSample Only
Use only MessageQueueSample with all metrics embedded:

```javascript
{
  "eventType": "MessageQueueSample",
  "queue.name": "my-cluster-topic-1",
  "entity.type": "AWS_KAFKA_TOPIC",
  
  // Embed all metrics
  "queue.messagesPerSecond": 1000.0,
  "queue.bytesInPerSecond": 1000000.0,
  "msk.cpuUser.Average": 35.5,  // Custom attributes
  "msk.bytesInPerSec.Sum": 60000000.0
}
```

## 📝 Complete Working Example

```javascript
const timestamp = Date.now();
const clusterName = "production-msk-cluster";

// Submit cluster-level queue
await submitEvent({
  "eventType": "MessageQueueSample",
  "timestamp": timestamp,
  "provider": "AwsMsk",
  "collector.name": "cloudwatch-metric-streams",
  
  "queue.name": clusterName,
  "queue.type": "kafka_cluster",
  
  "entity.name": clusterName,
  "entity.type": "AWS_KAFKA_CLUSTER",
  "entity.guid": generateGuid("KAFKA_CLUSTER", clusterName),
  
  "queue.messagesPerSecond": 5000.0,
  "queue.bytesPerSecond": 5000000.0,
  "queue.brokerCount": 3,
  
  "awsRegion": "us-east-1",
  "awsAccountId": "123456789012"
});
```

## ⚠️ Important Notes

1. **Entity Synthesis Still Applies**: Include all required entity synthesis fields
2. **Relationships Work**: Entities created via MessageQueueSample can have relationships
3. **Metrics Can Be Mixed**: You can include both queue.* and provider.* metrics
4. **No Special Integration Required**: Works with standard Event API submission

## 🎉 Result

With this approach, your AWS MSK entities will:
- ✅ Appear in the Message Queues UI
- ✅ Show correct provider (AwsMsk)
- ✅ Display queue metrics
- ✅ Support filtering and search
- ✅ Link to entity details pages