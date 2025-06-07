# Leveraging Query Utils Insights for Kafka Entity Synthesis

## 🎯 Executive Summary

The query-utils-zone provides the **actual frontend code** that the New Relic Message Queues UI uses to query for Kafka/MSK data. This gives us the exact blueprint for what data format and fields the UI expects.

## 🔍 Key Discoveries from Query Utils

### 1. Event Types Expected by UI

The UI specifically queries for these event types:
```javascript
// From constants.ts
export const AWS_MSK_EVENT_TYPES = [
  'AwsMskBrokerSample',
  'AwsMskClusterSample', 
  'AwsMskTopicSample',
];
```

### 2. Provider Names Required

The UI filters for specific provider values:
```javascript
// From constants.ts
export const AWS_POLLING_HIDDEN_FILTERS_CONDITION =
  "provider IN ('AwsMskCluster', 'AwsMskBroker', 'AwsMskTopic')";
```

### 3. Required Fields for Each Event Type

#### AwsMskClusterSample
```javascript
{
  // Entity identification
  "provider.clusterName": "my-cluster",
  "provider": "AwsMskCluster",
  
  // Health metrics  
  "provider.activeControllerCount.Sum": 1,
  "provider.offlinePartitionsCount.Sum": 0,
  
  // Additional fields from query configs
  "provider.globalPartitionCount.Average": 50,
  "provider.globalTopicCount.Average": 10
}
```

#### AwsMskBrokerSample
```javascript
{
  // Entity identification
  "provider.clusterName": "my-cluster",
  "provider.brokerId": "1",
  "provider": "AwsMskBroker",
  
  // Performance metrics (with all aggregations)
  "provider.bytesInPerSec.Average": 1000000,
  "provider.bytesInPerSec.Sum": 60000000,
  "provider.bytesInPerSec.Maximum": 1500000,
  "provider.bytesInPerSec.Minimum": 500000,
  "provider.bytesInPerSec.SampleCount": 60,
  
  // Health metrics
  "provider.underReplicatedPartitions.Sum": 0,
  "provider.underMinIsrPartitionCount.Sum": 0
}
```

#### AwsMskTopicSample
```javascript
{
  // Entity identification
  "displayName": "orders",
  "provider.clusterName": "my-cluster",
  "provider": "AwsMskTopic",
  
  // Throughput metrics
  "provider.bytesInPerSec.Sum": 1000000,
  "provider.bytesOutPerSec.Sum": 800000,
  "provider.messagesInPerSec.Sum": 1000
}
```

### 4. GraphQL Entity Search Pattern

The UI searches for entities using:
```graphql
entitySearch(query: "type IN ('AWSMSKCLUSTER', 'AWSMSKBROKER', 'AWSMSKTOPIC') AND domain = 'INFRA'")
```

And specifically checks for:
```javascript
reportingEventTypes(filter: "AwsMskBrokerSample")
```

## 🚀 Implementation Strategy

### Step 1: Correct Event Structure

Based on query-utils analysis, our events MUST have:

```javascript
{
  "eventType": "AwsMskBrokerSample",  // NOT MessageQueueSample
  "timestamp": Date.now(),
  
  // Provider identification (CRITICAL)
  "provider": "AwsMskBroker",  // Specific type, not generic "AwsMsk"
  
  // Cluster relationship
  "provider.clusterName": "my-cluster",
  "provider.brokerId": "1",
  
  // Metrics with ALL aggregations
  "provider.bytesInPerSec.Average": 1000000,
  "provider.bytesInPerSec.Sum": 60000000,
  "provider.bytesInPerSec.Maximum": 1500000,
  "provider.bytesInPerSec.Minimum": 500000,
  "provider.bytesInPerSec.SampleCount": 60,
  
  // Entity synthesis fields
  "entityName": "1:my-cluster",
  "entityGuid": "base64-guid",
  
  // Collection metadata
  "collector.name": "cloud-integrations"  // or "cloudwatch-metric-streams"
}
```

### Step 2: Dual Data Source Support

The UI supports both polling and metric streams:

#### Polling Approach
- Uses AwsMsk*Sample events
- Provider fields with `.Average`, `.Sum` aggregations
- Better for entity synthesis

#### Metric Streams Approach
- Uses Metric event type
- `aws.kafka.*` attributes
- `entity.name`, `entity.guid` fields

### Step 3: Entity Type Mapping

Based on the GraphQL queries, entities must have:
- **Domain**: INFRA
- **Type**: AWSMSKCLUSTER, AWSMSKBROKER, AWSMSKTOPIC
- **Reporting**: Must report the corresponding Sample event type

## 📝 Corrected Payload Generator

```javascript
// Based on query-utils insights
function generateCorrectPayload(clusterName, brokerId) {
  const timestamp = Date.now();
  
  return {
    eventType: "AwsMskBrokerSample",
    timestamp: timestamp,
    
    // CRITICAL: Specific provider type
    provider: "AwsMskBroker",
    
    // Cluster relationship (used in faceting)
    "provider.clusterName": clusterName,
    "provider.brokerId": brokerId.toString(),
    
    // Entity identification
    entityName: `${brokerId}:${clusterName}`,
    entityGuid: generateEntityGuid("AWSMSKBROKER", `${clusterName}:${brokerId}`),
    
    // Required metrics with ALL aggregations
    "provider.bytesInPerSec.Average": 1000000,
    "provider.bytesInPerSec.Sum": 60000000,
    "provider.bytesInPerSec.Maximum": 1500000,
    "provider.bytesInPerSec.Minimum": 500000,
    "provider.bytesInPerSec.SampleCount": 60,
    
    "provider.bytesOutPerSec.Average": 800000,
    "provider.bytesOutPerSec.Sum": 48000000,
    "provider.bytesOutPerSec.Maximum": 1200000,
    "provider.bytesOutPerSec.Minimum": 400000,
    "provider.bytesOutPerSec.SampleCount": 60,
    
    // Health metrics
    "provider.underReplicatedPartitions.Sum": 0,
    "provider.underMinIsrPartitionCount.Sum": 0,
    
    // Collection metadata
    "collector.name": "cloud-integrations",
    
    // AWS context
    awsAccountId: "123456789012",
    awsRegion: "us-east-1"
  };
}
```

## 🔧 Integration with nri-kafka

For nri-kafka MSK shim implementation:

1. **Generate events matching the exact format** the UI queries expect
2. **Use specific provider types** (AwsMskBroker, not generic AwsMsk)
3. **Include all metric aggregations** (Average, Sum, Min, Max, SampleCount)
4. **Maintain cluster relationships** via provider.clusterName

## ✅ Validation Checklist

Based on query-utils, validate:

- [ ] Events use AwsMsk*Sample event types
- [ ] Provider field has specific type (AwsMskCluster/Broker/Topic)
- [ ] All metrics have 5 aggregations
- [ ] provider.clusterName links entities together
- [ ] Entity synthesis fields present (entityName, entityGuid)
- [ ] Events queryable via NRQL patterns in query-utils

## 🎯 Next Steps

1. **Update our test payloads** to match exact query-utils expectations
2. **Test with the actual NRQL queries** from query-utils
3. **Verify entities appear** in GraphQL entity search
4. **Confirm UI visibility** in Message Queues

The query-utils-zone has given us the exact blueprint. Now we need to ensure our events match what the UI frontend code expects to query.