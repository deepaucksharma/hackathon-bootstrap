# Entity Platform Architecture for Kafka/MSK Integration

## Overview

The Entity Platform serves as the critical abstraction layer that unifies disparate Kafka monitoring data sources into a cohesive, queryable, and relationship-aware system. This document details how the Entity Platform transforms raw telemetry into meaningful entities that power the New Relic UI.

## Entity Platform Components

### 1. Entity Synthesis Engine

```yaml
Purpose: Transform raw events into entities

Core Functions:
  - Event Pattern Matching
  - Entity Creation/Update
  - GUID Generation
  - Attribute Mapping
  - Relationship Discovery

Synthesis Flow:
  1. Event Ingestion
     ├── KafkaBrokerSample
     ├── AwsMskClusterSample
     └── Other event types
     
  2. Rule Evaluation
     ├── Match event patterns
     ├── Extract entity attributes
     └── Determine entity type
     
  3. Entity Creation
     ├── Generate GUID
     ├── Set domain/type
     ├── Map attributes
     └── Store in registry
```

### 2. Synthesis Rules for Kafka/MSK

#### Cluster Synthesis Rules

```json
{
  "rule": "kafka-cluster-synthesis",
  "input": {
    "eventType": "KafkaBrokerSample",
    "conditions": [
      "clusterName IS NOT NULL",
      "broker.id = 1"  // Use first broker as cluster representative
    ]
  },
  "output": {
    "domain": "INFRA",
    "type": "KAFKACLUSTER",
    "name": "${clusterName}",
    "guid": "${accountId}|INFRA|KAFKACLUSTER|${base64(clusterName)}",
    "attributes": {
      "provider": "Kafka",
      "clusterName": "${clusterName}",
      "bootstrapServers": "${broker.host}:${broker.port}"
    }
  }
}
```

#### MSK Cluster Synthesis Rules

```json
{
  "rule": "msk-cluster-synthesis",
  "input": {
    "eventType": "AwsMskClusterSample",
    "conditions": [
      "entityName IS NOT NULL",
      "provider.clusterArn IS NOT NULL"
    ]
  },
  "output": {
    "domain": "INFRA",
    "type": "AWSMSKCLUSTER",
    "name": "${entityName}",
    "guid": "${entityGuid}",  // Use provided GUID
    "attributes": {
      "provider": "AwsMsk",
      "clusterArn": "${provider.clusterArn}",
      "clusterState": "${provider.clusterState}",
      "region": "${aws.region}",
      "awsAccountId": "${aws.accountId}"
    }
  }
}
```

#### MessageQueueSample Generation Rules

```json
{
  "rule": "messagequeue-generation",
  "triggers": [
    "entity.created",
    "entity.updated",
    "metrics.received"
  ],
  "input": {
    "entityTypes": [
      "KAFKACLUSTER", "AWSMSKCLUSTER",
      "KAFKABROKER", "AWSMSKBROKER",
      "KAFKATOPIC", "AWSMSKTOPIC"
    ]
  },
  "output": {
    "eventType": "MessageQueueSample",
    "mapping": {
      "provider": "entity.tags.provider || inferProvider(entity.type)",
      "entity.guid": "entity.guid",
      "entity.name": "entity.name",
      "entity.type": "entity.type",
      "queue.name": "entity.name",
      "queue.type": "mapQueueType(entity.type)",
      "metrics": "latestMetrics(entity.guid)"
    }
  }
}
```

### 3. Entity Registry

```yaml
Data Model:
  Entity:
    - guid: string (primary key)
    - accountId: number
    - domain: string
    - type: string
    - name: string
    - reporting: boolean
    - metadata: json
    - tags: map<string, string>
    - relationships: array<Relationship>
    - lastSeen: timestamp
    - createdAt: timestamp

Indexes:
  - (accountId, domain, type) -> entity list
  - (accountId, name) -> entity
  - (guid) -> entity
  - (accountId, reporting) -> active entities
```

### 4. Relationship Management

```yaml
Relationship Types:
  CONTAINS:
    - KAFKACLUSTER -> KAFKABROKER
    - KAFKACLUSTER -> KAFKATOPIC
    - AWSMSKCLUSTER -> AWSMSKBROKER
    - AWSMSKCLUSTER -> AWSMSKTOPIC
    
  HOSTS:
    - KAFKABROKER -> KAFKATOPIC (partitions)
    - AWSMSKBROKER -> AWSMSKTOPIC (partitions)
    
  CONSUMES_FROM:
    - KAFKACONSUMERGROUP -> KAFKATOPIC
    - APPLICATION -> KAFKACLUSTER
    
  PRODUCES_TO:
    - APPLICATION -> KAFKATOPIC

Relationship Discovery:
  1. Parent-Child from Names:
     - "1:my-cluster" -> broker 1 of "my-cluster"
     - "my-cluster:my-topic" -> topic in "my-cluster"
     
  2. Explicit Relationships:
     - parentClusterGuid field
     - parentCluster field
     
  3. Inferred Relationships:
     - Same cluster name across entities
     - Broker ID patterns
```

