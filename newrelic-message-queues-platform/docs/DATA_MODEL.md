# Message Queues Platform - Data Model Documentation

This document provides comprehensive documentation of the data model that gets streamed to New Relic when `platform.js` runs.

## Overview

The New Relic Message Queues Platform streams standardized `MessageQueue` events to New Relic for entity synthesis and observability. Each event represents a message queue infrastructure component with consistent structure, golden metrics, and relationships.

## Event Structure

All events share a common base structure:

```json
{
  "eventType": "MessageQueue",
  "timestamp": 1704067200000,
  "entity.guid": "MESSAGE_QUEUE_TYPE|accountId|provider|identifier",
  "entity.name": "entity-name",
  "entity.type": "MESSAGE_QUEUE_TYPE",
  "provider": "kafka",
  "accountId": "123456",
  "environment": "production"
}
```

## Entity Types

### MESSAGE_QUEUE_CLUSTER

Represents a message queue cluster (e.g., Kafka cluster).

**GUID Format:** `MESSAGE_QUEUE_CLUSTER|{accountId}|{provider}|{clusterName}`

**Golden Metrics:**
- `cluster.health.score` (percentage): Overall cluster health score
- `cluster.throughput.total` (messages/second): Total cluster throughput  
- `cluster.error.rate` (percentage): Cluster-wide error rate
- `cluster.availability` (percentage): Cluster availability percentage
- `brokerCount` (count): Number of brokers in cluster
- `topicCount` (count): Number of topics in cluster

**Sample Event:**
```json
{
  "eventType": "MessageQueue",
  "timestamp": 1704067200000,
  "entity.guid": "MESSAGE_QUEUE_CLUSTER|123456|kafka|cluster-prod",
  "entity.name": "cluster-prod",
  "entity.type": "MESSAGE_QUEUE_CLUSTER",
  "provider": "kafka",
  "accountId": "123456",
  "environment": "production",
  "clusterName": "cluster-prod",
  "cluster.health.score": 99.3,
  "cluster.throughput.total": 5100,
  "cluster.error.rate": 0.03,
  "cluster.availability": 97.4,
  "brokerCount": 3,
  "topicCount": 25
}
```

### MESSAGE_QUEUE_BROKER

Represents individual brokers/nodes in the cluster.

**GUID Format:** `MESSAGE_QUEUE_BROKER|{accountId}|{provider}|{clusterName}|{brokerId}`

**Golden Metrics:**
- `broker.cpu.usage` (percentage): CPU utilization
- `broker.memory.usage` (percentage): Memory utilization
- `broker.network.throughput` (bytes/second): Network throughput
- `broker.request.latency` (milliseconds): Average request latency
- `broker.disk.usage` (percentage): Disk utilization
- `broker.partition.count` (count): Number of partitions hosted

**Sample Event:**
```json
{
  "eventType": "MessageQueue",
  "timestamp": 1704067200000,
  "entity.guid": "MESSAGE_QUEUE_BROKER|123456|kafka|cluster-prod|broker-1",
  "entity.name": "broker-1",
  "entity.type": "MESSAGE_QUEUE_BROKER",
  "provider": "kafka",
  "accountId": "123456",
  "environment": "production",
  "clusterName": "cluster-prod",
  "brokerId": "1",
  "brokerHost": "kafka-broker-1.cluster-prod.kafka.svc.cluster.local",
  "brokerPort": 9092,
  "broker.cpu.usage": 63.4,
  "broker.memory.usage": 73.4,
  "broker.network.throughput": 58354609,
  "broker.request.latency": 20.8
}
```

### MESSAGE_QUEUE_TOPIC

Represents topics/queues in the system.

**GUID Format:** `MESSAGE_QUEUE_TOPIC|{accountId}|{provider}|{clusterName}|{topicName}`

**Golden Metrics:**
- `topic.throughput.in` (messages/second): Messages produced per second
- `topic.throughput.out` (messages/second): Messages consumed per second
- `topic.consumer.lag` (messages): Consumer lag in messages
- `topic.error.rate` (percentage): Topic-level error rate
- `topic.size.bytes` (bytes): Topic size in bytes
- `partitionCount` (count): Number of partitions

**Sample Event:**
```json
{
  "eventType": "MessageQueue",
  "timestamp": 1704067200000,
  "entity.guid": "MESSAGE_QUEUE_TOPIC|123456|kafka|cluster-prod|user-events",
  "entity.name": "user-events",
  "entity.type": "MESSAGE_QUEUE_TOPIC",
  "provider": "kafka",
  "accountId": "123456",
  "environment": "production",
  "clusterName": "cluster-prod",
  "topicName": "user-events",
  "partitionCount": 12,
  "replicationFactor": 3,
  "topic.throughput.in": 3020,
  "topic.throughput.out": 2899,
  "topic.consumer.lag": 0,
  "topic.error.rate": 0.1
}
```

### MESSAGE_QUEUE_CONSUMER

Represents consumer groups consuming from topics.

**GUID Format:** `MESSAGE_QUEUE_CONSUMER|{accountId}|{provider}|{clusterName}|{consumerGroupId}`

**Golden Metrics:**
- `consumer.lag.total` (messages): Total lag across all partitions
- `consumer.lag.max` (messages): Maximum lag on any partition
- `consumer.throughput` (messages/second): Messages consumed per second
- `consumer.commit.rate` (commits/second): Offset commit rate
- `consumer.error.rate` (percentage): Consumer error rate
- `consumer.rebalance.rate` (rebalances/hour): Rebalance frequency

