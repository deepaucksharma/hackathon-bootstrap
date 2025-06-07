# UI Query Analysis Insights

## Critical Discoveries from query-utils-zone

After analyzing the query-utils files, here are the key insights for making AWS MSK appear in the Message Queues UI:

### 1. Entity Search Filters

The UI uses these exact filters to find AWS MSK entities:

```typescript
export const AWS_CLUSTER_QUERY_FILTER = "domain IN ('INFRA') AND type='AWSMSKCLUSTER'";
export const AWS_TOPIC_QUERY_FILTER = "domain IN ('INFRA') AND type='AWSMSKTOPIC'";
export const AWS_BROKER_QUERY_FILTER = "domain IN ('INFRA') AND type='AWSMSKBROKER'";
```

**Key Insight**: Entities MUST have:
- `domain`: "INFRA"
- `type`: One of the MSK types (AWSMSKCLUSTER, AWSMSKBROKER, AWSMSKTOPIC)

### 2. Event Types Used

From constants.ts:
```typescript
export const AWS_MSK_EVENT_TYPES = [
  'AwsMskBrokerSample',
  'AwsMskClusterSample',
  'AwsMskTopicSample',
];
```

**Key Insight**: The UI expects these specific event types, NOT MessageQueueSample.

### 3. Required Field Mappings

The queries show exact field requirements:

#### For Polling-based Data (DIM_QUERIES):
- Cluster: `provider.clusterName`
- Broker: `provider.brokerId`
- Topic: `provider.topic`
- Metrics: `provider.bytesInPerSec.Average`, etc.

#### For Metric Streams (MTS_QUERIES):
- Cluster: `aws.kafka.ClusterName OR aws.msk.clusterName`
- Broker: `aws.kafka.BrokerID OR aws.msk.brokerId`
- Topic: `aws.kafka.Topic OR aws.msk.topic`

**Key Insight**: Must support BOTH field naming conventions for maximum compatibility.

### 4. GraphQL Query for Entity Search

The UI uses this GraphQL query to fetch entities:

```typescript
awsEntitySearch: entitySearch(query: $awsQuery) {
  count
  results {
    accounts {
      id
      name
      reportingEventTypes(filter: "AwsMskBrokerSample")
    }
  }
}
```

**Key Insight**: Entities must be reporting the correct event types.

### 5. Nested Query Structure

The UI builds complex nested queries like:

```sql
FROM (
  SELECT average(provider.bytesInPerSec.Average) as 'bytesInPerSec'
  FROM AwsMskBrokerSample
  FACET provider.clusterName as cluster, provider.brokerId
  LIMIT MAX
)
SELECT sum(bytesInPerSec)
```

**Key Insight**: Events must contain all fields used in aggregations.

### 6. Entity Relationships

From GET_RELATED_APM_ENTITIES_FOR_TOPIC:
- Topics can have `consumedBy` and `producedBy` relationships
- These link to APM entities

**Key Insight**: Proper entity creation enables relationship mapping.

## Implementation Requirements

Based on this analysis, to make entities appear in the UI:

### 1. Create Proper Event Structure

```javascript
{
  eventType: "AwsMskClusterSample",  // Must use MSK event types
  entityGuid: "generated-guid",       // Required for entity creation
  entityName: "cluster-name",         // Human-readable name
  entityType: "AWSMSKCLUSTER",        // Must match expected types
  
  // Provider fields (for polling compatibility)
  "provider": "AwsMskCluster",
  "provider.clusterName": "cluster-name",
  
  // AWS fields (for metric stream compatibility)
  "aws.kafka.ClusterName": "cluster-name",
  "aws.msk.clusterName": "cluster-name",
  
  // Required for some queries
  "collector.name": "cloudwatch-metric-streams"
}
```

### 2. Include All Query Fields

Events must include all fields referenced in queries:
- Metrics: bytesInPerSec, bytesOutPerSec, messagesInPerSec
- Health: activeControllerCount, offlinePartitionsCount
- Identification: clusterName, brokerId, topic

### 3. Support Both Data Models

The UI supports two data models:
1. **Polling**: Uses AwsMsk*Sample events with provider.* fields
2. **Metric Streams**: Uses Metric events with aws.kafka.* fields

Our solution should provide both for maximum compatibility.

### 4. Entity Creation Flow

```
Events Submitted → Entity Synthesis → Entity Created → UI Query Finds Entity → Appears in UI
```

The critical step is entity synthesis, which requires:
- Correct event types
- Required fields
- Proper entity type designation

## The Solution

The `ui-compatible-payload-solution.js` implements all these requirements:

1. **Uses correct event types** (AwsMsk*Sample)
2. **Includes all required fields** for both polling and metric streams
3. **Generates consistent entity GUIDs**
4. **Provides entity synthesis triggers**
5. **Creates complete cluster/broker/topic hierarchy**

This approach ensures maximum compatibility with the Message Queues UI queries.