### 5. Entity Lifecycle Management

```yaml
Creation:
  Trigger: First matching event received
  Process:
    1. Apply synthesis rules
    2. Generate GUID
    3. Create entity record
    4. Establish relationships
    5. Emit MessageQueueSample

Updates:
  Trigger: New events for existing entity
  Process:
    1. Update lastSeen timestamp
    2. Merge new attributes
    3. Update metrics
    4. Emit MessageQueueSample

Deletion:
  Trigger: No events for TTL period
  Process:
    1. Mark as non-reporting
    2. After grace period, delete
    3. Clean up relationships
```

## MessageQueueSample Generation

### Why MessageQueueSample?

1. **UI Contract**: The Message Queues UI specifically queries this event type
2. **Normalization**: Provides consistent schema across all queue technologies
3. **Performance**: Pre-aggregated data for UI queries
4. **Flexibility**: Decouples UI from specific integration formats

### Generation Pipeline

```python
def generate_message_queue_sample(entity, metrics):
    return {
        "eventType": "MessageQueueSample",
        "provider": determine_provider(entity),
        "entity.guid": entity.guid,
        "entity.name": entity.name,
        "entity.type": entity.type,
        "queue.name": format_queue_name(entity),
        "queue.type": map_queue_type(entity.type),
        **normalize_metrics(metrics),
        "collector.name": infer_collector(entity),
        "timestamp": current_timestamp()
    }

def normalize_metrics(metrics):
    return {
        "queue.messagesPerSecond": metrics.get("messagesInPerSec", 0),
        "queue.bytesInPerSecond": metrics.get("bytesInPerSec", 0),
        "queue.bytesOutPerSecond": metrics.get("bytesOutPerSec", 0),
        "queue.consumerLag": metrics.get("totalLag", 0),
        "queue.brokerCount": metrics.get("brokerCount"),
        "queue.topicCount": metrics.get("topicCount")
    }
```

## Query Interface

### GraphQL Entity API

```graphql
query GetKafkaEntities {
  actor {
    entitySearch(
      query: "domain = 'INFRA' AND type IN ('KAFKACLUSTER', 'AWSMSKCLUSTER')"
    ) {
      results {
        entities {
          guid
          name
          type
          reporting
          tags {
            key
            values
          }
          relationships {
            type
            target {
              entity {
                guid
                name
                type
              }
            }
          }
        }
      }
    }
  }
}
```

### NRQL Query Patterns

```sql
-- Get all Kafka/MSK clusters with metrics
FROM MessageQueueSample 
SELECT 
  latest(queue.messagesPerSecond) as 'Messages/sec',
  latest(queue.brokerCount) as 'Brokers',
  latest(queue.topicCount) as 'Topics'
WHERE provider IN ('Kafka', 'AwsMsk')
AND entity.type IN ('KAFKACLUSTER', 'AWSMSKCLUSTER')
FACET entity.name
SINCE 1 hour ago

-- Get broker-level details
FROM MessageQueueSample
SELECT 
  rate(sum(queue.messagesPerSecond), 1 minute) as 'Message Rate',
  average(queue.consumerLag) as 'Avg Lag'
WHERE entity.type IN ('KAFKABROKER', 'AWSMSKBROKER')
FACET entity.name
TIMESERIES
```

## Integration Points

### 1. Infrastructure Agent Integration

```yaml
Integration Flow:
  1. nri-kafka runs as integration
  2. Collects JMX metrics
  3. Sends events to Infrastructure Agent
  4. Agent forwards to platform
  5. Entity synthesis processes events
```

### 2. CloudWatch Integration

```yaml
Integration Flow:
  1. CloudWatch Metric Streams configured
  2. Metrics flow to NR endpoint
  3. Transformed to AwsMsk*Sample events  
  4. Entity synthesis processes events
  5. MSK entities created/updated
```

### 3. APM Integration

```yaml
Integration Flow:
  1. APM agents detect Kafka clients
  2. Transaction events include Kafka metadata
  3. Entity platform creates relationships
  4. APM UI shows Kafka dependencies
```

## Benefits of Entity Platform Approach

1. **Abstraction**: Hides complexity of different data sources
2. **Consistency**: Uniform entity model across technologies
3. **Relationships**: Rich topology understanding
4. **Extensibility**: Easy to add new Kafka providers
5. **Performance**: Optimized queries via MessageQueueSample
6. **Governance**: Centralized entity lifecycle management

## Future Enhancements

1. **Smart Synthesis**: ML-based entity discovery
2. **Auto-Remediation**: Entity-triggered automation
3. **Cross-Account**: Federated entity management
4. **Enhanced Discovery**: Discover Kafka from APM traces
5. **Topology Visualization**: Graph-based UI views