**Sample Event:**
```json
{
  "eventType": "MessageQueue", 
  "timestamp": 1704067200000,
  "entity.guid": "MESSAGE_QUEUE_CONSUMER|123456|kafka|cluster-prod|analytics-consumer",
  "entity.name": "analytics-consumer",
  "entity.type": "MESSAGE_QUEUE_CONSUMER",
  "provider": "kafka",
  "accountId": "123456",
  "environment": "production",
  "clusterName": "cluster-prod",
  "consumerGroupId": "analytics-consumer",
  "topicName": "user-events",
  "memberCount": 3,
  "state": "Stable",
  "consumer.lag.total": 1250,
  "consumer.lag.max": 450,
  "consumer.throughput": 380.7,
  "consumer.commit.rate": 5.2
}
```

## Platform Modes

### Simulation Mode

**Entities Streamed:** CLUSTER, BROKER, TOPIC  
**Data Source:** Generated with realistic patterns  
**Frequency:** Every 60 seconds (configurable)  
**Typical Event Count:** 9 events per cycle (1 cluster + 3 brokers + 5 topics)

**Use Cases:**
- Development and testing
- Demos and proof-of-concepts
- Training and learning

### Infrastructure Mode

**Entities Streamed:** BROKER, TOPIC, CONSUMER  
**Data Source:** Real nri-kafka data via New Relic Infrastructure  
**Frequency:** Every 60 seconds (configurable)  
**Typical Event Count:** Variable based on actual topology

**Use Cases:**
- Production monitoring
- Real infrastructure observability
- Performance analysis

### Hybrid Mode

**Entities Streamed:** CLUSTER, BROKER, TOPIC, CONSUMER  
**Data Source:** Real data where available, simulated to fill gaps  
**Frequency:** Every 60 seconds (configurable)  
**Typical Event Count:** Variable, ensures complete topology coverage

**Use Cases:**
- Partial instrumentation environments
- Complete observability coverage
- Migration scenarios

## Relationships

Entities maintain hierarchical relationships:

```
CLUSTER
├── CONTAINS → BROKER (1:N)
├── CONTAINS → TOPIC (1:N)
└── CONTAINS → CONSUMER (1:N)

BROKER
├── CONTAINED_IN → CLUSTER (N:1)
└── HOSTS → TOPIC_PARTITION (1:N)

TOPIC  
├── CONTAINED_IN → CLUSTER (N:1)
├── CONSUMED_BY → CONSUMER (1:N)
└── PARTITIONED_TO → BROKER (N:M)

CONSUMER
├── CONTAINED_IN → CLUSTER (N:1)
└── CONSUMES → TOPIC (N:M)
```

## Viewing Live Data Model

### Command Line Options

View data model structure while platform runs:

```bash
# Display data model in console
node platform.js --mode simulation --show-data-model

# Save data model to JSON file  
node platform.js --mode simulation --save-data-model ./data-model.json

# Both display and save
node platform.js --mode simulation --show-data-model --save-data-model ./data-model.json
```

### Data Model Reference Tool

View complete data model documentation:

```bash
node tools/show-data-model.js
```

## Event Batching

Events are batched for efficient streaming:

```json
{
  "batchSize": 15,
  "timestamp": 1704067200000,
  "events": [
    // 1 cluster event
    { "entity.type": "MESSAGE_QUEUE_CLUSTER", ... },
    
    // 3 broker events  
    { "entity.type": "MESSAGE_QUEUE_BROKER", ... },
    { "entity.type": "MESSAGE_QUEUE_BROKER", ... },
    { "entity.type": "MESSAGE_QUEUE_BROKER", ... },
    
    // 8 topic events
    { "entity.type": "MESSAGE_QUEUE_TOPIC", ... },
    // ... more topics
    
    // 3 consumer events
    { "entity.type": "MESSAGE_QUEUE_CONSUMER", ... }
    // ... more consumers
  ]
}
```

## Tags and Metadata

All events include standardized tags:

```json
{
  "tag.environment": "production",
  "tag.region": "us-east-1", 
  "tag.datacenter": "us-east-1a",
  "tag.cluster": "cluster-prod",
  "tag.team": "platform",
  "tag.cost-center": "engineering"
}
```

## Multi-Cluster Support

When multi-cluster mode is enabled, the platform automatically discovers and monitors multiple Kafka clusters:

```bash
# Monitor all clusters
node platform.js --mode infrastructure --multi-cluster

# Monitor specific clusters  
node platform.js --mode infrastructure --multi-cluster --cluster-filter "prod-kafka-us,prod-kafka-eu"
```

Each cluster gets its own set of entities with cluster-specific GUIDs and metadata.

## File Locations

- **Data Model Documentation:** `/core/data-models/stream-data-model.js`
- **Data Model Extractor:** `/core/data-models/data-model-extractor.js`  
- **Entity Definitions:** `/core/entities/`
- **Reference Tool:** `/tools/show-data-model.js`
- **This Documentation:** `/docs/DATA_MODEL.md`

## Integration with New Relic

The streamed events enable:

1. **Entity Synthesis:** Automatic creation of MESSAGE_QUEUE_* entities in New Relic
2. **Golden Metrics:** Key performance indicators for each entity type
3. **Relationships:** Hierarchical topology visualization
4. **Alerting:** Threshold-based alerting on golden metrics
5. **Dashboards:** Automated dashboard generation using golden metrics
6. **Service Maps:** Visual representation of message flow and dependencies

## Examples

See the following files for complete examples:

- **Live Extraction:** Run platform with `--show-data-model`
- **Reference Implementation:** `/core/data-models/stream-data-model.js`
- **Entity Classes:** `/core/entities/message-queue-*.js`
- **Test Data:** Generate with `/tools/show-data-model.js`