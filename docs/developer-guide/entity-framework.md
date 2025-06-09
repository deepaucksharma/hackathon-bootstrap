# Entity Framework Guide

## Overview

The Entity Framework provides a consistent model for representing message queue infrastructure as New Relic entities. It bridges the gap between raw infrastructure data (from nri-kafka) and the standardized MESSAGE_QUEUE_* entity types.

## Entity Types

### MESSAGE_QUEUE_CLUSTER
Represents a logical grouping of message queue brokers.

**Key Attributes:**
- `entityType`: `MESSAGE_QUEUE_CLUSTER`
- `guid`: Unique identifier following pattern: `MESSAGE_QUEUE_CLUSTER|{accountId}|{provider}|{clusterName}`
- `name`: Human-readable cluster name
- `provider`: Message queue provider (kafka, rabbitmq, sqs, etc.)

**Golden Metrics:**
- `cluster.brokerCount`: Number of brokers in the cluster
- `cluster.throughput.messagesPerSecond`: Total message rate
- `cluster.throughput.bytesPerSecond`: Total data rate
- `cluster.health.score`: Calculated health score (0-100)

**Required Tags:**
- `provider`: kafka, rabbitmq, sqs, etc.
- `environment`: production, staging, development
- `region`: Geographic region

### MESSAGE_QUEUE_BROKER
Represents an individual message broker instance.

**Key Attributes:**
- `entityType`: `MESSAGE_QUEUE_BROKER`
- `guid`: Pattern: `MESSAGE_QUEUE_BROKER|{accountId}|{provider}|{clusterName}|{brokerId}`
- `brokerId`: Unique broker identifier
- `hostname`: Broker hostname

**Golden Metrics:**
- `broker.messagesInPerSecond`: Incoming message rate
- `broker.messagesOutPerSecond`: Outgoing message rate
- `broker.bytesInPerSecond`: Incoming data rate
- `broker.bytesOutPerSecond`: Outgoing data rate
- `broker.cpu.usage`: CPU utilization percentage
- `broker.memory.usage`: Memory usage percentage

**Required Tags:**
- `clusterName`: Parent cluster name
- `brokerId`: Broker identifier
- `rack`: Physical/logical location (if applicable)

### MESSAGE_QUEUE_TOPIC
Represents a message topic or queue.

**Key Attributes:**
- `entityType`: `MESSAGE_QUEUE_TOPIC`
- `guid`: Pattern: `MESSAGE_QUEUE_TOPIC|{accountId}|{provider}|{clusterName}|{topicName}`
- `topicName`: Topic/queue name
- `partitionCount`: Number of partitions (Kafka)
- `replicationFactor`: Replication factor (Kafka)

**Golden Metrics:**
- `topic.messagesInPerSecond`: Message production rate
- `topic.messagesOutPerSecond`: Message consumption rate
- `topic.bytesInPerSecond`: Data production rate
- `topic.bytesOutPerSecond`: Data consumption rate
- `topic.lag`: Consumer lag (messages)
- `topic.partitions.count`: Number of partitions

**Required Tags:**
- `clusterName`: Parent cluster name
- `topicName`: Topic identifier
- `retention`: Retention policy

### MESSAGE_QUEUE_CONSUMER_GROUP
Represents a consumer group for a topic.

**Key Attributes:**
- `entityType`: `MESSAGE_QUEUE_CONSUMER_GROUP`
- `guid`: Pattern: `MESSAGE_QUEUE_CONSUMER_GROUP|{accountId}|{provider}|{clusterName}|{topicName}|{groupId}`
- `groupId`: Consumer group identifier
- `memberCount`: Number of active consumers

**Golden Metrics:**
- `consumerGroup.lag`: Total lag across all partitions
- `consumerGroup.messageRate`: Consumption rate
- `consumerGroup.members`: Active member count
- `consumerGroup.partitions.assigned`: Assigned partition count

## Entity Relationships

