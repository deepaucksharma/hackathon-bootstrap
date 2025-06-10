# New Relic Queues & Streaming - Data Model Specification

**Version:** 3.0 FINAL  
**Status:** Production-Ready Reference Architecture  
**Last Updated:** 2025-06-07  
**Purpose:** Complete data model reference for Message Queues Platform v2 implementation

---

## Executive Summary

This document defines the complete data model for New Relic's Queues & Streaming platform, providing a unified observability solution for heterogeneous messaging architectures. It serves as the authoritative reference for implementing the Message Queues Platform v2.

## Table of Contents

1. [Core Architecture](#core-architecture)
2. [Entity Model](#entity-model)
3. [Metrics Catalog](#metrics-catalog)
4. [Event Types](#event-types)
5. [Relationships](#relationships)
6. [Implementation Guide](#implementation-guide)

---

## Core Architecture

### Design Principles

1. **Unified Model**: Single conceptual model across all messaging technologies
2. **Provider Agnostic**: Abstract provider differences while preserving unique capabilities
3. **Scale First**: Built for enterprise scale from day one
4. **Intelligence Native**: AI/ML capabilities built into the platform
5. **Open Standards**: Embrace industry standards (OpenTelemetry, W3C trace context)

### Supported Technologies

| Technology | Provider | Integration Method | Maturity |
|------------|----------|-------------------|----------|
| Apache Kafka | Self-Managed | On-Host (JMX) | GA |
| Amazon MSK | AWS | CloudWatch Metrics | GA |
| Confluent Cloud | Confluent | REST API | GA |
| RabbitMQ | Self-Managed | Management API | GA |
| Amazon SQS | AWS | CloudWatch | GA |
| Azure Service Bus | Azure | Azure Monitor | Preview |
| Google Cloud Pub/Sub | GCP | Cloud Monitoring | Preview |

---

## Entity Model

### Entity Hierarchy

```
ACCOUNT
  └── CLUSTER
      ├── BROKER/NODE
      │   └── PARTITION
      ├── TOPIC/QUEUE
      │   └── PARTITION
      └── CONSUMER_GROUP
          └── CONSUMER
```

### Core Entity Types

#### MESSAGE_QUEUE_CLUSTER

```yaml
domain: INFRA
guid_pattern: "{accountId}|INFRA|MESSAGE_QUEUE_CLUSTER|{hash(clusterName)}"
key_attributes:
  - clusterName
  - provider
  - region (if cloud)
golden_metrics:
  - health.score
  - throughput.total
  - error.rate
  - availability.percentage
```

#### MESSAGE_QUEUE_BROKER

```yaml
domain: INFRA
guid_pattern: "{accountId}|INFRA|MESSAGE_QUEUE_BROKER|{hash(clusterId:brokerId)}"
key_attributes:
  - brokerId
  - hostname
  - clusterName
golden_metrics:
  - cpu.usage
  - memory.usage
  - network.throughput
  - request.latency
```

#### MESSAGE_QUEUE_TOPIC

```yaml
domain: INFRA
guid_pattern: "{accountId}|INFRA|MESSAGE_QUEUE_TOPIC|{hash(clusterId:topicName)}"
key_attributes:
  - topic
  - clusterName
  - partitionCount
golden_metrics:
  - throughput.in
  - throughput.out
  - consumer.lag
  - error.rate
```

#### MESSAGE_QUEUE_QUEUE

```yaml
domain: INFRA
guid_pattern: "{accountId}|INFRA|MESSAGE_QUEUE_QUEUE|{hash(provider:region:queueName)}"
key_attributes:
  - queueName
  - vhost (RabbitMQ)
  - queueUrl (SQS)
golden_metrics:
  - depth
  - throughput.in
  - throughput.out
  - processing.time
```

#### MESSAGE_QUEUE_CONSUMER_GROUP

```yaml
domain: INFRA
guid_pattern: "{accountId}|INFRA|MESSAGE_QUEUE_CONSUMER_GROUP|{hash(clusterId:groupId)}"
key_attributes:
  - groupId
  - clusterName
  - topicList
golden_metrics:
  - lag.total
  - lag.max
  - members.count
  - commit.rate
```

### Entity Metadata Schema

```json
{
  "entity": {
    "guid": "BASE64_ENCODED_GUID",
    "name": "human-readable-name",
    "entityType": "MESSAGE_QUEUE_TYPE",
    "domain": "INFRA",
    "reporting": true,
    "metadata": {
      "provider": "kafka|rabbitmq|sqs|etc",
      "clusterName": "cluster-identifier",
      "version": "software-version",
      "region": "cloud-region",
      "environment": "prod|staging|dev"
    },
    "tags": {
      "team": "owner-team",
      "sla": "99.99",
      "criticality": "high|medium|low"
    }
  }
}
```

### Naming Conventions

- **Clusters**: `{environment}-{provider}-cluster-{region}[-{identifier}]`
- **Topics**: `{domain}.{entity}.{action}[.{version}]`
- **Queues**: `{service}-{action}-{environment}[-{qualifier}]`
- **Consumer Groups**: `{service}-{function}[-{instance}]`

---

## Metrics Catalog

### Cluster Metrics

| Metric | Key | Unit | Type | Alert Threshold |
|--------|-----|------|------|-----------------|
| Health Score | `cluster.health.score` | 0-100 | Gauge | < 80 |
| Availability | `cluster.availability.percentage` | % | Gauge | < 100 |
| Total Throughput In | `cluster.throughput.in.bytesPerSec` | MB/s | Gauge | > 80% capacity |
| Total Throughput Out | `cluster.throughput.out.bytesPerSec` | MB/s | Gauge | > 80% capacity |
| Message Rate In | `cluster.messages.in.rate` | msgs/s | Gauge | Baseline + 3σ |
| Error Rate | `cluster.errors.rate` | errors/s | Gauge | > 1% of traffic |

### Broker/Node Metrics

| Metric | Key | Unit | Critical Value |
|--------|-----|------|----------------|
| CPU Usage | `broker.cpu.usage` | % | > 80 |
| Memory Usage | `broker.memory.usage` | % | > 90 |
| Network Throughput | `broker.network.throughput` | MB/s | > 80% NIC capacity |
| Partition Count | `broker.partition.count` | count | > 1000 |
| Leader Count | `broker.leader.count` | count | Imbalanced |
| Request Latency P99 | `broker.request.latency.p99` | ms | > 100 |

### Topic/Queue Metrics

| Metric | Key | Unit | Type |
|--------|-----|------|------|
| Messages In Rate | `topic.messages.in.rate` | msgs/s | Rate |
| Messages Out Rate | `topic.messages.out.rate` | msgs/s | Rate |
| Bytes In Rate | `topic.bytes.in.rate` | bytes/s | Rate |
| Bytes Out Rate | `topic.bytes.out.rate` | bytes/s | Rate |
| Consumer Lag Sum | `topic.consumer.lag.sum` | messages | Gauge |
| Partition Count | `topic.partition.count` | count | Gauge |

### Consumer Group Metrics

| Metric | Key | Unit | Business Impact |
|--------|-----|------|-----------------|
| Total Lag | `consumer.lag.total` | messages | Processing delay |
| Max Lag | `consumer.lag.max` | messages | Worst-case delay |
| Lag Trend | `consumer.lag.trend` | msgs/min | Catching up? |
| Member Count | `consumer.members.count` | count | Scaling indicator |
| Rebalance Rate | `consumer.rebalance.rate` | /hour | Stability |

---

## Event Types

### Event Registry

| Event Type | Entity | Frequency | Retention |
|------------|---------|-----------|-----------|
| `KafkaClusterSample` | Cluster | 60s | 30 days |
| `KafkaBrokerSample` | Broker | 15-30s | 8 days |
| `KafkaTopicSample` | Topic | 30s | 8 days |
| `KafkaOffsetSample` | Consumer Group | 60s | 8 days |
| `RabbitmqClusterSample` | Cluster | 60s | 30 days |
| `RabbitmqNodeSample` | Node | 30s | 8 days |
| `RabbitmqQueueSample` | Queue | 30s | 8 days |
| `QueueSample` | SQS Queue | 5m | 8 days |

### Sample Event Schema

#### KafkaBrokerSample

```json
{
  "eventType": "KafkaBrokerSample",
  "timestamp": 1717776000000,
  "entityGuid": "ENTITY_GUID",
  "provider": "kafka",
  "clusterName": "prod-cluster",
  "brokerId": 1,
  "metrics": {
    "broker.bytesInPerSecond": 1048576,
    "broker.bytesOutPerSecond": 2097152,
    "broker.messagesInPerSecond": 1000,
    "broker.partitionCount": 1500,
    "broker.underReplicatedPartitions": 0
  },
  "latency": {
    "request.produce.totalTimeMs.p99": 25.7,
    "request.fetch.totalTimeMs.p99": 45.2
  },
  "resources": {
    "cpu.user": 45.2,
    "memory.heap.used": 4096
  }
}
```

---

## Relationships

### Relationship Types

| Type | Description | Source → Target | Cardinality |
|------|-------------|-----------------|-------------|
| MANAGES | Administrative ownership | Cluster → Broker | 1:N |
| CONTAINS | Physical containment | Cluster → Topic | 1:N |
| HOSTS | Infrastructure hosting | Broker → Partition | 1:N |
| PRODUCES_TO | Producer relationship | Service → Topic | N:N |
| CONSUMES_FROM | Consumer relationship | Service → Topic | N:N |
| ROUTES_TO | Message routing | Exchange → Queue | N:N |

### Relationship Discovery

```yaml
kafka_relationships:
  cluster_to_broker:
    rule: "Broker reports clusterName matching cluster entity"
    relationship: "MANAGES"
    
  topic_to_partition:
    rule: "Partition reports topic name"
    relationship: "CONTAINS"
    
  service_to_topic:
    rule: "Trace contains messaging span with destination"
    relationship: "PRODUCES_TO or CONSUMES_FROM"
```

---

## Implementation Guide

### For Platform v2

This specification should be implemented in the following v2 components:

1. **Entity Synthesis** (`src/synthesizers/entity-synthesizer.ts`)
   - Implement all 5 entity types
   - Use correct GUID patterns
   - Include all metadata fields

2. **Metric Transformation** (`src/transformers/`)
   - Map provider metrics to standard catalog
   - Calculate derived metrics
   - Maintain metric precision

3. **Event Schemas** (`src/shared/types/`)
   - Define TypeScript interfaces for all event types
   - Validate required fields
   - Handle provider-specific extensions

4. **Relationship Management** (Not yet implemented)
   - Create relationship detection logic
   - Implement relationship storage
   - Enable relationship queries

### Data Flow Implementation

```typescript
// Example: Cluster Entity Synthesis
function synthesizeClusterEntity(brokers: BrokerMetrics[]): Entity {
  const clusterName = brokers[0].clusterName;
  const accountId = this.config.accountId;
  const provider = 'kafka';
  
  // Generate GUID per specification
  const guidComponents = `${clusterName}`;
  const hash = crypto.createHash('sha256').update(guidComponents).digest('hex');
  const entityGuid = `${accountId}|INFRA|MESSAGE_QUEUE_CLUSTER|${hash}`;
  
  // Calculate golden metrics
  const totalThroughputIn = brokers.reduce((sum, b) => sum + b.bytesInPerSecond, 0);
  const healthScore = calculateHealthScore(brokers);
  
  return {
    eventType: 'MessageQueue',
    entityType: 'MESSAGE_QUEUE_CLUSTER',
    entityGuid,
    entityName: clusterName,
    displayName: clusterName,
    provider,
    'cluster.health.score': healthScore,
    'cluster.throughput.in.bytesPerSec': totalThroughputIn,
    'cluster.broker.count': brokers.length,
    tags: {
      provider,
      environment: this.config.environment
    }
  };
}
```

### Metric Naming Conventions

All metrics must follow the hierarchical naming pattern:
- `{entityType}.{category}.{metric}[.{qualifier}]`
- Examples:
  - `cluster.throughput.in.bytesPerSec`
  - `broker.request.latency.p99`
  - `topic.consumer.lag.max`

### Next Steps for v2

1. **Complete Entity Coverage**: Implement MESSAGE_QUEUE_CLUSTER entity
2. **Standardize Metrics**: Align all metrics with this catalog
3. **Add Relationships**: Implement relationship detection and storage
4. **Validate Events**: Ensure all events match these schemas
5. **Test Coverage**: Validate against all provider types

---

## References

- [OpenTelemetry Semantic Conventions](https://opentelemetry.io/docs/reference/specification/semantic-conventions/)
- [New Relic Entity Synthesis](https://docs.newrelic.com/docs/new-relic-one/use-new-relic-one/core-concepts/what-entity-new-relic/)
- [NRQL Query Language](https://docs.newrelic.com/docs/query-your-data/nrql-new-relic-query-language/)

---

**Note**: This specification is based on the v3.0 FINAL production-ready reference architecture and should be treated as the authoritative source for all Message Queue Platform implementations.