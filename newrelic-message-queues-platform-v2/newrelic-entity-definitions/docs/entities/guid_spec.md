# GUID Specification - Message Queue Entities

## Overview

A `GUID` (Globally Unique Identifier) is the unique identifier for a message queue entity in New Relic. This document specifies how GUIDs are constructed for each message queue entity type.

## GUID Format

GUIDs follow a URL-safe Base64 encoded format composed of 4 segments delimited by a pipe (`|`):

```
{accountId}|{domain}|{type}|{identifier}
```

## Message Queue Entity GUID Patterns

### MESSAGE_QUEUE_CLUSTER

```
Pattern: {accountId}|INFRA|MESSAGE_QUEUE_CLUSTER|{hash(clusterName)}
Example: 123456|INFRA|MESSAGE_QUEUE_CLUSTER|a1b2c3d4
```

**Components:**
- `accountId`: New Relic account ID
- `domain`: Always `INFRA` for infrastructure entities
- `type`: `MESSAGE_QUEUE_CLUSTER`
- `identifier`: SHA256 hash of the cluster name

### MESSAGE_QUEUE_BROKER

```
Pattern: {accountId}|INFRA|MESSAGE_QUEUE_BROKER|{hash(clusterId:brokerId)}
Example: 123456|INFRA|MESSAGE_QUEUE_BROKER|e5f6g7h8
```

**Components:**
- `identifier`: SHA256 hash of `{clusterName}:{brokerId}` concatenation

### MESSAGE_QUEUE_TOPIC

```
Pattern: {accountId}|INFRA|MESSAGE_QUEUE_TOPIC|{hash(clusterId:topicName)}
Example: 123456|INFRA|MESSAGE_QUEUE_TOPIC|i9j0k1l2
```

**Components:**
- `identifier`: SHA256 hash of `{clusterName}:{topicName}` concatenation

### MESSAGE_QUEUE_QUEUE

```
Pattern: {accountId}|INFRA|MESSAGE_QUEUE_QUEUE|{hash(provider:region:queueName)}
Example: 123456|INFRA|MESSAGE_QUEUE_QUEUE|m3n4o5p6
```

**Components:**
- `identifier`: SHA256 hash of `{provider}:{region}:{queueName}` concatenation
- For non-cloud providers, omit region: `{provider}:{queueName}`

### MESSAGE_QUEUE_CONSUMER_GROUP

```
Pattern: {accountId}|INFRA|MESSAGE_QUEUE_CONSUMER_GROUP|{hash(clusterId:groupId)}
Example: 123456|INFRA|MESSAGE_QUEUE_CONSUMER_GROUP|q7r8s9t0
```

**Components:**
- `identifier`: SHA256 hash of `{clusterName}:{groupId}` concatenation

## Implementation Example

```typescript
function generateEntityGuid(
  accountId: string,
  entityType: string,
  ...identifierParts: string[]
): string {
  const domain = 'INFRA';
  const identifierString = identifierParts.filter(Boolean).join(':');
  const hash = crypto.createHash('sha256')
    .update(identifierString)
    .digest('hex')
    .substring(0, 8); // Use first 8 chars for readability
  
  return `${accountId}|${domain}|${entityType}|${hash}`;
}

// Example usage
const clusterGuid = generateEntityGuid(
  '123456',
  'MESSAGE_QUEUE_CLUSTER',
  'prod-kafka-cluster'
);
// Result: 123456|INFRA|MESSAGE_QUEUE_CLUSTER|a1b2c3d4

const brokerGuid = generateEntityGuid(
  '123456',
  'MESSAGE_QUEUE_BROKER',
  'prod-kafka-cluster',
  'broker-1'
);
// Result: 123456|INFRA|MESSAGE_QUEUE_BROKER|e5f6g7h8
```

## Guidelines

### Identifier Selection

1. **Uniqueness**: Identifiers MUST be unique within their domain, type, and account
2. **Stability**: Choose identifiers that don't change over the entity's lifetime
3. **Raw Values**: Use raw, unmodified attributes from telemetry
4. **Provider Agnostic**: Abstract provider-specific naming when possible

### Hashing Requirements

1. **Algorithm**: Use SHA256 for consistent hashing
2. **Input Format**: Concatenate components with `:` delimiter
3. **Case Sensitivity**: Maintain original case from source
4. **Null Handling**: Omit null/empty values from concatenation

### Multi-Provider Considerations

Different providers may use different naming:
- Kafka: `clusterName`, `brokerId`, `topicName`
- RabbitMQ: `clusterName`, `nodeName`, `queueName`, `vhost`
- SQS: `region`, `queueUrl`, `queueName`

Map provider-specific attributes to standard identifier components.

## Validation

GUIDs must meet these requirements:
- Account ID: Numeric, 1-10 digits
- Domain: `INFRA` (uppercase)
- Type: Valid MESSAGE_QUEUE_* type (uppercase)
- Identifier: Alphanumeric hash, 8-50 characters

## Entity Lifecycle

- Entities are created when first telemetry is received
- GUIDs remain stable throughout entity lifetime
- Entities expire after not reporting (configurable per type)
- Historical data remains queryable after entity expiration