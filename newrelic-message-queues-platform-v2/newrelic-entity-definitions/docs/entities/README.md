# Entity Documentation - Message Queues Platform

This document provides comprehensive documentation for the Message Queue entity types defined in the New Relic Message Queues Platform.

## Main Concepts

The Message Queues Platform implements a unified entity model for various messaging technologies, abstracting provider-specific differences while preserving unique capabilities.

## Entity Types Overview

### MESSAGE_QUEUE_CLUSTER

The cluster entity represents the top-level messaging infrastructure component that manages multiple brokers/nodes.

```yaml
domain: INFRA
type: MESSAGE_QUEUE_CLUSTER
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

### MESSAGE_QUEUE_BROKER

Individual broker or node within a messaging cluster.

```yaml
domain: INFRA
type: MESSAGE_QUEUE_BROKER
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

### MESSAGE_QUEUE_TOPIC

Represents a message topic or stream where messages are published.

```yaml
domain: INFRA
type: MESSAGE_QUEUE_TOPIC
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

### MESSAGE_QUEUE_QUEUE

Represents a message queue in systems like RabbitMQ or SQS.

```yaml
domain: INFRA
type: MESSAGE_QUEUE_QUEUE
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

### MESSAGE_QUEUE_CONSUMER_GROUP

Represents a group of consumers that coordinate to consume messages.

```yaml
domain: INFRA
type: MESSAGE_QUEUE_CONSUMER_GROUP
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

## Entity Metadata Schema

All message queue entities follow this metadata schema:

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

## Naming Conventions

- **Clusters**: `{environment}-{provider}-cluster-{region}[-{identifier}]`
- **Topics**: `{domain}.{entity}.{action}[.{version}]`
- **Queues**: `{service}-{action}-{environment}[-{qualifier}]`
- **Consumer Groups**: `{service}-{function}[-{instance}]`

## Configuration Options

For detailed configuration of each entity type:
- [GUID Specification](guid_spec.md)
- [Synthesis Rules](synthesis.md)
- [Golden Metrics](golden_metrics.md)
- [Entity Summary](entity_summary.md)

## Next Steps

1. Review the [synthesis rules](synthesis.md) to understand how entities are created from telemetry
2. Configure [golden metrics](golden_metrics.md) for your specific use cases
3. Set up [entity summaries](entity_summary.md) for dashboard visualization