# Synthesis Rules - Message Queue Entities

Synthesis is the process of creating message queue entities from telemetry data. This document defines the rules for synthesizing each message queue entity type.

## Overview

Synthesis rules match telemetry data points to create entities. Each rule must identify:
- An `identifier` that uniquely identifies the entity
- A `name` for human-readable display
- `conditions` that must match for the rule to apply
- `tags` to copy from telemetry to the entity

## Entity Synthesis Rules

### MESSAGE_QUEUE_CLUSTER

```yaml
synthesis:
  rules:
    - identifier: clusterName
      name: clusterName
      encodeIdentifierInGUID: true
      conditions:
        - attribute: eventType
          value: KafkaClusterSample
        - attribute: provider
          value: kafka
      tags:
        environment:
        region:
        version:
```

For RabbitMQ clusters:
```yaml
synthesis:
  rules:
    - identifier: clusterName
      name: clusterName
      encodeIdentifierInGUID: true
      conditions:
        - attribute: eventType
          value: RabbitmqClusterSample
        - attribute: provider
          value: rabbitmq
```

### MESSAGE_QUEUE_BROKER

```yaml
synthesis:
  rules:
    # Kafka brokers
    - compositeIdentifier:
        separator: ":"
        attributes:
          - clusterName
          - broker.id
      name: displayName
      encodeIdentifierInGUID: true
      conditions:
        - attribute: eventType
          value: KafkaBrokerSample
        - attribute: broker.id
          present: true
      tags:
        hostname:
        port:
        rack:
    
    # RabbitMQ nodes
    - compositeIdentifier:
        separator: ":"
        attributes:
          - clusterName
          - node
      name: node
      encodeIdentifierInGUID: true
      conditions:
        - attribute: eventType
          value: RabbitmqNodeSample
```

### MESSAGE_QUEUE_TOPIC

```yaml
synthesis:
  rules:
    - compositeIdentifier:
        separator: ":"
        attributes:
          - clusterName
          - topic
      name: topic
      encodeIdentifierInGUID: true
      conditions:
        - attribute: eventType
          value: KafkaTopicSample
        - attribute: topic
          present: true
      tags:
        partitionCount:
        replicationFactor:
        retentionMs:
```

### MESSAGE_QUEUE_QUEUE

```yaml
synthesis:
  rules:
    # RabbitMQ queues
    - compositeIdentifier:
        separator: ":"
        attributes:
          - clusterName
          - vhost
          - queue.name
      name: queue.name
      encodeIdentifierInGUID: true
      conditions:
        - attribute: eventType
          value: RabbitmqQueueSample
      tags:
        vhost:
        durable:
        exclusive:
    
    # SQS queues
    - identifier: queueUrl
      name: queueName
      encodeIdentifierInGUID: true
      conditions:
        - attribute: eventType
          value: QueueSample
        - attribute: provider
          value: SqsQueue
      tags:
        aws.region:
        aws.accountId:
```

### MESSAGE_QUEUE_CONSUMER_GROUP

```yaml
synthesis:
  rules:
    - compositeIdentifier:
        separator: ":"
        attributes:
          - clusterName
          - consumerGroup
      name: consumerGroup
      encodeIdentifierInGUID: true
      conditions:
        - attribute: eventType
          value: KafkaOffsetSample
        - attribute: consumerGroup
          present: true
      tags:
        state:
        protocol:
        assignmentStrategy:
```

## Conditions

### Condition Types

**Attribute exists:**
```yaml
conditions:
  - attribute: broker.id
    present: true
```

**Exact value match:**
```yaml
conditions:
  - attribute: provider
    value: kafka
```

**Prefix match:**
```yaml
conditions:
  - attribute: metricName
    prefix: kafka.
```

**Multiple values (ANY):**
```yaml
conditions:
  - attribute: eventType
    anyOf: [KafkaBrokerSample, KafkaTopicSample]
```

### Provider-Specific Conditions

Different providers report different event types:

**Kafka:**
- `KafkaClusterSample`
- `KafkaBrokerSample`
- `KafkaTopicSample`
- `KafkaOffsetSample`

**RabbitMQ:**
- `RabbitmqClusterSample`
- `RabbitmqNodeSample`
- `RabbitmqQueueSample`
- `RabbitmqExchangeSample`

**AWS SQS:**
- `QueueSample` (with provider=SqsQueue)

## Tags

### Global Tags

Applied to all message queue entities:
```yaml
synthesis:
  tags:
    provider:
    environment:
    team:
    account:
    accountId:
```

### Entity-Specific Tags

**Cluster tags:**
- `version`: Software version
- `region`: Cloud region
- `availabilityZone`: AZ for cloud deployments

**Broker tags:**
- `hostname`: Broker hostname
- `port`: Service port
- `rack`: Kafka rack ID

**Topic/Queue tags:**
- `partitionCount`: Number of partitions
- `replicationFactor`: Replication level
- `retentionMs`: Message retention period

**Consumer Group tags:**
- `state`: Group state (Stable, Rebalancing, etc.)
- `protocol`: Partition assignment protocol
- `memberCount`: Number of active members

### Tag Configuration Options

**Single value tags:**
```yaml
tags:
  environment:
    multiValue: false
```

**TTL for temporary tags:**
```yaml
tags:
  state:
    ttl: P1H  # Remove after 1 hour if not reported
```

**Renamed tags:**
```yaml
tags:
  kafka.version:
    entityTagNames: [version, softwareVersion]
```

## Implementation Example

```typescript
const clusterSynthesisRule = {
  identifier: 'clusterName',
  name: 'clusterName',
  encodeIdentifierInGUID: true,
  conditions: [
    { attribute: 'eventType', value: 'KafkaClusterSample' },
    { attribute: 'provider', value: 'kafka' }
  ],
  tags: {
    environment: {},
    region: {},
    version: { multiValue: false }
  }
};

function matchesSynthesisRule(dataPoint: any, rule: any): boolean {
  // Check all conditions
  for (const condition of rule.conditions) {
    if (condition.value && dataPoint[condition.attribute] !== condition.value) {
      return false;
    }
    if (condition.present && !dataPoint[condition.attribute]) {
      return false;
    }
  }
  return true;
}

function synthesizeEntity(dataPoint: any, rule: any): Entity {
  if (!matchesSynthesisRule(dataPoint, rule)) {
    return null;
  }
  
  const identifier = dataPoint[rule.identifier];
  const name = dataPoint[rule.name];
  
  // Create entity with tags
  const entity = {
    identifier,
    name,
    tags: {}
  };
  
  // Copy configured tags
  for (const tagName in rule.tags) {
    if (dataPoint[tagName]) {
      entity.tags[tagName] = dataPoint[tagName];
    }
  }
  
  return entity;
}
```

## Best Practices

1. **Use composite identifiers** for entities that need multiple attributes for uniqueness
2. **Always use `encodeIdentifierInGUID: true`** to handle special characters
3. **Be specific with conditions** to avoid matching unrelated telemetry
4. **Include provider in conditions** when multiple providers share event types
5. **Tag strategically** - only include tags that provide value for filtering/grouping