```
┌─────────────────────┐
│ MESSAGE_QUEUE_      │
│ CLUSTER             │
└─────────┬───────────┘
          │ contains
          ▼
┌─────────────────────┐
│ MESSAGE_QUEUE_      │
│ BROKER              │
└─────────┬───────────┘
          │ hosts
          ▼
┌─────────────────────┐
│ MESSAGE_QUEUE_      │
│ TOPIC               │
└─────────┬───────────┘
          │ consumed by
          ▼
┌─────────────────────┐
│ MESSAGE_QUEUE_      │
│ CONSUMER_GROUP      │
└─────────────────────┘
```

## Transformation from nri-kafka

### KafkaBrokerSample → MESSAGE_QUEUE_BROKER

```javascript
// infrastructure/transformers/nri-kafka-transformer.js
transformBroker(sample) {
  return {
    entityType: 'MESSAGE_QUEUE_BROKER',
    guid: `MESSAGE_QUEUE_BROKER|${sample.accountId}|kafka|${sample.clusterName}|${sample.broker.id}`,
    name: `Kafka Broker ${sample.broker.id}`,
    provider: 'kafka',
    metrics: {
      'broker.messagesInPerSecond': sample['broker.messagesInPerSecond'],
      'broker.messagesOutPerSecond': sample['broker.messagesOutPerSecond'],
      'broker.bytesInPerSecond': sample['broker.bytesInPerSecond'],
      'broker.bytesOutPerSecond': sample['broker.bytesOutPerSecond'],
      'broker.cpu.usage': 100 - sample['broker.IOWaitPercent'],
      'broker.memory.usage': sample['broker.JVMMemoryUsedPercent']
    },
    tags: {
      clusterName: sample.clusterName,
      brokerId: sample.broker.id,
      kafkaVersion: sample.kafkaVersion,
      environment: this.inferEnvironment(sample.clusterName)
    }
  };
}
```

### KafkaTopicSample → MESSAGE_QUEUE_TOPIC

```javascript
transformTopic(sample) {
  return {
    entityType: 'MESSAGE_QUEUE_TOPIC',
    guid: `MESSAGE_QUEUE_TOPIC|${sample.accountId}|kafka|${sample.clusterName}|${sample.topic.name}`,
    name: sample.topic.name,
    provider: 'kafka',
    metrics: {
      'topic.messagesInPerSecond': sample['topic.messagesInPerSecond'],
      'topic.bytesInPerSecond': sample['topic.bytesInPerSecond'],
      'topic.partitions.count': sample['topic.partitionCount'],
      'topic.replicationFactor': sample['topic.replicationFactor'],
      'topic.retentionMs': sample['topic.retentionMs'],
      'topic.sizeBytes': sample['topic.diskSize']
    },
    tags: {
      clusterName: sample.clusterName,
      topicName: sample.topic.name,
      partitionCount: sample['topic.partitionCount']
    }
  };
}
```

### Cluster Aggregation

```javascript
createClusterFromBrokers(brokerSamples) {
  const clusterName = brokerSamples[0].clusterName;
  const accountId = brokerSamples[0].accountId;
  
  return {
    entityType: 'MESSAGE_QUEUE_CLUSTER',
    guid: `MESSAGE_QUEUE_CLUSTER|${accountId}|kafka|${clusterName}`,
    name: clusterName,
    provider: 'kafka',
    metrics: {
      'cluster.brokerCount': brokerSamples.length,
      'cluster.throughput.messagesPerSecond': this.sum(brokerSamples, 'broker.messagesInPerSecond'),
      'cluster.throughput.bytesPerSecond': this.sum(brokerSamples, 'broker.bytesInPerSecond'),
      'cluster.health.score': this.calculateHealthScore(brokerSamples)
    },
    tags: {
      clusterName: clusterName,
      brokerCount: brokerSamples.length,
      kafkaVersion: brokerSamples[0].kafkaVersion,
      environment: this.inferEnvironment(clusterName)
    }
  };
}
```

## Entity Factory Usage

### Creating Entities Programmatically

