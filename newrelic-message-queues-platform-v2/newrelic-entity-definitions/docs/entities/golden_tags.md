# Golden Tags - Message Queue Entities

Golden Tags are the most important metadata tags displayed for message queue entities, providing quick context and enabling efficient filtering.

## Overview

Golden tags appear prominently in the entity explorer and are used for:
- Quick entity identification
- Filtering and grouping
- Alert routing
- Dashboard variables

## MESSAGE_QUEUE_CLUSTER

```yaml
goldenTags:
  - provider
  - environment
  - region
  - version
  - datacenter
  - team
  - sla
```

### Tag Descriptions

- **provider**: Message queue technology (kafka, rabbitmq, sqs)
- **environment**: Deployment environment (production, staging, dev)
- **region**: Cloud region or datacenter location
- **version**: Software version of the message queue system
- **datacenter**: Physical or logical datacenter identifier
- **team**: Owning team for operational responsibility
- **sla**: Service level agreement tier (99.9, 99.99)

## MESSAGE_QUEUE_BROKER

```yaml
goldenTags:
  - clusterName
  - hostname
  - rack
  - port
  - state
  - controller
```

### Tag Descriptions

- **clusterName**: Parent cluster identifier
- **hostname**: Broker host machine name
- **rack**: Kafka rack ID for rack-aware replication
- **port**: Service port number
- **state**: Broker state (online, offline, maintenance)
- **controller**: Whether this broker is the controller (true/false)

## MESSAGE_QUEUE_TOPIC

```yaml
goldenTags:
  - clusterName
  - partitions
  - replicationFactor
  - minInSyncReplicas
  - retentionMs
  - compressionType
  - segment.ms
```

### Tag Descriptions

- **clusterName**: Parent cluster identifier
- **partitions**: Number of partitions
- **replicationFactor**: Number of replicas per partition
- **minInSyncReplicas**: Minimum ISR for writes
- **retentionMs**: Message retention period in milliseconds
- **compressionType**: Compression algorithm (none, gzip, snappy, lz4)
- **segment.ms**: Segment roll time

## MESSAGE_QUEUE_QUEUE

```yaml
goldenTags:
  - clusterName
  - vhost
  - durable
  - exclusive
  - autoDelete
  - messageCount
  - consumerCount
```

### Tag Descriptions

- **clusterName**: Parent cluster identifier
- **vhost**: RabbitMQ virtual host
- **durable**: Queue survives broker restart (true/false)
- **exclusive**: Exclusive to one connection (true/false)
- **autoDelete**: Auto-delete when unused (true/false)
- **messageCount**: Current message count
- **consumerCount**: Active consumer count

## MESSAGE_QUEUE_CONSUMER_GROUP

```yaml
goldenTags:
  - clusterName
  - state
  - protocol
  - assignmentStrategy
  - memberCount
  - topicCount
```

### Tag Descriptions

- **clusterName**: Parent cluster identifier
- **state**: Consumer group state (Stable, Rebalancing, Dead)
- **protocol**: Group protocol type
- **assignmentStrategy**: Partition assignment strategy
- **memberCount**: Number of active members
- **topicCount**: Number of subscribed topics

## Cross-Entity Common Tags

These tags should be consistently applied across all entity types when applicable:

```yaml
commonTags:
  - account
  - accountId
  - provider
  - environment
  - region
  - team
  - costCenter
  - businessUnit
  - application
  - service
```

## Provider-Specific Tags

### Kafka-Specific
```yaml
kafkaTags:
  - kafka.version
  - kafka.cluster.id
  - kafka.broker.id
  - kafka.log.dirs
  - kafka.security.protocol
```

### RabbitMQ-Specific
```yaml
rabbitmqTags:
  - rabbitmq.version
  - rabbitmq.erlang.version
  - rabbitmq.management.version
  - rabbitmq.cluster.name
  - rabbitmq.node.type
```

### AWS SQS-Specific
```yaml
sqsTags:
  - aws.accountId
  - aws.region
  - aws.queueType
  - aws.kmsMasterKeyId
  - aws.visibilityTimeout
```

## Tag Implementation

### Synthesis Configuration

```yaml
synthesis:
  tags:
    # Global tags for all entities
    provider:
    environment:
      multiValue: false
    team:
    
    # Provider-specific tags
    kafka.version:
      entityTagNames: [version, softwareVersion]
    
    # Cloud tags
    aws.region:
      entityTagNames: [region, awsRegion]
```

### Dynamic Tags

Some tags are calculated or derived:

```yaml
synthesis:
  tags:
    healthStatus:
      derive: |
        if health.score >= 90 then "healthy"
        elif health.score >= 70 then "degraded"
        else "critical"
    
    utilizationLevel:
      derive: |
        if cpu.usage >= 80 or memory.usage >= 80 then "high"
        elif cpu.usage >= 60 or memory.usage >= 60 then "medium"
        else "low"
```

## Tag Naming Conventions

1. **Use lowercase** with dots for namespacing: `kafka.version`
2. **Be consistent** across entity types: `clusterName` not `cluster`
3. **Avoid redundancy**: Don't prefix with entity type
4. **Keep concise**: Maximum 2-3 levels deep
5. **Standard units**: Always use same units (ms, bytes, etc.)

## Tag Priority

When selecting golden tags, prioritize:

1. **Identity** - Tags that identify the entity (clusterName, hostname)
2. **Operational** - Tags for daily operations (state, environment)
3. **Organizational** - Tags for ownership (team, costCenter)
4. **Technical** - Implementation details (version, protocol)
5. **Performance** - Tags indicating scale (partitions, memberCount)

## Best Practices

1. **Limit Count** - Maximum 10 golden tags per entity type
2. **Ensure Availability** - Only use tags that are reliably present
3. **Avoid High Cardinality** - Don't use unique values like timestamps
4. **Update Carefully** - Changing golden tags affects dashboards/alerts
5. **Document Changes** - Keep tag documentation current

## Tag Usage Examples

### Filtering in Explorer
```
provider:kafka AND environment:production AND region:us-east-1
```

### Alert Conditions
```
WHERE tags.environment = 'production' AND tags.sla = '99.99'
```

### Dashboard Variables
```sql
FROM MessageQueue 
SELECT uniques(tags.team) 
WHERE tags.provider = 'kafka'
```

### Faceted Queries
```sql
FROM MessageQueue 
SELECT average(cluster.health.score) 
FACET tags.environment, tags.region
```