```javascript
const { EntityFactory } = require('./core/entities');

const factory = new EntityFactory({
  defaultProvider: 'kafka',
  defaultAccountId: process.env.NEW_RELIC_ACCOUNT_ID
});

// Create a cluster
const cluster = factory.createCluster({
  name: 'production-kafka',
  environment: 'production',
  region: 'us-east-1'
});

// Create brokers
const brokers = [];
for (let i = 1; i <= 3; i++) {
  const broker = factory.createBroker({
    brokerId: i,
    hostname: `kafka-broker-${i}.example.com`,
    clusterName: cluster.name,
    port: 9092
  });
  brokers.push(broker);
}

// Create topics
const topic = factory.createTopic({
  topic: 'user-events',
  clusterName: cluster.name,
  partitions: 12,
  replicationFactor: 3
});
```

## GUID Format Specification

GUIDs must follow this exact format for entity synthesis:

```
{ENTITY_TYPE}|{accountId}|{provider}|{hierarchical_identifiers}
```

Examples:
- `MESSAGE_QUEUE_CLUSTER|12345|kafka|prod-kafka-cluster`
- `MESSAGE_QUEUE_BROKER|12345|kafka|prod-kafka-cluster|broker-1`
- `MESSAGE_QUEUE_TOPIC|12345|kafka|prod-kafka-cluster|user-events`
- `MESSAGE_QUEUE_CONSUMER_GROUP|12345|kafka|prod-kafka-cluster|user-events|payment-processor`

## Entity Synthesis Requirements

For entities to be properly synthesized in New Relic:

1. **GUID Format**: Must match the pattern exactly
2. **Required Tags**: All required tags must be present
3. **Event Type**: Must use `MessageQueue` event type
4. **Metric Names**: Follow the dot notation convention
5. **Relationships**: Parent entities must exist

## Query Patterns

### Finding Entities

```nrql
-- Find all Kafka clusters
FROM MessageQueue 
SELECT uniqueCount(entityGuid) 
WHERE entityType = 'MESSAGE_QUEUE_CLUSTER' 
AND provider = 'kafka'
FACET clusterName

-- Find unhealthy brokers
FROM MessageQueue 
SELECT latest(broker.cpu.usage), latest(broker.memory.usage) 
WHERE entityType = 'MESSAGE_QUEUE_BROKER' 
AND broker.cpu.usage > 80 
FACET entityGuid
```

### Relationship Queries

```nrql
-- Topics by cluster
FROM MessageQueue 
SELECT uniqueCount(topicName) 
WHERE entityType = 'MESSAGE_QUEUE_TOPIC' 
FACET clusterName

-- Consumer lag by topic
FROM MessageQueue 
SELECT latest(consumerGroup.lag) 
WHERE entityType = 'MESSAGE_QUEUE_CONSUMER_GROUP' 
FACET topicName, groupId
```

## Best Practices

1. **Consistent Naming**: Use lowercase with hyphens for names
2. **Tag Strategy**: Include environment, team, and criticality tags
3. **Metric Units**: Always use consistent units (bytes, messages, percentage)
4. **Time Windows**: Use appropriate time windows for different entity types
5. **Relationships**: Always maintain parent-child relationships

## Extending the Framework

### Adding Custom Entity Types

```javascript
class MessageQueueStream extends BaseEntity {
  constructor(config) {
    super({
      ...config,
      entityType: 'MESSAGE_QUEUE_STREAM'
    });
  }
  
  getRequiredTags() {
    return ['streamId', 'processorType'];
  }
  
  getGoldenMetrics() {
    return [
      'stream.recordsPerSecond',
      'stream.processingLatency',
      'stream.errorRate'
    ];
  }
}
```

### Provider-Specific Extensions

```javascript
// RabbitMQ-specific entity
class RabbitMQExchange extends BaseEntity {
  constructor(config) {
    super({
      ...config,
      entityType: 'MESSAGE_QUEUE_EXCHANGE',
      provider: 'rabbitmq'
    });
  }
  
  generateGuid() {
    return `MESSAGE_QUEUE_EXCHANGE|${this.accountId}|rabbitmq|${this.vhost}|${this.exchangeName}`;
  }
}